import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

function resolvePglitePath() {
  if (process.env.WHATSAPP_PGLITE_PATH && existsSync(process.env.WHATSAPP_PGLITE_PATH)) {
    return process.env.WHATSAPP_PGLITE_PATH
  }
  const candidates = [
    resolve('node_modules/@electric-sql/pglite/dist/index.js'),
    process.env.TEMP
      ? resolve(process.env.TEMP, 'pglite-r0-lab/node_modules/@electric-sql/pglite/dist/index.js')
      : '',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    'No local PGlite package found. Set WHATSAPP_PGLITE_PATH or install @electric-sql/pglite locally.'
  )
}

const pglitePath = resolvePglitePath()
const { PGlite } = await import(pathToFileURL(pglitePath).href)
const db = new PGlite()

await db.exec(`
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true); $$;
create or replace function public.get_my_usuario_id() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub_usuario', true), '')::uuid; $$;
create or replace function public.is_app_admin() returns boolean language sql stable as $$ select false; $$;
create or replace function public.is_business_admin() returns boolean language sql stable as $$ select false; $$;
create or replace function public.is_explicit_privilege_admin() returns boolean language sql stable as $$ select false; $$;
create or replace function public.is_business_analyst() returns boolean language sql stable as $$ select false; $$;
create or replace function public.accion_checkpoint_responsable_belongs_to_accion_area(uuid, uuid) returns boolean language sql stable as $$ select true; $$;

create role anon;
create role authenticated;
create role service_role bypassrls;

create table usuarios(id uuid primary key, activo boolean);
create type action_status as enum ('Pendiente','En_Ejecucion','Bloqueado','Hecho','Verificado');
create table acciones_diarias(
  id uuid primary key,
  responsable uuid,
  created_by uuid,
  titulo_accion text,
  estado action_status,
  causa_raiz text,
  completed_at timestamptz,
  completed_by uuid,
  updated_at timestamptz not null default now()
);
create table accion_checkpoints(
  id uuid primary key,
  accion_id uuid,
  texto text,
  orden integer default 0,
  obligatorio boolean default true,
  activo boolean,
  completado boolean,
  checked_at timestamptz,
  checked_by uuid,
  created_by uuid,
  responsable_id uuid
);
create table statuses(id uuid primary key, nombre text, activo boolean, orden integer, es_cierre boolean);
create table acciones_equipo(id uuid primary key, asignado_a uuid, estado_id uuid, checklist jsonb, bloqueada boolean, completed_at timestamptz, updated_at timestamptz);
create table accion_comentarios(accion_id uuid, contenido text, created_by uuid, tipo_comentario text, created_at timestamptz not null default now());
create table equipo_accion_comentarios(accion_id uuid, contenido text, created_by uuid, tipo_comentario text);
create table whatsapp_result_requests(scope text, accion_id uuid, team_action_id uuid, checkpoint_id uuid, checklist_index integer, usuario_id uuid, wa_id text, status text, expires_at timestamptz);
create table whatsapp_followup_jobs(accion_id uuid, team_action_id uuid, checkpoint_id uuid, checklist_index integer, usuario_id uuid, status text, updated_at timestamptz, error_message text);

-- R1 prerequisites needed to verify compatibility with R2 migration (20261120120000_agent_apply_action_status.sql)
create table assistant_pending_ops(
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  tool text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  resource_id uuid,
  expected_updated_at timestamptz,
  request_key text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
create or replace function public.can_edit_accion_general_as(p_accion_id uuid, p_usuario_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.acciones_diarias a
    where a.id = p_accion_id and (a.responsable = p_usuario_id or a.created_by = p_usuario_id)
  );
$$;
create or replace function public.can_manage_accion_full_as(p_accion_id uuid, p_usuario_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.acciones_diarias a
    where a.id = p_accion_id and a.created_by = p_usuario_id
  );
$$;
create or replace function public.try_set_accion_hecho(p_accion_id uuid, p_usuario_id uuid)
returns void language plpgsql as $$
begin
  update public.acciones_diarias
  set estado = 'Hecho', completed_at = now(), completed_by = p_usuario_id, updated_at = now()
  where id = p_accion_id;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select, update on public.accion_checkpoints to authenticated, service_role;
grant select, update on public.acciones_diarias to authenticated, service_role;
grant select, update, insert on public.assistant_pending_ops to authenticated, service_role;
`)

// Install pre-fix trigger to prove P0001 root cause reproduces under service_role.
await db.exec(`
create or replace function public.accion_checkpoints_guard_assignee_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid;
  action_creator uuid;
  action_responsable uuid;
  is_checkpoint_responsable boolean;
begin
  me := public.get_my_usuario_id();
  select a.created_by, a.responsable into action_creator, action_responsable from public.acciones_diarias a where a.id = old.accion_id;
  if action_creator is not null and action_creator = me then return new; end if;
  is_checkpoint_responsable := old.responsable_id is not null and old.responsable_id = me;
  if action_responsable is distinct from me and not is_checkpoint_responsable then
    raise exception 'Solo la persona creadora de la accion, el responsable asignado o el responsable del check pueden actualizar este checklist.';
  end if;
  return new;
end; $$;
create trigger accion_checkpoints_guard before insert or update or delete on public.accion_checkpoints
for each row execute function public.accion_checkpoints_guard_assignee_permissions();
`)

const migration = readFileSync(
  'supabase/migrations/20261117180000_whatsapp_durable_inbound.sql',
  'utf8'
).replace(/^\uFEFF/, '')
const unblockMigration = readFileSync(
  'supabase/migrations/20261117182000_whatsapp_inbound_unblock_review.sql',
  'utf8'
).replace(/^\uFEFF/, '')
const r0FixMigration = readFileSync(
  'supabase/migrations/20261124120000_whatsapp_r0_checkpoint_p0001_and_reconciliation.sql',
  'utf8'
).replace(/^\uFEFF/, '')

await db.exec(migration)
await db.exec(unblockMigration)

const u = '00000000-0000-0000-0000-000000000001'
const other = '00000000-0000-0000-0000-000000000002'
const inactive = '00000000-0000-0000-0000-000000000003'
const a = '10000000-0000-0000-0000-000000000001'
const aOther = '10000000-0000-0000-0000-000000000002'
const aInactive = '10000000-0000-0000-0000-000000000003'
const cp1 = '30000000-0000-0000-0000-000000000001'
const cp2 = '30000000-0000-0000-0000-000000000002'
const cpOther = '30000000-0000-0000-0000-000000000003'
const cpInactive = '30000000-0000-0000-0000-000000000004'
const team = '20000000-0000-0000-0000-000000000001'

await db.exec(`
insert into usuarios values('${u}',true),('${other}',true),('${inactive}',false);
insert into acciones_diarias(id,responsable,created_by,titulo_accion,estado,causa_raiz,completed_at,completed_by) values
  ('${a}','${u}','${other}','Prueba','Pendiente',null,null,null),
  ('${aOther}','${other}','${other}','Ajena','Pendiente',null,null,null),
  ('${aInactive}','${inactive}','${other}','Inactiva','Pendiente',null,null,null);
insert into accion_checkpoints values
  ('${cp1}','${a}','Paso 1',1,true,true,false,null,null,'${other}',null),
  ('${cp2}','${a}','Paso 2',2,true,true,false,null,null,'${other}',null),
  ('${cpOther}','${aOther}','Paso Ajeno',1,true,true,false,null,null,'${other}',null),
  ('${cpInactive}','${aInactive}','Paso Inactivo',1,true,true,false,null,null,'${other}',null);
insert into statuses values
  ('40000000-0000-0000-0000-000000000001','Hecho',true,1,true),
  ('40000000-0000-0000-0000-000000000002','En_Ejecucion',true,2,false),
  ('40000000-0000-0000-0000-000000000003','Verificado',true,3,true);
insert into acciones_equipo values('${team}','${u}',null,'[{"text":"Paso","done":false}]',false,null,null);
`)

async function q(sql, args = []) {
  return (await db.query(sql, args)).rows
}

await q("select set_config('request.jwt.claim.role', 'service_role', false)")
await q("insert into whatsapp_followup_jobs(accion_id,usuario_id,status) values($1,$2,'pending')", [a, u])

// 1) Prove pre-fix P0001 reproduces cleanly when service_role updates accion_checkpoints.
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5)', ['pre_fix_done', u, a, 'done', '15550002222']),
  (err) => err.code === 'P0001'
)
assert.equal((await q('select estado from acciones_diarias where id=$1', [a]))[0].estado, 'Pendiente')
assert.equal((await q('select completado from accion_checkpoints where id=$1', [cp1]))[0].completado, false)

// 2) Apply R0 P0001 + reconciliation migration (plus idempotent re-application check).
await db.exec(r0FixMigration)
await db.exec(r0FixMigration)

// 3) Active vs inactive user + action & checkpoint ownership.
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5)', ['inactive_try', inactive, aInactive, 'done', '15550003333']),
  /not_authorized/
)
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5)', ['forged_owner', other, a, 'done', '15550002222']),
  /not_authorized/
)
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5,$6,$7)', [
    'cross_action_cp',
    u,
    a,
    'done',
    '15550002222',
    null,
    cpOther,
  ]),
  /not_authorized/
)

// 4) Authorized owner succeeds on single checkpoint, preserves checked_by, and keeps action open while cp2 remains.
await q('select whatsapp_apply_action($1,$2,$3,$4,$5,$6,$7)', [
  'done_cp1',
  u,
  a,
  'done',
  '15550002222',
  null,
  cp1,
])
assert.equal((await q('select completado,checked_by from accion_checkpoints where id=$1', [cp1]))[0].completado, true)
assert.equal((await q('select completado,checked_by from accion_checkpoints where id=$1', [cp1]))[0].checked_by, u)
assert.equal((await q('select completado from accion_checkpoints where id=$1', [cp2]))[0].completado, false)
assert.equal((await q('select estado from acciones_diarias where id=$1', [a]))[0].estado, 'Pendiente')

// 5) Idempotent replay returns cached receipt without duplicating result requests.
await q('select whatsapp_apply_action($1,$2,$3,$4,$5,$6,$7)', [
  'done_cp1',
  u,
  a,
  'done',
  '15550002222',
  null,
  cp1,
])
assert.equal((await q('select count(*)::int n from whatsapp_result_requests'))[0].n, 1)

// 6) Transactional scope & immediate cleanup: within the SAME transaction, after whatsapp_apply_action
// completes cp2, a direct UPDATE on another checkpoint MUST still fail closed (42501), and the
// internal actor context table MUST have zero leftover rows.
await db.exec('begin')
await q('select whatsapp_apply_action($1,$2,$3,$4,$5,$6,$7)', [
  'done_cp2',
  u,
  a,
  'done',
  '15550002222',
  null,
  cp2,
])
assert.equal((await q('select count(*)::int n from whatsapp_internal_actor_context'))[0].n, 0)
await db.exec('savepoint sp_after_rpc')
await assert.rejects(
  q('update accion_checkpoints set completado = true where id = $1', [cpOther]),
  (err) => err.code === '42501'
)
await db.exec('rollback to savepoint sp_after_rpc')
await db.exec('commit')

assert.equal((await q('select estado from acciones_diarias where id=$1', [a]))[0].estado, 'Hecho')
assert.equal((await q('select checked_by from accion_checkpoints where id=$1', [cp2]))[0].checked_by, u)
assert.equal((await q('select status from whatsapp_followup_jobs where accion_id=$1', [a]))[0].status, 'canceled')
assert.equal((await q('select count(*)::int n from whatsapp_result_requests'))[0].n, 2)

// 7) Impossibility of spoofing via app.whatsapp_actor_id (both as service_role and authenticated)
// and zero direct write access to whatsapp_internal_actor_context.
await db.exec('set role service_role')
await q("select set_config('request.jwt.claim.role', 'service_role', false)")
await q("select set_config('request.jwt.claim.sub_usuario', '', false)")
await q("select set_config('app.whatsapp_actor_id', $1, false)", [other])
await assert.rejects(
  q('update accion_checkpoints set completado = true where id = $1', [cpOther]),
  (err) => err.code === '42501'
)
await assert.rejects(
  q('insert into whatsapp_internal_actor_context(txid, actor_id, accion_id) values (txid_current(), $1, $2)', [
    other,
    aOther,
  ]),
  /permission denied/
)
await db.exec('reset role')

await db.exec('set role authenticated')
await q("select set_config('request.jwt.claim.role', 'authenticated', false)")
await q("select set_config('request.jwt.claim.sub_usuario', $1, false)", [u])
await q("select set_config('app.whatsapp_actor_id', $1, false)", [other])
await assert.rejects(
  q('update accion_checkpoints set completado = true where id = $1', [cpOther]),
  (err) => err.code === '42501'
)
// Privilege escalation check: owner cannot alter structural columns of their own checkpoint.
await assert.rejects(
  q("update accion_checkpoints set texto = 'Tampered' where id = $1", [cp1]),
  (err) => err.code === '42501'
)
// Privilege escalation check: non-creator owner cannot DELETE checkpoint.
await assert.rejects(
  q('delete from accion_checkpoints where id = $1', [cp1]),
  (err) => err.code === '42501' || /permission denied/.test(err.message)
)
// Direct call to service_role RPCs denied for authenticated.
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5)', ['auth_try', u, a, 'progress', '15550002222']),
  /permission denied/
)
await assert.rejects(
  q('select * from whatsapp_reconcile_inbound_job($1,$2,$3,$4,$5)', [
    '90000000-0000-0000-0000-000000000001',
    1,
    'reconciled_no_replay',
    'Attempt as authenticated',
    u,
  ]),
  /permission denied/
)
await db.exec('reset role')
await q("select set_config('request.jwt.claim.role', 'service_role', false)")
await q("select set_config('request.jwt.claim.sub_usuario', '', false)")
await q("select set_config('app.whatsapp_actor_id', '', false)")

// 8) Verify SECURITY DEFINER, search_path=public, and least-privilege grants in pg_proc.
const fnMeta = await q(`
  select
    p.proname,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ','), '') as config,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'accion_checkpoints_guard_assignee_permissions',
      'whatsapp_apply_action',
      'whatsapp_reconcile_inbound_job'
    )
  order by p.proname
`)
assert.equal(fnMeta.length, 3)
for (const fn of fnMeta) {
  assert.equal(fn.prosecdef, true, `${fn.proname} must be SECURITY DEFINER`)
  assert.match(fn.config, /search_path=public/, `${fn.proname} must lock search_path=public`)
  assert.equal(fn.anon_exec, false, `${fn.proname} must revoke EXECUTE from anon`)
  assert.equal(fn.auth_exec, false, `${fn.proname} must revoke EXECUTE from authenticated`)
}

// 9) Support (blocker), progress, and team actions.
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5)', ['block', u, a, 'support', '15550002222']),
  /block_reason_required/
)
await q('select whatsapp_apply_action($1,$2,$3,$4,$5,$6)', ['block', u, a, 'support', '15550002222', 'Falta material'])
assert.equal((await q('select estado from acciones_diarias where id=$1', [a]))[0].estado, 'Bloqueado')
assert.equal((await q('select count(*)::int n from accion_comentarios where accion_id=$1', [a]))[0].n, 1)

await q('select whatsapp_apply_action($1,$2,$3,$4,$5)', ['progress', u, a, 'progress', '15550002222'])
assert.equal((await q('select estado from acciones_diarias where id=$1', [a]))[0].estado, 'En_Ejecucion')

await assert.rejects(
  q('select whatsapp_apply_team($1,$2,$3,$4,$5,$6)', ['team', other, team, 0, 'done', '15550002222']),
  /not_authorized/
)
await q('select whatsapp_apply_team($1,$2,$3,$4,$5,$6)', ['team', u, team, 0, 'done', '15550002222'])
assert.equal(
  (await q('select s.nombre from acciones_equipo a join statuses s on s.id=a.estado_id'))[0].nombre,
  'Hecho'
)

// 10) Queue dedup, lease, review, CAS reconciliation, idempotency, and replay block on uncertain effects.
const events = [
  { key: 'message:1', phone: 'phone', sender: '15550002222', kind: 'message', payload: {} },
  { key: 'message:2', phone: 'phone', sender: '15550002222', kind: 'message', payload: {} },
]
await q('select whatsapp_enqueue_inbound($1)', [JSON.stringify(events)])
await q('select whatsapp_enqueue_inbound($1)', [JSON.stringify(events)])
assert.equal((await q('select count(*)::int n from whatsapp_inbound_jobs'))[0].n, 2)

let job = (await q('select * from whatsapp_claim_inbound()'))[0]
assert.equal((await q('select * from whatsapp_claim_inbound()')).length, 0)
await q('select whatsapp_finish_inbound($1,$2,false,$3)', [job.id, job.lease_token, 'database_error'])
await db.exec('update whatsapp_inbound_jobs set available_at=now()')
job = (await q('select * from whatsapp_claim_inbound()'))[0]
assert.equal(job.attempts, 2)
await q('select whatsapp_mark_effect($1,$2,$3)', [job.id, job.lease_token, 'provider_request'])
await q('select whatsapp_finish_inbound($1,$2,false,$3)', [job.id, job.lease_token, 'provider_unknown'])
assert.equal((await q('select status from whatsapp_inbound_jobs where id=$1', [job.id]))[0].status, 'review')

// Cannot blindly requeue an uncertain review job with effect_started=true.
await assert.rejects(
  q('select * from whatsapp_reconcile_inbound_job($1,$2,$3,$4,$5)', [job.id, 2, 'requeue', 'Try unsafe replay', u]),
  /cannot_replay_uncertain_effect/
)
// CAS mismatch rejected.
await assert.rejects(
  q('select * from whatsapp_reconcile_inbound_job($1,$2,$3,$4,$5)', [
    job.id,
    99,
    'reconciled_no_replay',
    'Wrong attempts',
    u,
  ]),
  /cas_conflict/
)
// Safe reconciled_no_replay succeeds and records audit trail.
const reconciled = (
  await q('select * from whatsapp_reconcile_inbound_job($1,$2,$3,$4,$5)', [
    job.id,
    2,
    'reconciled_no_replay',
    'Verified provider notice already delivered; do not replay.',
    u,
  ])
)[0]
assert.equal(reconciled.status, 'failed')
assert.equal(reconciled.stage, 'reconciled_no_replay')
assert.equal(reconciled.payload.reconciliation.decision, 'reconciled_no_replay')
// Re-running reconciliation on already-reconciled job fails CAS (idempotency guard).
await assert.rejects(
  q('select * from whatsapp_reconcile_inbound_job($1,$2,$3,$4,$5)', [
    job.id,
    2,
    'reconciled_no_replay',
    'Second attempt',
    u,
  ]),
  /cas_conflict/
)

// Safe requeue succeeds ONLY when effect_started = false.
const safeReviewJob = (
  await q(
    `insert into whatsapp_inbound_jobs(event_key,phone_id,sender,kind,payload,status,stage,attempts,effect_started)
     values('message:safe-review','phone','15550002222','message','{}'::jsonb,'review','pre_effect',1,false)
     returning *`
  )
)[0]
const requeued = (
  await q('select * from whatsapp_reconcile_inbound_job($1,$2,$3,$4,$5)', [
    safeReviewJob.id,
    1,
    'requeue',
    'Confirmed no side effect started; safe to retry.',
    u,
  ])
)[0]
assert.equal(requeued.status, 'pending')
assert.equal(requeued.stage, 'reconciled_requeue')

// 11) Compatibility with definitive R2 SQL migration (20261120120000_agent_apply_action_status.sql @ 345c2b6).
let r2Sql = ''
try {
  r2Sql = execFileSync(
    'git',
    ['show', '345c2b6:supabase/migrations/20261120120000_agent_apply_action_status.sql'],
    { encoding: 'utf8' }
  ).replace(/^\uFEFF/, '')
} catch {
  r2Sql = ''
}
assert.ok(r2Sql.includes('agent_apply_action_status'), 'Expected definitive R2 migration at 345c2b6')
await db.exec(r2Sql)

// R2 gate starts OFF by default.
assert.equal((await q('select public.agent_execution_allowed() as ok'))[0].ok, false)

// Simulate local QA gate ON in PGlite and verify R2 RPC + R0 WhatsApp history coexist cleanly.
await db.exec("insert into public.agent_execution_gate(id, enabled, project_ref) values (true, true, 'local-qa-lab')")
const actionRow = (await q('select id, updated_at from public.acciones_diarias where id=$1', [a]))[0]
const pendingOpPayload = { accionId: a, estado: 'Hecho', expectedUpdatedAt: actionRow.updated_at }
const pendingOp = (
  await q(
    `insert into public.assistant_pending_ops(usuario_id, tool, status, payload, resource_id, expected_updated_at)
     values($1, 'agent_set_action_status', 'pending', $2::jsonb, $3, $4)
     returning id`,
    [u, JSON.stringify(pendingOpPayload), a, actionRow.updated_at]
  )
)[0]

await db.exec('set role authenticated')
await q("select set_config('request.jwt.claim.role', 'authenticated', false)")
await q("select set_config('request.jwt.claim.sub_usuario', $1, false)", [u])
const claimed = (
  await q('select public.agent_claim_pending_op($1, $2::jsonb) as ok', [
    pendingOp.id,
    JSON.stringify(pendingOpPayload),
  ])
)[0].ok
assert.equal(claimed, true)
const r2Result = (
  await q('select public.agent_apply_action_status($1, $2, $3, $4, $5) as res', [
    pendingOp.id,
    a,
    'Hecho',
    null,
    actionRow.updated_at,
  ])
)[0].res
assert.equal(r2Result.ok, true)
assert.equal(r2Result.estado, 'Hecho')
// Idempotent replay of R2 receipt returns replayed=true.
const r2Replay = (
  await q('select public.agent_apply_action_status($1, $2, $3, $4, $5) as res', [
    pendingOp.id,
    a,
    'Hecho',
    null,
    actionRow.updated_at,
  ])
)[0].res
assert.equal(r2Replay.replayed, true)
// R2 block history surfaces WhatsApp blocker comment cleanly.
const blockHistory = (await q('select public.agent_action_block_history($1) as hist', [a]))[0].hist
assert.equal(blockHistory.reportes.length, 1)
assert.equal(blockHistory.recibos.length, 1)

// RLS check on inbound jobs.
await assert.rejects(q('select whatsapp_enqueue_inbound($1)', [JSON.stringify(events)]), /permission denied/)
await assert.rejects(q('select * from whatsapp_inbound_jobs'), /permission denied/)
await db.exec('reset role')
await db.close()

console.log(
  'WhatsApp database (REAL PGlite SQL): P0001 reproduced & fixed, active/inactive & ownership, checked_by, anti-spoofing app.whatsapp_actor_id, tx-scope cleanup, SECURITY DEFINER/search_path/grants, CAS reconciliation, replay block, and R2 345c2b6 compatibility ALL PASSED.'
)
