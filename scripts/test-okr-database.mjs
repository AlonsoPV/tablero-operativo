// Run with OKR_PGLITE_PATH pointing at an installed @electric-sql/pglite module.
// Uses an isolated PostgreSQL engine; never connects to Supabase.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(
  process.env.OKR_PGLITE_PATH
    ? pathToFileURL(process.env.OKR_PGLITE_PATH).href
    : '@electric-sql/pglite'
)
const db = new PGlite()
const legacySchema = process.argv.includes('--legacy')
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE usuarios(id uuid PRIMARY KEY, user_id uuid, nombre text, area text, activo boolean);
  CREATE TABLE areas(id uuid PRIMARY KEY, nombre text);
  CREATE TABLE usuario_areas(user_id uuid, area_id uuid);
  CREATE TABLE area_lideres(user_id uuid, area_id uuid);
  CREATE TABLE catalog_roles(id uuid PRIMARY KEY, activo boolean);
  CREATE TABLE app_modules(key text PRIMARY KEY, nombre text, descripcion text, route text, section text, sort_order integer, activo boolean DEFAULT true);
  CREATE TABLE catalog_role_modules(role_id uuid, module_key text, PRIMARY KEY(role_id, module_key));
  CREATE TABLE okrs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre_okr text, descripcion text, periodo text, activo boolean DEFAULT true, updated_at timestamptz DEFAULT now());
  ${
    legacySchema
      ? ''
      : `ALTER TABLE okrs ADD COLUMN title text, ADD COLUMN start_date date, ADD COLUMN end_date date;
  CREATE TABLE okr_key_results(id uuid PRIMARY KEY, okr_id uuid REFERENCES okrs(id), title text, baseline_value numeric, target_value numeric, current_value numeric, unit text, direction text, metric_type text, display_order integer DEFAULT 0, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(okr_id, metric_type));`
  }
  CREATE TABLE acciones_diarias(id uuid PRIMARY KEY, titulo_accion text, area text, estado text, responsable uuid);
  CREATE TABLE statuses(id uuid PRIMARY KEY, es_cierre boolean, nombre text);
  CREATE TABLE acciones_equipo(id uuid PRIMARY KEY, titulo text, area_id uuid, estado_id uuid REFERENCES statuses(id), asignado_a uuid);
  CREATE FUNCTION public.get_my_usuario_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT id FROM usuarios WHERE user_id = auth.uid() $$;
  CREATE FUNCTION public.can_manage_catalogs() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() = '00000000-0000-0000-0000-000000000001'::uuid $$;
  CREATE FUNCTION public.team_kanban_is_leader(p_area uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS (SELECT 1 FROM area_lideres WHERE area_id = p_area AND user_id = public.get_my_usuario_id()) $$;
  ${legacySchema ? '' : "CREATE FUNCTION public.operational_okr_is_closed_action(a acciones_diarias) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT a.estado = 'Hecho' $$;"}
  ALTER TABLE okrs ENABLE ROW LEVEL SECURITY;
  ${legacySchema ? '' : 'ALTER TABLE okr_key_results ENABLE ROW LEVEL SECURITY;'}
  ALTER TABLE acciones_diarias ENABLE ROW LEVEL SECURITY;
  ALTER TABLE acciones_equipo ENABLE ROW LEVEL SECURITY;
  CREATE POLICY action_read ON acciones_diarias FOR SELECT TO authenticated USING (responsable = public.get_my_usuario_id() OR public.can_manage_catalogs());
  CREATE POLICY team_action_read ON acciones_equipo FOR SELECT TO authenticated USING (asignado_a = public.get_my_usuario_id() OR public.team_kanban_is_leader(area_id) OR public.can_manage_catalogs());
  GRANT USAGE ON SCHEMA public, auth TO authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
`)
const migration = await readFile(
  new URL(
    '../supabase/migrations/20260924120000_okr_management.sql',
    import.meta.url
  ),
  'utf8'
)
await db.exec(
  "INSERT INTO okrs(id, nombre_okr) VALUES ('00000000-0000-0000-0000-000000000099', 'Objetivo anterior')"
)
const ownerMigration = await readFile(
  new URL(
    '../supabase/migrations/20260925120000_okr_objective_owner.sql',
    import.meta.url
  ),
  'utf8'
)
await db.exec(migration)
await db.exec(migration)
await db.exec(ownerMigration)
await db.exec(ownerMigration)
assert.equal(
  (
    await db.query(
      "SELECT title FROM okrs WHERE id = '00000000-0000-0000-0000-000000000099'"
    )
  ).rows[0].title,
  'Objetivo anterior'
)
await db.exec(
  "DELETE FROM okrs WHERE id = '00000000-0000-0000-0000-000000000099'"
)
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
await db.exec(`
  INSERT INTO usuarios VALUES ('${id(1)}','${id(1)}','Admin',null,true),('${id(2)}','${id(2)}','Líder','Equipo A',true),('${id(3)}','${id(3)}','Dueño','Equipo A',true),('${id(4)}','${id(4)}','Otro','Equipo B',true);
  INSERT INTO areas VALUES ('${id(10)}','Equipo A'),('${id(11)}','Equipo B');
  INSERT INTO usuario_areas VALUES ('${id(2)}','${id(10)}'),('${id(3)}','${id(10)}'),('${id(4)}','${id(11)}');
  INSERT INTO area_lideres VALUES ('${id(2)}','${id(10)}');
  INSERT INTO statuses VALUES ('${id(30)}',false,'Pendiente'),('${id(31)}',true,'Hecho');
  INSERT INTO acciones_diarias VALUES ('${id(20)}','Acción corporativa','Equipo A','Pendiente','${id(3)}');
  INSERT INTO acciones_equipo VALUES ('${id(21)}','Acción de equipo','${id(10)}','${id(30)}','${id(3)}'),('${id(22)}','Acción ajena','${id(11)}','${id(30)}','${id(4)}');
  SET ROLE authenticated;
`)
async function as(n) {
  await db.query("SELECT set_config('test.uid', $1, false)", [id(n)])
}
async function call(name, args = []) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(',')
  return (
    await db.query(`SELECT public.${name}(${placeholders}) AS result`, args)
  ).rows[0].result
}
async function rejects(operation, pattern) {
  await assert.rejects(operation, pattern)
}
const objective = {
  nombre_okr: 'Mejorar entregas',
  scope: 'company',
  area_id: null,
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  owner_user_id: id(3),
  activo: true,
}
await as(1)
const companyId = await call('okr_save_objective', [objective, null])
await rejects(
  () =>
    call('okr_save_objective', [{ ...objective, owner_user_id: null }, null]),
  /responsable/
)
await rejects(
  () =>
    call('okr_save_objective', [
      { ...objective, end_date: '2026-08-31' },
      null,
    ]),
  /periodo válido/
)
await as(2)
await rejects(() => call('okr_save_objective', [objective, null]), /permiso/)
const teamId = await call('okr_save_objective', [
  { ...objective, scope: 'team', area_id: id(10) },
  null,
])
const krInput = {
  title: 'Reducir tiempo de entrega',
  baseline_value: 24,
  target_value: 8,
  owner_user_id: id(3),
  unit: 'horas',
}
const krId = await call('okr_save_key_result', [teamId, krInput, null])
await rejects(
  () =>
    call('okr_save_key_result', [
      teamId,
      { ...krInput, target_value: 24 },
      null,
    ]),
  /línea base/
)
await rejects(
  () =>
    call('okr_save_objective', [
      { ...objective, scope: 'team', area_id: id(11) },
      teamId,
    ]),
  /permiso/
)
await as(3)
await call('okr_check_in', [krId, 16, 'Medición semanal'])
let dashboard = await call('okr_dashboard')
assert.equal(dashboard.keyResults[0].current_value, 16)
assert.equal(dashboard.checkIns.length, 2)
assert.equal(dashboard.objectives.length, 2)
assert.equal(
  dashboard.objectives.find((o) => o.id === teamId).can_manage,
  false
)
await rejects(
  () => call('okr_save_key_result', [teamId, krInput, krId]),
  /editar/
)
await db.query(
  'INSERT INTO okr_initiatives(key_result_id, team_action_id) VALUES ($1,$2)',
  [krId, id(21)]
)
await rejects(
  () =>
    db.query(
      'INSERT INTO okr_initiatives(key_result_id, team_action_id) VALUES ($1,$2)',
      [krId, id(22)]
    ),
  /no es accesible/
)
await rejects(
  () =>
    db.query(
      'INSERT INTO okr_initiatives(key_result_id, team_action_id) VALUES ($1,$2)',
      [krId, id(21)]
    ),
  /duplicate key/
)
await rejects(() => call('okr_check_in', [krId, 'NaN', '']), /finito/)
await as(4)
dashboard = await call('okr_dashboard')
assert.equal(dashboard.objectives.length, 1)
assert.equal(dashboard.objectives[0].id, companyId)
assert.equal(dashboard.keyResults.length, 0)
assert.equal(dashboard.initiatives.length, 0)
await rejects(() => call('okr_check_in', [krId, 8, '']), /permiso/)
await rejects(
  () =>
    db.query(
      'INSERT INTO okr_initiatives(key_result_id, team_action_id) VALUES ($1,$2)',
      [krId, id(22)]
    ),
  /row-level security/
)
await as(1)
await rejects(
  () =>
    call('okr_save_objective', [
      { ...objective, scope: 'team', area_id: id(11) },
      teamId,
    ]),
  /ámbito/
)
await call('okr_save_objective', [
  { ...objective, scope: 'team', area_id: id(10), activo: false },
  teamId,
])
await as(3)
await rejects(() => call('okr_check_in', [krId, 8, '']), /permiso/)
await as(1)
await call('okr_save_objective', [
  { ...objective, scope: 'team', area_id: id(10), activo: true },
  teamId,
])
await as(3)
await call('okr_check_in', [krId, 8, 'Meta alcanzada'])
await db.exec('RESET ROLE')
await db.query('UPDATE statuses SET es_cierre = true WHERE id = $1', [id(30)])
await db.exec('SET ROLE authenticated')
const actions = await call('okr_action_options')
assert.equal(actions.find((a) => a.id === id(21)).closed, true)
assert.equal((await call('okr_dashboard')).keyResults[0].current_value, 8)
// Unlinking removes only the relationship, never the action or the measurement.
await db.query('DELETE FROM okr_initiatives WHERE key_result_id = $1', [krId])
assert.equal((await call('okr_dashboard')).initiatives.length, 0)
assert.ok((await call('okr_action_options')).some((a) => a.id === id(21)))
assert.equal((await call('okr_dashboard')).keyResults[0].current_value, 8)
// Reassignment immediately updates who can record measurements, even across teams.
await as(1)
await call('okr_save_key_result', [
  teamId,
  { ...krInput, owner_user_id: id(4) },
  krId,
])
await as(3)
await rejects(
  () => call('okr_check_in', [krId, 7, 'Anterior dueño']),
  /permiso/
)
await as(4)
assert.ok((await call('okr_dashboard')).objectives.some((o) => o.id === teamId))
await call('okr_check_in', [krId, 7, 'Nuevo dueño'])
assert.equal((await call('okr_dashboard')).keyResults[0].current_value, 7)
await as(1)
await call('okr_save_key_result', [teamId, krInput, krId])
await as(3)
await db.exec('RESET ROLE')
await db.query('UPDATE usuarios SET activo = false WHERE id = $1', [id(3)])
await db.exec('SET ROLE authenticated')
assert.equal((await call('okr_dashboard')).objectives.length, 0)
await rejects(() => call('okr_check_in', [krId, 9, '']), /permiso/)
await db.exec('RESET ROLE')
const beforeRerun = (
  await db.query('SELECT count(*) AS total FROM okr_check_ins')
).rows[0].total
await db.exec(migration)
assert.equal(
  (await db.query('SELECT count(*) AS total FROM okr_check_ins')).rows[0].total,
  beforeRerun
)
assert.equal(
  Number(
    (
      await db.query(
        'SELECT current_value FROM okr_key_results WHERE id = $1',
        [krId]
      )
    ).rows[0].current_value
  ),
  7
)
// Reporting upgrade must preserve old records without inventing their targets.
await db.exec(ownerMigration)
const reportMigration = await readFile(new URL('../supabase/migrations/20260928120000_okr_reporting_history.sql', import.meta.url), 'utf8')
await db.exec(reportMigration)
await db.exec(reportMigration)
assert.equal((await db.query('SELECT count(*) AS total FROM okr_check_ins WHERE target_snapshot IS NOT NULL')).rows[0].total, 0)
await db.exec('SET ROLE authenticated')
await as(1)
await call('okr_save_key_result', [teamId, { ...krInput, owner_user_id: id(1) }, krId])
await call('okr_check_in', [krId, 12, 'Referencia original'])
await call('okr_save_key_result', [teamId, { ...krInput, owner_user_id: id(1), target_value: 4, unit: 'horas ajustadas' }, krId])
await call('okr_check_in', [krId, 10, 'Referencia nueva'])
let report = await call('okr_reporting_history', [teamId, null, null])
const original = report.find((e) => e.details.note === 'Referencia original')
const revised = report.find((e) => e.details.note === 'Referencia nueva')
assert.equal(original.details.target_snapshot, 8)
assert.equal(original.details.unit_snapshot, 'horas')
assert.equal(revised.details.target_snapshot, 4)
assert.equal(revised.details.unit_snapshot, 'horas ajustadas')
assert.ok(report.some((e) => e.kind === 'configuration' && e.details.before.target_value === 8 && e.details.after.target_value === 4))
await as(4)
assert.deepEqual(await call('okr_reporting_history', [teamId, null, null]), [])
await as(1)
// Simultaneous timestamps exercise UUID pagination; no event may repeat or disappear.
await db.exec('BEGIN')
for (let i = 0; i < 60; i++) await call('okr_check_in', [krId, i, `Página ${i}`])
await db.exec('COMMIT')
const seen = []
let cursor = [null, null]
do {
  report = await call('okr_reporting_history', [teamId, ...cursor])
  const page = report.slice(0, 50)
  seen.push(...page.map((e) => e.id))
  const last = page.at(-1)
  cursor = last ? [last.created_at, last.id] : [null, null]
} while (report.length > 50)
assert.equal(new Set(seen).size, seen.length)
const expected = (await db.query('SELECT (SELECT count(*) FROM okr_check_ins WHERE key_result_id = $1) + (SELECT count(*) FROM okr_change_log WHERE okr_id = $2) AS total', [krId, teamId])).rows[0].total
assert.equal(seen.length, Number(expected))
await db.exec('RESET ROLE')
await db.exec(reportMigration)
assert.equal((await db.query("SELECT target_snapshot FROM okr_check_ins WHERE note = 'Referencia original'")).rows[0].target_snapshot, '8')
await db.close()
console.log(
  `OKR database integration passed (${legacySchema ? 'original schema without start_date/KRs' : 'operational schema'}): migrations, RLS, ownership, reporting snapshots, configuration audit and pagination preserve data.`
)
