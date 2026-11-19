import { readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

// Isolated PostgreSQL/WASM for the local R2 RPC. Never connects to Supabase. Ordinary users run as
// role authenticated with JWT claims; permission helpers and the estado trigger are the latest real definitions.
const { PGlite } = await import(pathToFileURL(process.env.WHATSAPP_PGLITE_PATH).href)
const migrationFile = 'supabase/migrations/20261120120000_agent_apply_action_status.sql'
const rollbackFile = 'supabase/scripts/rollback_agent_apply_action_status.sql'
const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
const read = (file) => readFileSync(file, 'utf8').replace(/^\uFEFF/, '')

function latest(name) {
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$[^;]*;`, 'gi')
  for (const file of [...migrations].reverse()) {
    if (file >= '20261120120000') continue
    const found = [...read(`supabase/migrations/${file}`).matchAll(re)]
    // Every overload defined in the newest file that touches the function.
    if (found.length) return found.map((m) => m[0]).join('\n')
  }
  throw new Error(`definition not found: ${name}`)
}

const schema = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role',true),''); $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  create type action_status as enum ('Pendiente','En_Ejecucion','Bloqueado','Hecho','Verificado','Retraso');
  create table usuarios(id uuid primary key, user_id uuid unique, nombre text, rol text, activo boolean default true, area text);
  create table user_roles(user_id uuid, app_role text);
  create table catalog_roles(id uuid primary key, nombre text, system_key text, activo boolean default true);
  create table usuario_catalog_roles(user_id uuid, role_id uuid);
  create table areas(id uuid primary key, nombre text);
  create table usuario_areas(user_id uuid, area_id uuid);
  create table acciones_diarias(
    id uuid primary key, titulo_accion text, descripcion_accion text, estado action_status default 'Pendiente',
    fecha date, hora_limite text, responsable uuid, created_by uuid, updated_by uuid, evidencia_esperada text,
    kpi_afectado text, gap_id uuid, tipo_accion text, story_points int, catalog_kpi_id uuid, okr_impactado text,
    proceso text, area text, cliente_id uuid, prioridad text, prioridad_id uuid, causa_raiz text,
    responsable_bloqueo uuid, escalado boolean, fecha_escalamiento date, notas_escalamiento text, repeticion text,
    verificador_dato text, verificador_gobierno text, sprint_id uuid, completed_at timestamptz, completed_by uuid,
    verified_at timestamptz, verified_by uuid, updated_at timestamptz not null default clock_timestamp());
  create table accion_checkpoints(id uuid primary key, accion_id uuid, texto text, activo boolean default true,
    completado boolean default false, checked_at timestamptz, checked_by uuid, responsable_id uuid, orden int,
    obligatorio boolean default true, created_by uuid);
  create table accion_comentarios(id uuid primary key default gen_random_uuid(), accion_id uuid, contenido text,
    created_by uuid, tipo_comentario text);
  create function touch_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at := clock_timestamp(); return new; end; $$;
  create trigger touch_updated_at before update on acciones_diarias for each row execute function touch_updated_at();
`

const helpers = [
  'get_my_usuario_id', 'normalize_business_role', 'has_business_role', 'is_app_admin', 'is_current_user_super_admin', 'is_business_analyst', 'is_app_admin_usuario',
  'is_action_privileged_usuario', 'is_business_admin_usuario', 'has_kanban_action_editor_role',
  'can_edit_accion_general_as', 'can_manage_accion_full_as', 'can_close_accion_as',
  'can_auto_close_accion_from_completed_checklist_as', 'try_set_accion_hecho',
  'acciones_diarias_guard_estado_permissions_and_audit', 'is_current_user_direction', 'is_explicit_privilege_admin',
]

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const U = { resp: id(1), creator: id(2), analyst: id(3), director: id(4), other: id(5), inactive: id(6), admin: id(7) }
const A = { open: id(101), done: id(102), verified: id(103), analyst: id(104), director: id(105), creatorBlock: id(106) }
const authOf = (usuarioId) => usuarioId.replace(/^0/, 'a')

let db
const passed = []
const check = async (label, fn) => { await fn(); passed.push(label); console.log(`ok - ${label}`) }
const query = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await query(sql, params))[0]
const claims = (sub, role) =>
  query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)", [sub, role])
const asUser = async (usuarioId) => { await db.exec('reset role'); await claims(authOf(usuarioId), 'authenticated'); await db.exec('set role authenticated') }
const asAnon = async () => { await db.exec('reset role'); await claims('', 'anon'); await db.exec('set role anon') }
const asOwner = async () => { await db.exec('reset role'); await claims('', '') }

let opSeq = 0
async function op(usuarioId, tool, payload, expectedUpdatedAt, status = 'executing') {
  await asOwner()
  const opId = id(1000 + ++opSeq)
  await query(`insert into assistant_pending_ops(id,usuario_id,tool,resource_id,expected_updated_at,payload,status,expires_at)
    values ($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,
  [opId, usuarioId, tool, payload.accionId, expectedUpdatedAt, JSON.stringify(payload), status])
  return opId
}
const stamp = async (accionId) => { await asOwner(); return (await one('select updated_at from acciones_diarias where id=$1', [accionId])).updated_at }
async function apply(usuarioId, opId, accionId, estado, motivo, expected) {
  await asUser(usuarioId)
  try {
    return (await one('select public.agent_apply_action_status($1,$2,$3,$4,$5) as r', [opId, accionId, estado, motivo ?? null, expected])).r
  } finally {
    await asOwner()
  }
}

try {
  await check('Migration refuses to apply without its dependencies', async () => {
    db = new PGlite()
    await db.exec(schema)
    await assert.rejects(db.exec(read(migrationFile)), /Apply assistant_pending_ops/)
    await db.close()
  })

  db = new PGlite()
  await db.exec(schema)
  await db.exec('set check_function_bodies = off')
  for (const name of helpers) await db.exec(latest(name))
  await db.exec('set check_function_bodies = on')
  await db.exec(`create trigger acciones_diarias_guard_estado before insert or update on acciones_diarias
    for each row execute function acciones_diarias_guard_estado_permissions_and_audit()`)
  for (const file of ['20261103210000_assistant_ops.sql', '20261103230000_assistant_pending_ops_immutable_payload.sql',
    '20261117130000_assistant_pending_request_key.sql']) await db.exec(read(`supabase/migrations/${file}`))
  await db.exec(latest('assistant_pending_ops_guard_update'))
  await db.exec(`alter table assistant_pending_ops add column if not exists session_id text, add column if not exists channel text;
    grant select, update on acciones_diarias, accion_checkpoints to authenticated;
    grant select on usuarios, user_roles, catalog_roles, usuario_catalog_roles to authenticated`)

  await db.exec(`
    insert into usuarios(id,user_id,nombre,rol,activo) values
      ('${U.resp}','${authOf(U.resp)}','Responsable','Operativo',true),
      ('${U.creator}','${authOf(U.creator)}','Creadora','Lider',true),
      ('${U.analyst}','${authOf(U.analyst)}','Analista','Analista',true),
      ('${U.director}','${authOf(U.director)}','Directora','Direccion',true),
      ('${U.other}','${authOf(U.other)}','Ajeno','Operativo',true),
      ('${U.inactive}','${authOf(U.inactive)}','Inactivo','Operativo',false),
      ('${U.admin}','${authOf(U.admin)}','Admin','super_admin',true);
    insert into acciones_diarias(id,titulo_accion,estado,responsable,created_by) values
      ('${A.open}','Abierta','Pendiente','${U.resp}','${U.creator}'),
      ('${A.done}','Con checklist','En_Ejecucion','${U.resp}','${U.creator}'),
      ('${A.verified}','Verificada','Verificado','${U.resp}','${U.creator}'),
      ('${A.analyst}','De analista','Pendiente','${U.analyst}','${U.creator}'),
      ('${A.director}','De direccion','Pendiente','${U.director}','${U.creator}'),
      ('${A.creatorBlock}','Bloqueo de creadora','Pendiente','${U.resp}','${U.creator}');
    insert into accion_checkpoints(id,accion_id,texto) values ('${id(201)}','${A.done}','Paso obligatorio');
  `)

  await db.exec(read(migrationFile))
  await db.exec(read(migrationFile))
  passed.push('Migration 20261120120000 applies and is idempotent')

  await check('Grants: anon cannot execute; authenticated can; receipts are not writable by clients', async () => {
    assert.equal((await one("select has_function_privilege('anon','public.agent_apply_action_status(uuid,uuid,text,text,timestamptz)','execute') v")).v, false)
    assert.equal((await one("select has_function_privilege('authenticated','public.agent_apply_action_status(uuid,uuid,text,text,timestamptz)','execute') v")).v, true)
    assert.equal((await one("select has_table_privilege('authenticated','public.agent_action_receipts','insert') v")).v, false)
    await asAnon()
    await assert.rejects(query('select public.agent_apply_action_status($1,$2,$3)', [id(9), A.open, 'Hecho']), /permission denied/)
    await asOwner()
  })

  await check('update_status: the responsable moves to En_Ejecucion once; the receipt makes a repeat idempotent', async () => {
    const t0 = await stamp(A.open)
    const opId = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'En_Ejecucion' }, t0)
    const first = await apply(U.resp, opId, A.open, 'En_Ejecucion', null, t0)
    assert.equal(first.estado, 'En_Ejecucion')
    assert.equal(first.estadoAnterior, 'Pendiente')
    const t1 = await stamp(A.open)
    const again = await apply(U.resp, opId, A.open, 'En_Ejecucion', null, t0)
    assert.equal(again.replayed, true)
    assert.equal(String(await stamp(A.open)), String(t1))
    assert.equal((await one('select count(*)::int n from agent_action_receipts where pending_op_id=$1', [opId])).n, 1)
  })

  await check('CAS: a confirmation prepared before another change is rejected as a conflict', async () => {
    const stale = await stamp(A.open)
    await asOwner()
    await query("update acciones_diarias set titulo_accion='Abierta (editada)' where id=$1", [A.open])
    const opId = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'Pendiente' }, stale)
    await assert.rejects(apply(U.resp, opId, A.open, 'Pendiente', null, stale), /conflict/)
    assert.equal((await one('select estado::text e from acciones_diarias where id=$1', [A.open])).e, 'En_Ejecucion')
  })

  await check('Binding: only the owner, only executing ops, only the confirmed parameters', async () => {
    const t = await stamp(A.open)
    const pending = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'Pendiente' }, t, 'pending')
    await assert.rejects(apply(U.resp, pending, A.open, 'Pendiente', null, t), /not_confirmed/)
    const mine = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'Pendiente' }, t)
    await assert.rejects(apply(U.other, mine, A.open, 'Pendiente', null, t), /not_authorized/)
    await assert.rejects(apply(U.resp, mine, A.open, 'Bloqueado', 'Motivo largo', t), /payload_mismatch/)
    await assert.rejects(apply(U.resp, mine, A.done, 'Pendiente', null, t), /payload_mismatch/)
    const foreignTool = await op(U.resp, 'update_action', { accionId: A.open, estado: 'Pendiente' }, t)
    await assert.rejects(apply(U.resp, foreignTool, A.open, 'Pendiente', null, t), /invalid_operation/)
  })

  await check('Verificado is never assigned by the agent and a verified action cannot change', async () => {
    const t = await stamp(A.open)
    const v = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'Verificado' }, t)
    await assert.rejects(apply(U.resp, v, A.open, 'Verificado', null, t), /verified_requires_human/)
    const tv = await stamp(A.verified)
    const reopen = await op(U.resp, 'agent_set_action_status', { accionId: A.verified, estado: 'Pendiente' }, tv)
    await assert.rejects(apply(U.resp, reopen, A.verified, 'Pendiente', null, tv), /already_verified/)
  })

  await check('Hecho follows try_set_accion_hecho: pending checkpoints block it atomically; then it closes', async () => {
    const t = await stamp(A.done)
    const early = await op(U.resp, 'agent_set_action_status', { accionId: A.done, estado: 'Hecho' }, t)
    await assert.rejects(apply(U.resp, early, A.done, 'Hecho', null, t), /puntos de validacion pendientes/)
    assert.equal((await one('select estado::text e from acciones_diarias where id=$1', [A.done])).e, 'En_Ejecucion')
    assert.equal((await one('select count(*)::int n from agent_action_receipts where pending_op_id=$1', [early])).n, 0)
    await query('update accion_checkpoints set completado=true where accion_id=$1', [A.done])
    const t2 = await stamp(A.done)
    const close = await op(U.resp, 'agent_set_action_status', { accionId: A.done, estado: 'Hecho' }, t2)
    const r = await apply(U.resp, close, A.done, 'Hecho', null, t2)
    assert.equal(r.estado, 'Hecho')
    const row = await one('select estado::text e, completed_by from acciones_diarias where id=$1', [A.done])
    assert.equal(row.e, 'Hecho')
    assert.equal(row.completed_by, U.resp)
  })

  await check('register_blocker: motivo of at least 5 characters; responsable leaves it in a comment, creator also in causa_raiz', async () => {
    const t = await stamp(A.creatorBlock)
    const short = await op(U.resp, 'agent_register_blocker', { accionId: A.creatorBlock, motivo: 'no' }, t)
    await assert.rejects(apply(U.resp, short, A.creatorBlock, 'Bloqueado', 'no', t), /block_reason_required/)
    const byResp = await op(U.resp, 'agent_register_blocker', { accionId: A.creatorBlock, motivo: 'Falta proveedor' }, t)
    const r = await apply(U.resp, byResp, A.creatorBlock, 'Bloqueado', 'Falta proveedor', t)
    assert.equal(r.estado, 'Bloqueado')
    assert.equal(r.causaRaiz, false)
    let row = await one('select estado::text e, causa_raiz from acciones_diarias where id=$1', [A.creatorBlock])
    assert.equal(row.e, 'Bloqueado')
    assert.equal(row.causa_raiz, null)
    assert.equal((await one("select count(*)::int n from accion_comentarios where accion_id=$1 and contenido like '%Falta proveedor'", [A.creatorBlock])).n, 1)

    const t2 = await stamp(A.creatorBlock)
    const unblock = await op(U.creator, 'agent_set_action_status', { accionId: A.creatorBlock, estado: 'Pendiente' }, t2)
    await apply(U.creator, unblock, A.creatorBlock, 'Pendiente', null, t2)
    const t3 = await stamp(A.creatorBlock)
    const byCreator = await op(U.creator, 'agent_register_blocker', { accionId: A.creatorBlock, motivo: 'Sin presupuesto aprobado' }, t3)
    const r2 = await apply(U.creator, byCreator, A.creatorBlock, 'Bloqueado', 'Sin presupuesto aprobado', t3)
    assert.equal(r2.causaRaiz, true)
    row = await one('select causa_raiz from acciones_diarias where id=$1', [A.creatorBlock])
    assert.equal(row.causa_raiz, 'Sin presupuesto aprobado')
  })

  await check('Blocker is atomic: a failing comment rolls back the estado and the receipt', async () => {
    await asOwner()
    await db.exec(`create function qa_reject_comment() returns trigger language plpgsql as $$
      begin raise exception 'synthetic_comment_failure'; end; $$;
      create trigger qa_reject_comment before insert on accion_comentarios for each row execute function qa_reject_comment();`)
    const t = await stamp(A.open)
    const opId = await op(U.resp, 'agent_register_blocker', { accionId: A.open, motivo: 'Corte de energia' }, t)
    await assert.rejects(apply(U.resp, opId, A.open, 'Bloqueado', 'Corte de energia', t), /synthetic_comment_failure/)
    assert.equal((await one('select estado::text e from acciones_diarias where id=$1', [A.open])).e, 'En_Ejecucion')
    assert.equal((await one('select count(*)::int n from agent_action_receipts where pending_op_id=$1', [opId])).n, 0)
    await db.exec('drop trigger qa_reject_comment on accion_comentarios; drop function qa_reject_comment()')
  })

  await check('Authorization: unrelated users, Analista, Direccion and inactive users are denied', async () => {
    const t = await stamp(A.open)
    const ajeno = await op(U.other, 'agent_set_action_status', { accionId: A.open, estado: 'Pendiente' }, t)
    await assert.rejects(apply(U.other, ajeno, A.open, 'Pendiente', null, t), /sin permiso/)
    const ta = await stamp(A.analyst)
    const analyst = await op(U.analyst, 'agent_set_action_status', { accionId: A.analyst, estado: 'En_Ejecucion' }, ta)
    await assert.rejects(apply(U.analyst, analyst, A.analyst, 'En_Ejecucion', null, ta), /solo tiene acceso de consulta/)
    const td = await stamp(A.director)
    const director = await op(U.director, 'agent_set_action_status', { accionId: A.director, estado: 'En_Ejecucion' }, td)
    await assert.rejects(apply(U.director, director, A.director, 'En_Ejecucion', null, td), /solo tiene acceso de consulta/)
    const inactive = await op(U.inactive, 'agent_set_action_status', { accionId: A.open, estado: 'Pendiente' }, t)
    await assert.rejects(apply(U.inactive, inactive, A.open, 'Pendiente', null, t), /usuario inactivo/)
  })

  await check('Explicit Super Admin may update any action (accumulated permissions)', async () => {
    const t = await stamp(A.analyst)
    const opId = await op(U.admin, 'agent_set_action_status', { accionId: A.analyst, estado: 'Bloqueado', motivo: 'Espera de auditoria' }, t)
    const r = await apply(U.admin, opId, A.analyst, 'Bloqueado', 'Espera de auditoria', t)
    assert.equal(r.causaRaiz, true)
  })

  await check('Receipts are readable only by their owner', async () => {
    await asUser(U.resp)
    const mine = (await one('select count(*)::int n from agent_action_receipts')).n
    assert.ok(mine >= 3)
    assert.equal((await one('select count(*)::int n from agent_action_receipts where usuario_id<>$1', [U.resp])).n, 0)
    await asUser(U.other)
    assert.equal((await one('select count(*)::int n from agent_action_receipts')).n, 0)
    await asOwner()
  })

  await check('Rollback removes the RPC and receipts but keeps applied action changes; reapply restores', async () => {
    await db.exec(read(rollbackFile))
    assert.equal((await one("select to_regprocedure('public.agent_apply_action_status(uuid,uuid,text,text,timestamptz)') is null v")).v, true)
    assert.equal((await one("select to_regclass('public.agent_action_receipts') is null v")).v, true)
    assert.equal((await one('select estado::text e from acciones_diarias where id=$1', [A.done])).e, 'Hecho')
    await db.exec(read(migrationFile))
    assert.equal((await one("select to_regprocedure('public.agent_apply_action_status(uuid,uuid,text,text,timestamptz)') is not null v")).v, true)
  })

  console.log(`Local PostgreSQL (PGlite): ${passed.length} R2 action-status checks passed.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
