import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

// Isolated PostgreSQL/WASM. Never connects to a Supabase project.
const { PGlite } = await import(pathToFileURL(process.env.WHATSAPP_PGLITE_PATH).href)
const db = new PGlite()
const migration = 'supabase/migrations/20261118150000_direction_executive_scope.sql'
function definition(file, name) {
  const text = readFileSync(file, 'utf8')
  const match = text.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\$\\$;', 'i'))
  assert.ok(match, name)
  return match[0]
}
function policy(file, name) {
  const match = readFileSync(file, 'utf8').match(new RegExp('CREATE POLICY ' + name + '[\\s\\S]*?;', 'i'))
  assert.ok(match, name)
  return match[0]
}
const direction = '00000000-0000-0000-0000-000000000001'
const peer = '00000000-0000-0000-0000-000000000002'
const admin = '00000000-0000-0000-0000-000000000003'
const analyst = '00000000-0000-0000-0000-000000000004'
const company = '20000000-0000-0000-0000-000000000001'
const team = '20000000-0000-0000-0000-000000000002'
const own = '10000000-0000-0000-0000-000000000001'
const foreign = '10000000-0000-0000-0000-000000000002'
const query = async (sql, values = []) => (await db.query(sql, values)).rows
const flag = async (sql, values = []) => (await query(sql, values))[0].value
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text; $$;
    grant usage on schema public,auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create table usuarios(id uuid primary key,user_id uuid,rol text,activo boolean,area text);
    create table user_roles(user_id uuid,app_role text);
    create table areas(id uuid primary key,nombre text);
    create table usuario_areas(user_id uuid,area_id uuid);
    create table catalog_roles(id uuid primary key,nombre text,system_key text,activo boolean);
    create table usuario_catalog_roles(user_id uuid,role_id uuid);
    create table okrs(id uuid primary key,scope text,area_id uuid,owner_user_id uuid);
    create table okr_key_results(id uuid primary key,okr_id uuid,owner_user_id uuid);
    create table acciones_diarias(id uuid primary key,responsable uuid,created_by uuid,updated_by uuid,titulo_accion text);
    create table acciones_equipo(id uuid primary key,lider_id uuid,asignado_a uuid,creado_por uuid);
    create table accion_comentarios(accion_id uuid,asignado uuid,etiquetas text[]);
    create table priorities(id uuid primary key,nombre text);
    create table academy_modules(id uuid primary key,title text);
    create schema storage;
    create table storage.objects(id uuid primary key,bucket_id text);
    create function normalize_business_role(value text) returns text language sql immutable as $$
      select replace(lower(value),' ','_');
    $$;
    create function get_my_usuario_id() returns uuid language sql security definer stable as $$
      select id from usuarios where user_id=auth.uid() and activo;
    $$;
    create function has_business_role(value text) returns boolean language sql security definer stable as $$
      select exists(select 1 from usuarios where user_id=auth.uid() and activo and normalize_business_role(rol)=normalize_business_role(value));
    $$;
    create function is_current_user_super_admin() returns boolean language sql security definer stable as $$
      select has_business_role('super_admin') or exists(select 1 from user_roles where user_id=auth.uid() and app_role='super_admin');
    $$;
    create function is_super_admin() returns boolean language sql stable as $$ select is_current_user_super_admin(); $$;
    create function is_app_admin() returns boolean language sql security definer stable as $$
      select exists(select 1 from user_roles where user_id=auth.uid() and app_role in ('admin','super_admin'));
    $$;
    create function is_business_admin() returns boolean language sql stable as $$
      select has_business_role('DG') or has_business_role('Sistemas') or has_business_role('super_admin');
    $$;
    create function is_business_analyst() returns boolean language sql stable as $$ select has_business_role('Analista'); $$;
    create function user_belongs_to_area_name(value text) returns boolean language sql security definer stable as $$
      select exists(select 1 from usuarios where user_id=auth.uid() and activo and area=value);
    $$;
    create function team_kanban_is_leader(value uuid) returns boolean language sql stable as $$ select false; $$;
    create function can_use_ai_whatsapp_for_usuario(value uuid) returns boolean language sql security definer stable as $$
      select exists(select 1 from usuarios where id=value and activo and (rol='super_admin' or area='OKRS'));
    $$;
    insert into usuarios values
      ('${direction}','${direction}','Direccion',true,'Comercial'),
      ('${peer}','${peer}','Operativo',true,'Operaciones'),
      ('${admin}','${admin}','super_admin',true,'Comercial'),
      ('${analyst}','${analyst}','Analista',true,'Operaciones');
    insert into areas values('40000000-0000-0000-0000-000000000001','Otro equipo');
    insert into okrs values
      ('${company}','company',null,'${peer}'),
      ('${team}','team','40000000-0000-0000-0000-000000000001','${peer}');
    insert into acciones_diarias values
      ('${own}','${direction}','${direction}',null,'Own fixture'),
      ('${foreign}','${peer}','${peer}',null,'Foreign fixture');
    insert into priorities values('50000000-0000-0000-0000-000000000001','Fixture');
    insert into academy_modules values('50000000-0000-0000-0000-000000000002','Fixture');
    insert into storage.objects values('50000000-0000-0000-0000-000000000003','academia');
  `)
  for (const [file, name] of [
    ['20260729163000_super_admin_can_manage_all_catalogs.sql', 'can_manage_catalogs'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'is_action_privileged_usuario'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'has_kanban_action_editor_role'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'can_edit_accion_general_as'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'can_edit_accion_general'],
    ['20260717120000_ensure_accion_full_permission_helpers.sql', 'can_manage_accion_full_as'],
    ['20260924120000_okr_management.sql', 'okr_active_user'],
    ['20261029120000_super_admin_view_all_okrs.sql', 'okr_manage_scope'],
    ['20261029120000_super_admin_view_all_okrs.sql', 'okr_can_view'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'can_manage_org_hierarchy'],
    ['20260823120000_challenges_module.sql', 'can_manage_challenges'],
    ['20260714130000_manual_gamification_rules.sql', 'can_edit_manual_gamification'],
    ['20260712160000_team_kanban_module.sql', 'team_kanban_is_admin'],
    ['20260712160000_team_kanban_module.sql', 'team_kanban_can_view'],
    ['20260722143000_team_kanban_direction_role_variants.sql', 'team_kanban_is_direction_role'],
    ['20260722143000_team_kanban_direction_role_variants.sql', 'team_kanban_is_super_admin'],
  ]) await db.exec(definition('supabase/migrations/' + file, name))
  await db.exec(`
    alter table okrs enable row level security;
    alter table acciones_diarias enable row level security;
    alter table priorities enable row level security;
    grant select,update on okrs,acciones_diarias,priorities to authenticated;
    grant select on accion_comentarios to authenticated;
    grant select,update on usuarios to authenticated;
    alter table usuarios enable row level security;
    create policy user_read on usuarios for select to authenticated using(true);
    create policy user_update on usuarios for update to authenticated using(user_id=auth.uid() or can_manage_catalogs());
    alter table academy_modules enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,update on academy_modules,storage.objects to authenticated;
    create policy legacy_academy on academy_modules for all to authenticated
      using(has_business_role('Direccion') or is_super_admin())
      with check(has_business_role('Direccion') or is_super_admin());
    create policy storage_read on storage.objects for select to authenticated using(true);
    create policy legacy_academy_storage on storage.objects for update to authenticated
      using(has_business_role('Direccion') or is_super_admin())
      with check(has_business_role('Direccion') or is_super_admin());
    create policy catalog_update on priorities for update to authenticated
      using(can_manage_catalogs()) with check(can_manage_catalogs());
    create policy catalog_read on priorities for select to authenticated using(true);
    create policy okr_update on okrs for update to authenticated
      using(okr_manage_scope(area_id)) with check(okr_manage_scope(area_id));
  `)
  await db.exec(policy('supabase/migrations/20260924120000_okr_management.sql','okrs_select_authenticated'))
  await db.exec(policy('supabase/migrations/20260701123000_stabilize_action_read_for_responsible_comments.sql','acciones_select_role_scoped'))
  await db.exec(policy('supabase/migrations/20260803123000_fix_direction_action_general_edit.sql','acciones_update_responsable_creator_or_admin'))
  const asUser = async id => {
    await db.exec('reset role')
    await query("select set_config('request.jwt.claim.sub',$1,false)", [id])
    await db.exec('set role authenticated')
  }
  await asUser(direction)
  assert.equal(await flag('select can_manage_catalogs() as value'),true)
  assert.equal(await flag('select is_action_privileged_usuario($1) as value',[direction]),true)
  await db.exec('reset role')
  await db.exec(readFileSync(migration,'utf8'))
  await db.exec('grant create on schema public to authenticated')
  await assert.rejects(db.exec(readFileSync(migration,'utf8')),/Unsafe public schema CREATE/)
  await db.exec('rollback; revoke create on schema public from authenticated')
  await db.exec('alter function public.has_business_role(text) owner to authenticated')
  await assert.rejects(db.exec(readFileSync(migration,'utf8')),/Untrusted permission function owner/)
  await db.exec('rollback; alter function public.has_business_role(text) owner to current_user')
  await db.exec(readFileSync(migration,'utf8'))
  await db.exec(readFileSync(migration,'utf8'))
  await asUser(direction)
  await db.exec('create temporary table user_roles(user_id uuid, app_role text)')
  await query("insert into pg_temp.user_roles values($1,'admin')",[direction])
  assert.equal(await flag('select public.can_manage_catalogs() as value'),false,
    'Temporary relations must not influence SECURITY DEFINER permission helpers')
  await db.exec('drop table pg_temp.user_roles')
  assert.equal(await flag('select can_manage_catalogs() as value'),false)
  assert.equal(await flag('select is_action_privileged_usuario($1) as value',[direction]),false)
  assert.equal(await flag('select can_manage_org_hierarchy() as value'),false)
  assert.equal(await flag('select can_manage_challenges() as value'),false)
  assert.equal(await flag('select can_edit_manual_gamification() as value'),false)
  assert.equal(await flag('select team_kanban_is_admin() as value'),false)
  assert.equal(await flag('select team_kanban_is_super_admin() as value'),false)
  await assert.rejects(query("update usuarios set rol='super_admin' where id=$1",[direction]),/Executive profile/)
  await assert.rejects(query("update usuarios set area='OKRS' where id=$1",[direction]),/Executive profile/)
  assert.equal((await query('select id from okrs')).length,2)
  assert.equal((await query('select id from acciones_diarias')).length,2)
  assert.equal((await query("update acciones_diarias set titulo_accion='Approved own' where id=$1 returning id",[own])).length,1)
  assert.equal((await query("update acciones_diarias set titulo_accion='Denied' where id=$1 returning id",[foreign])).length,0)
  assert.equal((await query("update priorities set nombre='Denied' returning id")).length,0)
  assert.equal((await query("update academy_modules set title='Denied' returning id")).length,0)
  assert.equal((await query("update storage.objects set bucket_id=bucket_id returning id")).length,0)
  assert.equal((await query("update okrs set scope=scope returning id")).length,0)
  assert.equal(await flag('select can_manage_accion_full_as($1,$2) as value',[foreign,direction]),false)
  await db.exec('reset role')
  await query("update usuarios set rol='Direccion general' where id=$1",[direction])
  await asUser(direction)
  assert.equal((await query('select id from okrs')).length,2)
  assert.equal(await flag('select can_manage_catalogs() as value'),false)
  assert.equal(await flag('select is_action_privileged_usuario($1) as value',[direction]),false)
  await assert.rejects(query("update usuarios set rol='super_admin' where id=$1",[direction]),/Executive profile/)
  await db.exec('reset role')
  await query("update usuarios set rol='Direccion' where id=$1",[direction])
  await asUser(direction)
  await assert.rejects(query('select can_query_ai_whatsapp_for_usuario($1)',[direction]),/permission denied/)
  await db.exec('reset role; set role service_role')
  assert.equal(await flag('select can_query_ai_whatsapp_for_usuario($1) as value',[direction]),true)
  assert.equal(await flag('select can_use_ai_whatsapp_for_usuario($1) as value',[direction]),false)
  await asUser(peer)
  assert.equal((await query('select id from okrs')).length,2) // The fixture owns both.
  await db.exec('reset role')
  await query("insert into catalog_roles values('60000000-0000-0000-0000-000000000001','Direccion general','direccion',true)")
  await query("insert into usuario_catalog_roles values($1,'60000000-0000-0000-0000-000000000001')",[peer])
  await asUser(peer)
  assert.equal(await flag('select is_current_user_direction() as value'),true)
  assert.equal(await flag('select can_manage_catalogs() as value'),false)
  await assert.rejects(query("update usuarios set rol='super_admin' where id=$1",[peer]),/Executive profile/)
  await db.exec('reset role')
  await query('delete from usuario_catalog_roles where user_id=$1',[peer])
  await asUser(analyst)
  assert.equal((await query('select id from okrs')).length,1)
  assert.equal((await query('select id from acciones_diarias')).length,0)
  await asUser(admin)
  assert.equal(await flag('select can_manage_catalogs() as value'),true)
  assert.equal((await query("update acciones_diarias set titulo_accion='Admin fixture' where id=$1 returning id",[foreign])).length,1)
  await db.exec('reset role')
  await query("insert into user_roles values($1,'admin')",[direction])
  await asUser(direction)
  assert.equal(await flag('select can_manage_catalogs() as value'),true)
  assert.equal(await flag('select is_action_privileged_usuario($1) as value',[direction]),true)
  await db.exec('reset role')
  await query('update usuarios set activo=false where id=$1',[direction])
  await asUser(direction)
  assert.equal(await flag('select can_manage_catalogs() as value'),false)
  assert.equal(await flag('select is_action_privileged_usuario($1) as value',[direction]),false)
  await assert.rejects(query('update usuarios set activo=true where id=$1',[direction]),/Executive profile/)
  await db.exec('reset role')
  await query('update usuarios set activo=true where id=$1',[direction])
  await query('delete from user_roles where user_id=$1',[direction])
  const securityBeforeRollback = await query(
    "select proname, prosrc, proacl, proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")
  await db.exec(readFileSync('supabase/scripts/rollback_direction_executive_scope.sql','utf8'))
  assert.deepEqual(await query(
    "select proname, prosrc, proacl, proconfig from pg_proc where pronamespace='public'::regnamespace order by oid"),
    securityBeforeRollback)
  await asUser(direction)
  assert.equal(await flag('select can_manage_catalogs() as value'),false)
  assert.equal(await flag('select is_action_privileged_usuario($1) as value',[direction]),false)
  await db.exec('reset role')
  await db.exec(readFileSync(migration,'utf8'))
  console.log('Local PostgreSQL: migration, RLS, explicit grants, security-preserving rollback and reapply passed.')
} finally {
  await db.close()
}
