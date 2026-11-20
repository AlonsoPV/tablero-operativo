/* global process, console */
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
    created_by uuid, tipo_comentario text, created_at timestamptz not null default clock_timestamp());
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
const A = { open: id(101), done: id(102), verified: id(103), analyst: id(104), director: id(105), creatorBlock: id(106), copilot: id(107) }
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
const payloads = new Map()
// mode: 'claim' reserves through agent_claim_pending_op as the owner user (the only valid path);
// 'pending' leaves it unreserved; 'forced' writes executing+claimed_at as the table owner (fixture only).
async function op(usuarioId, tool, payload, expectedUpdatedAt, mode = 'claim', ttl = '10 minutes') {
  await asOwner()
  const opId = id(1000 + ++opSeq)
  const forced = mode === 'forced'
  await query(`insert into assistant_pending_ops(id,usuario_id,tool,resource_id,expected_updated_at,payload,status,expires_at,claimed_at)
    values ($1,$2,$3,$4,$5,$6,$7,now()+$8::interval,$9)`,
  [opId, usuarioId, tool, payload.accionId ?? payload.action_id, expectedUpdatedAt, JSON.stringify(payload),
    forced ? 'executing' : 'pending', ttl, forced ? new Date().toISOString() : null])
  payloads.set(opId, payload)
  if (mode === 'claim') assert.equal(await claim(usuarioId, opId), true)
  return opId
}
async function claim(usuarioId, opId) {
  await asUser(usuarioId)
  try {
    return (await one('select public.agent_claim_pending_op($1,$2::jsonb) as r', [opId, JSON.stringify(payloads.get(opId))])).r
  } finally {
    await asOwner()
  }
}
async function history(usuarioId, accionId) {
  await asUser(usuarioId)
  try {
    return (await one('select public.agent_action_block_history($1) as r', [accionId])).r
  } finally {
    await asOwner()
  }
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
      ('${A.creatorBlock}','Bloqueo de creadora','Pendiente','${U.resp}','${U.creator}'),
      ('${A.copilot}','Cierre por copiloto','En_Ejecucion','${U.resp}','${U.creator}');
    insert into accion_checkpoints(id,accion_id,texto) values ('${id(201)}','${A.done}','Paso obligatorio');
  `)

  await db.exec(read(migrationFile))
  await db.exec(read(migrationFile))
  passed.push('Migration 20261120120000 applies and is idempotent')

  await check('DB gate: without the QA seed row, claim and apply refuse (execution_disabled)', async () => {
    assert.equal((await one('select public.agent_execution_allowed() v')).v, false)
    const t = await stamp(A.open)
    const pending = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'En_Ejecucion' }, t, 'pending')
    await asUser(U.resp)
    await assert.rejects(query('select public.agent_claim_pending_op($1,$2::jsonb)', [pending, JSON.stringify(payloads.get(pending))]), /execution_disabled/)
    await asOwner()
    const forced = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'En_Ejecucion' }, t, 'forced')
    await assert.rejects(apply(U.resp, forced, A.open, 'En_Ejecucion', null, t), /execution_disabled/)
    assert.equal((await one('select estado::text e from acciones_diarias where id=$1', [A.open])).e, 'Pendiente')
  })

  // Same row the QA seed (supabase/scripts/qa/seed_qa_environment.sql) inserts.
  await asOwner()
  await db.exec("insert into agent_execution_gate(id,enabled,project_ref) values (true,true,'qafixturerefaaaaaaaa')")

  await check('Grants: anon cannot execute; authenticated can; receipts and gate are not client-writable or readable', async () => {
    for (const fn of ['agent_apply_action_status(uuid,uuid,text,text,timestamptz)', 'agent_claim_pending_op(uuid,jsonb)',
      'agent_action_block_history(uuid)', 'agent_execution_allowed()', 'agent_execution_environment()']) {
      assert.equal((await one(`select has_function_privilege('anon','public.${fn}','execute') v`)).v, false, fn)
      assert.equal((await one(`select has_function_privilege('authenticated','public.${fn}','execute') v`)).v, true, fn)
    }
    assert.equal((await one("select has_table_privilege('authenticated','public.agent_action_receipts','insert') v")).v, false)
    assert.equal((await one("select has_table_privilege('authenticated','public.agent_execution_gate','select') v")).v, false)
    assert.equal((await one("select has_table_privilege('authenticated','public.agent_execution_gate','insert') v")).v, false)
    for (const fn of ['agent_apply_action_status', 'agent_claim_pending_op', 'agent_action_block_history', 'agent_execution_allowed']) {
      const p = await one(`select prosecdef d, proconfig c from pg_proc where proname=$1`, [fn])
      assert.equal(p.d, true, fn)
      assert.ok(String(p.c).includes('search_path=public'), fn)
    }
    await asAnon()
    await assert.rejects(query('select public.agent_apply_action_status($1,$2,$3)', [id(9), A.open, 'Hecho']), /permission denied/)
    await asOwner()
  })

  await check('Direct path: clients cannot set executing on agent ops nor write claimed_at; RPC without claim refuses', async () => {
    const t = await stamp(A.open)
    const opId = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'En_Ejecucion' }, t, 'pending')
    await asUser(U.resp)
    await assert.rejects(query("update assistant_pending_ops set status='executing' where id=$1", [opId]), /solo se reservan con agent_claim_pending_op/)
    await assert.rejects(query('update assistant_pending_ops set claimed_at=now() where id=$1', [opId]), /claimed_at solo lo asigna/)
    await asOwner()
    await assert.rejects(apply(U.resp, opId, A.open, 'En_Ejecucion', null, t), /not_confirmed/)
    // A non-agent tool may still be moved to executing by its owner (legacy copilot path), but never carries claimed_at.
    const legacy = await op(U.resp, 'mark_action_done', { action_id: A.open }, t, 'pending')
    await asUser(U.resp)
    await query("update assistant_pending_ops set status='executing' where id=$1", [legacy])
    await asOwner()
    await assert.rejects(apply(U.resp, legacy, A.open, 'Hecho', null, t), /not_confirmed/)
    assert.equal((await one('select estado::text e from acciones_diarias where id=$1', [A.open])).e, 'Pendiente')
  })

  await check('Claim: once per op, only pending, unexpired and with the confirmed payload; returning to pending clears claimed_at', async () => {
    const t = await stamp(A.open)
    const opId = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'Bloqueado', motivo: 'Motivo de prueba' }, t, 'pending')
    await asUser(U.resp)
    assert.equal((await one('select public.agent_claim_pending_op($1,$2::jsonb) r', [opId, JSON.stringify({ accionId: A.open, estado: 'Hecho' })])).r, false)
    await asOwner()
    assert.equal(await claim(U.resp, opId), true)
    assert.equal(await claim(U.resp, opId), false)
    await asUser(U.other)
    await assert.rejects(query('select public.agent_claim_pending_op($1,$2::jsonb)', [opId, JSON.stringify(payloads.get(opId))]), /no pertenece/)
    await asUser(U.resp)
    await query("update assistant_pending_ops set status='pending' where id=$1", [opId])
    await asOwner()
    assert.equal((await one('select claimed_at from assistant_pending_ops where id=$1', [opId])).claimed_at, null)
    await assert.rejects(apply(U.resp, opId, A.open, 'Bloqueado', 'Motivo de prueba', t), /not_confirmed/)
    const expired = await op(U.resp, 'agent_set_action_status', { accionId: A.open, estado: 'Hecho' }, t, 'pending', '-1 minute')
    assert.equal(await claim(U.resp, expired), false)
    const wrongTool = await op(U.resp, 'update_action', { accionId: A.open }, t, 'pending')
    await asUser(U.resp)
    await assert.rejects(query('select public.agent_claim_pending_op($1,$2::jsonb)', [wrongTool, JSON.stringify(payloads.get(wrongTool))]), /invalid_operation/)
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
    const foreignTool = await op(U.resp, 'update_action', { accionId: A.open, estado: 'Pendiente' }, t, 'forced')
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

  await check('register_blocker: motivo of at least 5 characters; reported cause is a bloqueo_reportado comment, causa_raiz untouched', async () => {
    await asOwner()
    await query("update acciones_diarias set causa_raiz='Causa validada previa' where id=$1", [A.creatorBlock])
    const t = await stamp(A.creatorBlock)
    const short = await op(U.resp, 'agent_register_blocker', { accionId: A.creatorBlock, motivo: 'no' }, t)
    await assert.rejects(apply(U.resp, short, A.creatorBlock, 'Bloqueado', 'no', t), /block_reason_required/)
    const byResp = await op(U.resp, 'agent_register_blocker', { accionId: A.creatorBlock, motivo: 'Falta proveedor' }, t)
    const r = await apply(U.resp, byResp, A.creatorBlock, 'Bloqueado', 'Falta proveedor', t)
    assert.equal(r.estado, 'Bloqueado')
    assert.equal(r.causaReportada, true)
    assert.equal(r.causaRaiz, undefined)
    let row = await one('select estado::text e, causa_raiz from acciones_diarias where id=$1', [A.creatorBlock])
    assert.equal(row.e, 'Bloqueado')
    assert.equal(row.causa_raiz, 'Causa validada previa')
    const comment = await one("select contenido, tipo_comentario, created_by from accion_comentarios where accion_id=$1 and contenido like '%Falta proveedor'", [A.creatorBlock])
    assert.deepEqual(comment, { contenido: 'Causa reportada: Falta proveedor', tipo_comentario: 'bloqueo_reportado', created_by: U.resp })

    // The creator has general edit, and still the agent never writes causa_raiz.
    const t2 = await stamp(A.creatorBlock)
    const unblock = await op(U.creator, 'agent_set_action_status', { accionId: A.creatorBlock, estado: 'Pendiente' }, t2)
    await apply(U.creator, unblock, A.creatorBlock, 'Pendiente', null, t2)
    const t3 = await stamp(A.creatorBlock)
    const byCreator = await op(U.creator, 'agent_register_blocker', { accionId: A.creatorBlock, motivo: 'Sin presupuesto aprobado' }, t3)
    await apply(U.creator, byCreator, A.creatorBlock, 'Bloqueado', 'Sin presupuesto aprobado', t3)
    row = await one('select causa_raiz from acciones_diarias where id=$1', [A.creatorBlock])
    assert.equal(row.causa_raiz, 'Causa validada previa')
  })

  await check('Block history: responsable, creator and Super Admin read reports and receipts; Analista, Direccion and others are denied', async () => {
    await asOwner()
    await query("insert into accion_comentarios(accion_id,contenido,created_by,tipo_comentario) values ($1,'Bloqueo reportado por WhatsApp: legado',$2,'comentario'), ($1,'Comentario normal',$2,null)", [A.creatorBlock, U.resp])
    for (const who of [U.resp, U.creator, U.admin]) {
      const h = await history(who, A.creatorBlock)
      assert.equal(h.estado, 'Bloqueado')
      assert.deepEqual(h.reportes.map((x) => x.contenido), [
        'Causa reportada: Falta proveedor', 'Causa reportada: Sin presupuesto aprobado', 'Bloqueo reportado por WhatsApp: legado',
      ])
      assert.ok(h.recibos.length >= 3)
    }
    for (const who of [U.analyst, U.director, U.other, U.inactive]) {
      await assert.rejects(history(who, A.creatorBlock), /not_authorized|usuario inactivo/)
    }
  })

  await check('mark_action_done (copilot behind COPILOT_R2_GATE) runs through claim + RPC with a receipt', async () => {
    const t = await stamp(A.copilot)
    const opId = await op(U.resp, 'mark_action_done', { action_id: A.copilot }, t)
    const r = await apply(U.resp, opId, A.copilot, 'Hecho', null, t)
    assert.equal(r.estado, 'Hecho')
    const receipt = await one('select tool, estado_nuevo from agent_action_receipts where pending_op_id=$1', [opId])
    assert.deepEqual(receipt, { tool: 'mark_action_done', estado_nuevo: 'Hecho' })
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
    const unclaimed = await op(U.inactive, 'agent_set_action_status', { accionId: A.open, estado: 'Pendiente' }, t, 'pending')
    await assert.rejects(claim(U.inactive, unclaimed), /usuario inactivo/)
    const inactive = await op(U.inactive, 'agent_set_action_status', { accionId: A.open, estado: 'Pendiente' }, t, 'forced')
    await assert.rejects(apply(U.inactive, inactive, A.open, 'Pendiente', null, t), /usuario inactivo/)
  })

  await check('Explicit Super Admin may update any action (accumulated permissions)', async () => {
    const t = await stamp(A.analyst)
    const opId = await op(U.admin, 'agent_set_action_status', { accionId: A.analyst, estado: 'Bloqueado', motivo: 'Espera de auditoria' }, t)
    const r = await apply(U.admin, opId, A.analyst, 'Bloqueado', 'Espera de auditoria', t)
    assert.equal(r.causaReportada, true)
    assert.equal((await one('select causa_raiz from acciones_diarias where id=$1', [A.analyst])).causa_raiz, null)
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

  await check('Rollback removes RPCs, gate, claim guard, claimed_at and receipts but keeps action changes and comments; reapply restores closed', async () => {
    await db.exec(read(rollbackFile))
    for (const fn of ['agent_apply_action_status(uuid,uuid,text,text,timestamptz)', 'agent_claim_pending_op(uuid,jsonb)',
      'agent_action_block_history(uuid)', 'agent_execution_allowed()', 'assistant_pending_ops_guard_agent_claim()']) {
      assert.equal((await one(`select to_regprocedure('public.${fn}') is null v`)).v, true, fn)
    }
    assert.equal((await one("select to_regclass('public.agent_action_receipts') is null v")).v, true)
    assert.equal((await one("select to_regclass('public.agent_execution_gate') is null v")).v, true)
    assert.equal((await one("select count(*)::int n from information_schema.columns where table_name='assistant_pending_ops' and column_name='claimed_at'")).n, 0)
    assert.equal((await one('select estado::text e from acciones_diarias where id=$1', [A.done])).e, 'Hecho')
    assert.equal((await one("select count(*)::int n from accion_comentarios where tipo_comentario='bloqueo_reportado'")).n, 3)
    await db.exec(read(migrationFile))
    assert.equal((await one("select to_regprocedure('public.agent_apply_action_status(uuid,uuid,text,text,timestamptz)') is not null v")).v, true)
    assert.equal((await one('select public.agent_execution_allowed() v')).v, false)
  })

  await check('QA seed: refuses the placeholder, DEV and PROD; with a QA ref opens the gate and creates qa_outbox with own-row RLS', async () => {
    const seed = read('supabase/scripts/qa/seed_qa_environment.sql')
    await asOwner()
    await db.exec(`create table if not exists user_channel_identities(id uuid primary key default gen_random_uuid(), usuario_id uuid,
      channel text, external_user_id text, status text default 'active');
      grant select, insert on accion_comentarios to authenticated`)
    await assert.rejects(db.exec(seed), /Sustituye __QA_PROJECT_REF__/)
    for (const blocked of ['tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb']) {
      await assert.rejects(db.exec(seed.replace("'__QA_PROJECT_REF__'", `'${blocked}'`)), /nunca se ejecuta en DEV ni en PROD/)
    }
    assert.equal((await one('select public.agent_execution_allowed() v')).v, false)
    await db.exec(seed.replace("'__QA_PROJECT_REF__'", "'qaprojectaaaaaaaaaaa'"))
    assert.equal((await one('select public.agent_execution_environment() v')).v, 'qaprojectaaaaaaaaaaa')
    await query("insert into user_channel_identities(usuario_id,channel,external_user_id) values ($1,'whatsapp','5215550000000')", [U.resp])
    await asUser(U.creator)
    assert.equal((await one('select public.qa_whatsapp_linked($1) v', [U.resp])).v, true)
    assert.equal((await one('select public.qa_whatsapp_linked($1) v', [U.other])).v, false)
    await query("insert into qa_outbox(idempotency_key,canal,sender_usuario_id,to_usuario_id,body) values ('k1','email',$1,$2,'hola')", [U.creator, U.resp])
    await assert.rejects(query("insert into qa_outbox(idempotency_key,canal,sender_usuario_id,to_usuario_id,body) values ('k2','email',$1,$2,'x')", [U.resp, U.creator]), /row-level security/)
    await asUser(U.other)
    assert.equal((await one('select count(*)::int n from qa_outbox')).n, 0)
    await asUser(U.resp)
    assert.equal((await one('select count(*)::int n from qa_outbox')).n, 1)
    await asOwner()
  })

  console.log(`Local PostgreSQL (PGlite): ${passed.length} R2 action-status checks passed.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
