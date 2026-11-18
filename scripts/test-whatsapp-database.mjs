import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const { PGlite } = await import(
  pathToFileURL(process.env.WHATSAPP_PGLITE_PATH).href
)
const db = new PGlite()
await db.exec(`
create role anon;create role authenticated;create role service_role bypassrls;
create table usuarios(id uuid primary key,activo boolean);
create type action_status as enum ('Pendiente','En_Ejecucion','Bloqueado','Hecho','Verificado');
create table acciones_diarias(id uuid primary key,responsable uuid,titulo_accion text,estado action_status,causa_raiz text,completed_at timestamptz,completed_by uuid);
create table accion_checkpoints(id uuid primary key,accion_id uuid,texto text,activo boolean,completado boolean,checked_at timestamptz,checked_by uuid);
create table statuses(id uuid primary key,nombre text,activo boolean,orden integer,es_cierre boolean);
create table acciones_equipo(id uuid primary key,asignado_a uuid,estado_id uuid,checklist jsonb,bloqueada boolean,completed_at timestamptz,updated_at timestamptz);
create table accion_comentarios(accion_id uuid,contenido text,created_by uuid,tipo_comentario text);
create table equipo_accion_comentarios(accion_id uuid,contenido text,created_by uuid,tipo_comentario text);
create table whatsapp_result_requests(scope text,accion_id uuid,team_action_id uuid,checkpoint_id uuid,checklist_index integer,usuario_id uuid,wa_id text,status text,expires_at timestamptz);
create table whatsapp_followup_jobs(accion_id uuid,team_action_id uuid,checkpoint_id uuid,checklist_index integer,usuario_id uuid,status text,updated_at timestamptz,error_message text);
`)
const migration = readFileSync(
  'supabase/migrations/20261117180000_whatsapp_durable_inbound.sql',
  'utf8'
).replace(/^\uFEFF/, '')
await db.exec(migration)
await db.exec(migration)
const u = '00000000-0000-0000-0000-000000000001',
  other = '00000000-0000-0000-0000-000000000002',
  a = '10000000-0000-0000-0000-000000000001',
  team = '20000000-0000-0000-0000-000000000001'
await db.exec(`insert into usuarios values('${u}',true),('${other}',true);insert into acciones_diarias values('${a}','${u}','Prueba','Pendiente',null,null,null);insert into accion_checkpoints values('30000000-0000-0000-0000-000000000001','${a}','Paso',true,false,null,null);
insert into statuses values('40000000-0000-0000-0000-000000000001','Hecho',true,1,true),('40000000-0000-0000-0000-000000000002','En_Ejecucion',true,2,false),('40000000-0000-0000-0000-000000000003','Verificado',true,3,true);
insert into acciones_equipo values('${team}','${u}',null,'[{"text":"Paso","done":false}]',false,null,null);`)
async function q(sql, args = []) {
  return (await db.query(sql, args)).rows
}
await q("insert into whatsapp_followup_jobs(accion_id,usuario_id,status) values($1,$2,'pending')", [a,u])
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5)', [
    'forged',
    other,
    a,
    'done',
    '15550002222',
  ]),
  /not_authorized/
)
await q('select whatsapp_apply_action($1,$2,$3,$4,$5)', [
  'done',
  u,
  a,
  'done',
  '15550002222',
])
await q('select whatsapp_apply_action($1,$2,$3,$4,$5)', [
  'done',
  u,
  a,
  'done',
  '15550002222',
])
assert.equal(
  (await q('select estado from acciones_diarias'))[0].estado,
  'Hecho'
)
assert.equal((await q('select status from whatsapp_followup_jobs'))[0].status, 'canceled')
assert.equal(
  (await q('select count(*)::int n from whatsapp_result_requests'))[0].n,
  1
)
await assert.rejects(
  q('select whatsapp_apply_action($1,$2,$3,$4,$5)', [
    'block',
    u,
    a,
    'support',
    '15550002222',
  ]),
  /block_reason_required/
)
await q('select whatsapp_apply_action($1,$2,$3,$4,$5,$6)', [
  'block',
  u,
  a,
  'support',
  '15550002222',
  'Falta material',
])
assert.equal(
  (await q('select estado from acciones_diarias'))[0].estado,
  'Bloqueado'
)
assert.equal(
  (await q('select count(*)::int n from accion_comentarios'))[0].n,
  1
)
await q('select whatsapp_apply_action($1,$2,$3,$4,$5)', [
  'progress',
  u,
  a,
  'progress',
  '15550002222',
])
assert.equal(
  (await q('select estado from acciones_diarias'))[0].estado,
  'En_Ejecucion'
)
await assert.rejects(
  q('select whatsapp_apply_team($1,$2,$3,$4,$5,$6)', [
    'team',
    other,
    team,
    0,
    'done',
    '15550002222',
  ]),
  /not_authorized/
)
await q('select whatsapp_apply_team($1,$2,$3,$4,$5,$6)', [
  'team',
  u,
  team,
  0,
  'done',
  '15550002222',
])
assert.equal(
  (
    await q(
      'select s.nombre from acciones_equipo a join statuses s on s.id=a.estado_id'
    )
  )[0].nombre,
  'Hecho'
)
await q('select whatsapp_apply_team($1,$2,$3,$4,$5,$6,$7)', [
  'teamblock',
  u,
  team,
  0,
  'support',
  '15550002222',
  'Sin acceso',
])
assert.equal(
  (await q('select bloqueada from acciones_equipo'))[0].bloqueada,
  true
)
const events = [
  {
    key: 'message:1',
    phone: 'phone',
    sender: '15550002222',
    kind: 'message',
    payload: {},
  },
  {
    key: 'message:2',
    phone: 'phone',
    sender: '15550002222',
    kind: 'message',
    payload: {},
  },
]
await q('select whatsapp_enqueue_inbound($1)', [JSON.stringify(events)])
await q('select whatsapp_enqueue_inbound($1)', [JSON.stringify(events)])
assert.equal(
  (await q('select count(*)::int n from whatsapp_inbound_jobs'))[0].n,
  2
)
let job = (await q('select * from whatsapp_claim_inbound()'))[0]
assert.equal((await q('select * from whatsapp_claim_inbound()')).length, 0)
await q('select whatsapp_finish_inbound($1,$2,false,$3)', [
  job.id,
  job.lease_token,
  'database_error',
])
await db.exec('update whatsapp_inbound_jobs set available_at=now()')
job = (await q('select * from whatsapp_claim_inbound()'))[0]
assert.equal(job.attempts, 2)
await q('select whatsapp_mark_effect($1,$2,$3)', [
  job.id,
  job.lease_token,
  'provider_request',
])
await q('select whatsapp_finish_inbound($1,$2,false,$3)', [
  job.id,
  job.lease_token,
  'provider_unknown',
])
assert.equal(
  (await q('select status from whatsapp_inbound_jobs where id=$1', [job.id]))[0]
    .status,
  'review'
)
assert.equal((await q('select * from whatsapp_claim_inbound()')).length, 0)
await assert.rejects(
  q('select whatsapp_mark_effect($1,$2,$3)', [
    job.id,
    job.lease_token,
    'stale',
  ]),
  /lease_lost/
)
await db.exec('set role authenticated')
await assert.rejects(
  q('select whatsapp_enqueue_inbound($1)', [JSON.stringify(events)]),
  /permission denied/
)
await assert.rejects(
  q('select * from whatsapp_inbound_jobs'),
  /permission denied/
)
await db.exec('reset role')
await db.close()
console.log(
  'WhatsApp database: migration reapplication, atomic authorization, Hecho, block reason, team mapping, dedup, leases, safe retries and RLS passed.'
)
