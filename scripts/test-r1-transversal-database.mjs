import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

// Isolated PostgreSQL/WASM. Never connects to a Supabase project.
const { PGlite } = await import(pathToFileURL(process.env.WHATSAPP_PGLITE_PATH).href)
const db = new PGlite()
const r0Migration = 'supabase/migrations/20261118150000_direction_executive_scope.sql'
const migrationA = 'supabase/migrations/20261119140000_r1_transversal_access.sql'
const scriptB = 'supabase/scripts/apply_r1_revoke_legacy_okrs_area.sql'
const auditScript = 'supabase/scripts/audit_okrs_area_legacy_grants.sql'
const parity = JSON.parse(readFileSync('scripts/fixtures/r1-capability-parity.json', 'utf8'))

function definition(file, name) {
  const text = readFileSync('supabase/migrations/' + file, 'utf8')
  const match = text.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\$\\$;', 'i'))
  assert.ok(match, name)
  return match[0]
}
function policy(file, name) {
  const match = readFileSync('supabase/migrations/' + file, 'utf8').match(new RegExp('CREATE POLICY ' + name + '[\\s\\S]*?;', 'i'))
  assert.ok(match, name)
  return match[0]
}

const id = (n) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
const area = {
  OKRS: '40000000-0000-0000-0000-000000000001',
  Ventas: '40000000-0000-0000-0000-000000000002',
  Comercial: '40000000-0000-0000-0000-000000000003',
  Sistemas: '40000000-0000-0000-0000-000000000004',
  RH: '40000000-0000-0000-0000-000000000005',
  Otro: '40000000-0000-0000-0000-000000000006',
}
const users = Object.fromEntries(parity.profiles.map((p, i) => [p.name, id(i + 1)]))
users.rh = id(90)
const query = async (sql, values = []) => (await db.query(sql, values)).rows
const flag = async (sql, values = []) => (await query(sql, values))[0].value
const count = async (sql, values = []) => Number((await query(sql, values))[0].n)
const camel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const passed = []
const check = async (label, fn) => { await fn(); passed.push(label) }

const asUser = async (userId) => {
  await db.exec('reset role')
  await query("select set_config('request.jwt.claim.sub',$1,false)", [userId])
  await db.exec('set role authenticated')
}
const asService = async () => {
  await db.exec('reset role')
  await query("select set_config('request.jwt.claim.sub','',false)")
  await db.exec('set role service_role')
}
const asOwner = async () => {
  await db.exec('reset role')
  await query("select set_config('request.jwt.claim.sub','',false)")
}
const capsOf = async (userId) => {
  await asService()
  const row = (await query('select public.access_capabilities_for_usuario($1) as value', [userId]))[0].value
  await asOwner()
  return Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'legacy_okrs_area_grants').map(([k, v]) => [camel(k), v]))
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text; $$;
    grant usage on schema public,auth to authenticated,service_role;
    grant execute on function auth.uid(), auth.role() to authenticated,service_role;
    create table usuarios(id uuid primary key,user_id uuid,nombre text,rol text,activo boolean,area text,
      manager_user_id uuid,created_at timestamptz default now(),updated_at timestamptz default now());
    create table user_roles(user_id uuid,app_role text);
    create table areas(id uuid primary key,nombre text,activo boolean default true);
    create table usuario_areas(id uuid primary key default gen_random_uuid(),user_id uuid references usuarios(id) on delete cascade,
      area_id uuid references areas(id),is_primary boolean not null default false,unique(user_id,area_id));
    create unique index usuario_areas_one_primary on usuario_areas(user_id) where is_primary;
    create table catalog_roles(id uuid primary key,nombre text,system_key text,activo boolean);
    create table usuario_catalog_roles(user_id uuid,role_id uuid);
    create table app_modules(key text primary key,nombre text,descripcion text,route text not null,section text,
      sort_order int,activo boolean not null default true);
    create table catalog_role_modules(role_id uuid,module_key text);
    create table okrs(id uuid primary key,scope text,area_id uuid,owner_user_id uuid);
    create table okr_key_results(id uuid primary key,okr_id uuid,owner_user_id uuid);
    create table acciones_diarias(id uuid primary key,responsable uuid,created_by uuid,updated_by uuid,titulo_accion text,area text);
    create table acciones_equipo(id uuid primary key,lider_id uuid,asignado_a uuid,creado_por uuid,es_okr boolean default false);
    create table accion_comentarios(accion_id uuid,asignado uuid,etiquetas text[]);
    create table priorities(id uuid primary key,nombre text);
    create table academy_modules(id uuid primary key,title text);
    create schema storage;
    create table storage.objects(id uuid primary key,bucket_id text);
    create table whatsapp_messages(id uuid primary key default gen_random_uuid(),wa_id text,usuario_id uuid,direction text,
      source text,message_kind text,body_text text,meta_message_id text,delivery_status text,operator_usuario_id uuid,
      error_message text,payload jsonb,created_at timestamptz default now(),sent_at timestamptz,delivered_at timestamptz,
      read_at timestamptz,failed_at timestamptz);
    create table user_channel_identities(id uuid primary key default gen_random_uuid(),usuario_id uuid,channel text,
      external_user_id text,external_chat_id text,display_name text,status text,verified_at timestamptz,
      last_seen_at timestamptz,metadata jsonb default '{}'::jsonb,updated_at timestamptz,unique(channel,usuario_id));
    create table external_inbound_messages(channel text,external_user_id text,created_at timestamptz default now());
    create table whatsapp_followup_settings(id int primary key,enabled boolean);
    create function normalize_business_role(value text) returns text language sql immutable as $$
      select replace(lower(trim(value)),' ','_');
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
    create function team_kanban_is_leader(value uuid) returns boolean language sql stable as $$ select false; $$;
    create function can_use_ai_whatsapp_for_usuario(p_usuario_id uuid) returns boolean language sql security definer stable as $$
      select exists(select 1 from usuarios where id=p_usuario_id and activo and (rol='super_admin' or area='OKRS'));
    $$;
  `)
  for (const [file, name] of [
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'usuario_area_names'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'user_belongs_to_area_name'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'sync_usuario_primary_area'],
    ['20260729163000_super_admin_can_manage_all_catalogs.sql', 'can_manage_catalogs'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'can_manage_org_hierarchy'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'settings_users_set_areas'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'is_action_privileged_usuario'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'has_kanban_action_editor_role'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'can_edit_accion_general_as'],
    ['20260803123000_fix_direction_action_general_edit.sql', 'can_edit_accion_general'],
    ['20260717120000_ensure_accion_full_permission_helpers.sql', 'can_manage_accion_full_as'],
    ['20260924120000_okr_management.sql', 'okr_active_user'],
    ['20261029120000_super_admin_view_all_okrs.sql', 'okr_manage_scope'],
    ['20261029120000_super_admin_view_all_okrs.sql', 'okr_can_view'],
    ['20260823120000_challenges_module.sql', 'can_manage_challenges'],
    ['20260714130000_manual_gamification_rules.sql', 'can_edit_manual_gamification'],
    ['20260712160000_team_kanban_module.sql', 'team_kanban_is_admin'],
    ['20260712160000_team_kanban_module.sql', 'team_kanban_can_view'],
    ['20260722143000_team_kanban_direction_role_variants.sql', 'team_kanban_is_direction_role'],
    ['20260722143000_team_kanban_direction_role_variants.sql', 'team_kanban_is_super_admin'],
  ]) await db.exec(definition(file, name))
  await db.exec(`
    create trigger trg_usuario_areas_sync_primary after insert or update or delete on usuario_areas
      for each row execute function sync_usuario_primary_area();
    alter table okrs enable row level security;
    alter table acciones_diarias enable row level security;
    alter table usuarios enable row level security;
    alter table usuario_areas enable row level security;
    alter table whatsapp_messages enable row level security;
    alter table whatsapp_followup_settings enable row level security;
    alter table priorities enable row level security;
    alter table academy_modules enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,update on okrs,acciones_diarias,priorities,academy_modules,storage.objects to authenticated;
    grant select on accion_comentarios,acciones_equipo,areas,whatsapp_messages to authenticated;
    grant select,update on usuarios,whatsapp_followup_settings to authenticated;
    grant select,insert,update,delete on usuario_areas to authenticated;
    create policy user_read on usuarios for select to authenticated using(true);
    create policy user_update on usuarios for update to authenticated using(user_id=auth.uid() or can_manage_catalogs());
    -- Test-only permissive write path: proves the trigger guard holds even if a future policy opens usuario_areas.
    create policy test_only_open_usuario_areas on usuario_areas for all to authenticated using(true) with check(true);
    create policy okr_update on okrs for update to authenticated
      using(okr_manage_scope(area_id)) with check(okr_manage_scope(area_id));
  `)
  await db.exec(policy('20260924120000_okr_management.sql', 'okrs_select_authenticated'))
  await db.exec(policy('20260701123000_stabilize_action_read_for_responsible_comments.sql', 'acciones_select_role_scoped'))

  // Fixture rows derived from the shared TS/SQL parity profiles.
  await db.exec(`insert into areas(id,nombre) values
    ('${area.OKRS}','OKRS'),('${area.Ventas}','Ventas'),('${area.Comercial}','Comercial'),
    ('${area.Sistemas}','Sistemas'),('${area.RH}','RH'),('${area.Otro}','Otro equipo');
    insert into app_modules(key,nombre,route) values ('okrs','OKRs','/okrs'),('kanban','Kanban','/kanban');`)
  for (const [index, profile] of parity.profiles.entries()) {
    const uid = users[profile.name]
    const { rol, appRole, area: areaName, relationalAreas, moduleKeys, active } = profile.input
    await query('insert into usuarios(id,user_id,nombre,rol,activo,area) values($1,$1,$2,$3,$4,$5)',
      [uid, profile.name, rol, active, areaName])
    if (appRole) await query('insert into user_roles values($1,$2)', [uid, appRole])
    for (const [i, name] of relationalAreas.entries())
      await query('insert into usuario_areas(user_id,area_id,is_primary) values($1,$2,$3)', [uid, area[name], i === 0])
    if (moduleKeys.length) {
      const roleId = id(500 + index)
      await query('insert into catalog_roles values($1,$2,null,true)', [roleId, 'Rol ' + profile.name])
      await query('insert into usuario_catalog_roles values($1,$2)', [uid, roleId])
      for (const key of moduleKeys) await query('insert into catalog_role_modules values($1,$2)', [roleId, key])
    }
  }
  await query("insert into usuarios(id,user_id,nombre,rol,activo,area) values($1,$1,'rh','Operativo',true,'RH')", [users.rh])
  await query('insert into usuario_areas(user_id,area_id,is_primary) values($1,$2,true)', [users.rh, area.RH])
  const U = users
  await db.exec(`
    insert into okrs values
      ('60000000-0000-0000-0000-000000000001','team','${area.Otro}','${U.catalog_admin_dg}'),
      ('60000000-0000-0000-0000-000000000002','company',null,'${U.catalog_admin_dg}');
    insert into acciones_diarias(id,responsable,created_by,titulo_accion,area) values
      ('70000000-0000-0000-0000-000000000001','${U.manager}','${U.manager}','Ventas','Ventas'),
      ('70000000-0000-0000-0000-000000000002','${U.collaborator}','${U.collaborator}','Propia','Ventas'),
      ('70000000-0000-0000-0000-000000000003','${U.catalog_admin_dg}','${U.catalog_admin_dg}','Sistemas','Sistemas');
    insert into acciones_equipo values
      ('80000000-0000-0000-0000-000000000001','${U.manager}','${U.manager}','${U.manager}',true),
      ('80000000-0000-0000-0000-000000000002','${U.manager}','${U.manager}','${U.manager}',false);
    insert into whatsapp_messages(wa_id,usuario_id,direction,body_text) values
      ('5215550000001','${U.manager}','inbound','hola'),('5215550000002','${U.collaborator}','inbound','hola');
    insert into user_channel_identities(usuario_id,channel,external_user_id,status)
      values('${U.manager}','whatsapp','5215550000001','active');
    insert into whatsapp_followup_settings values(1,true);
  `)

  await db.exec(readFileSync(r0Migration, 'utf8'))

  await check('Pre-R1: the original area RPC lets a collaborator self-assign the OKRS area (escalation being closed)', async () => {
    await asUser(U.collaborator)
    await query('select * from settings_users_set_areas($1,$2,$3)', [U.collaborator, area.OKRS, [area.OKRS]])
    await asOwner()
    await query('delete from usuario_areas where user_id=$1', [U.collaborator])
    await query('insert into usuario_areas(user_id,area_id,is_primary) values($1,$2,true)', [U.collaborator, area.Ventas])
    assert.equal(await flag('select area as value from usuarios where id=$1', [U.collaborator]), 'Ventas')
  })

  await check('Migration A refuses an unsafe public schema', async () => {
    await db.exec('grant create on schema public to authenticated')
    await assert.rejects(db.exec(readFileSync(migrationA, 'utf8')), /Unsafe public schema CREATE/)
    await db.exec('rollback; revoke create on schema public from authenticated')
  })
  await db.exec(readFileSync(migrationA, 'utf8'))
  await db.exec(readFileSync(migrationA, 'utf8'))
  passed.push('Migration A applies and is idempotent')

  await check('system_key: only the OKRS area receives the functional key; new modules are registered', async () => {
    assert.deepEqual(await query("select id from areas where system_key='okrs'"), [{ id: area.OKRS }])
    assert.equal(await count(`select count(*) n from app_modules where key in
      ('okrs_admin','whatsapp_assistant','whatsapp_inbox','whatsapp_settings','whatsapp_identity_link')`), 5)
  })

  for (const profile of parity.profiles) {
    await check('Parity TS↔SQL: ' + profile.name, async () => {
      assert.deepEqual(await capsOf(U[profile.name]), profile.expected, profile.name)
    })
  }

  await check('ACL: per-usuario helpers are service-only; current-user helpers have no anon execute', async () => {
    for (const fn of ['access_capabilities_for_usuario(uuid)', 'usuario_in_area_key(uuid,text)', 'usuario_has_module(uuid,text)',
      'usuario_is_super_admin(uuid)', 'usuario_is_direction(uuid)', 'usuario_is_catalog_admin(uuid)', 'can_use_ai_whatsapp_for_usuario(uuid)']) {
      assert.equal(await flag(`select has_function_privilege('authenticated','public.${fn}','execute') as value`), false, fn)
      assert.equal(await flag(`select has_function_privilege('service_role','public.${fn}','execute') as value`), true, fn)
    }
    for (const fn of ['my_access_capabilities()', 'can_read_all_okrs()', 'can_read_cross_area_execution()', 'can_admin_all_okrs()',
      'can_use_whatsapp_inbox()', 'can_configure_whatsapp()', 'can_link_whatsapp_identities()', 'legacy_okrs_area_grants()']) {
      assert.equal(await flag(`select has_function_privilege('anon','public.${fn}','execute') as value`), false, fn)
      assert.equal(await flag(`select has_function_privilege('authenticated','public.${fn}','execute') as value`), true, fn)
    }
    const unsafe = await query(`select proname from pg_proc where pronamespace='public'::regnamespace
      and proname in ('access_capabilities_for_usuario','my_access_capabilities','current_user_capability','can_admin_all_okrs',
        'okr_can_view','okr_manage_scope','team_kanban_can_view','settings_users_set_areas','whatsapp_inbox_list_conversations')
      and not (coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog, public, pg_temp'])`)
    assert.deepEqual(unsafe, [])
    await asUser(U.collaborator)
    await assert.rejects(query('select public.access_capabilities_for_usuario($1)', [U.manager]), /permission denied/)
  })

  await check('Temporary relations cannot shadow capability inputs', async () => {
    await asUser(U.collaborator)
    await db.exec('create temporary table user_roles(user_id uuid, app_role text)')
    await query("insert into pg_temp.user_roles values($1,'super_admin')", [U.collaborator])
    assert.equal(await flag("select (public.my_access_capabilities()->>'super_admin')::boolean as value"), false)
    assert.equal(await flag('select public.can_read_cross_area_execution() as value'), false)
    await db.exec('drop table pg_temp.user_roles')
  })

  const visibleActions = async (userId) => { await asUser(userId); return count('select count(*) n from acciones_diarias') }
  const visibleOkrs = async (userId) => { await asUser(userId); return count('select count(*) n from okrs') }
  const visibleTeam = async (userId) => {
    await asUser(userId)
    return count('select count(*) n from acciones_equipo a where public.team_kanban_can_view(a)')
  }
  await check('RLS acciones_diarias: OKRS area reads cross-area; analyst without it reads only own', async () => {
    assert.equal(await visibleActions(U.okrs_analyst_relational), 3)
    assert.equal(await visibleActions(U.collaborator), 1)
  })
  await check('Known pre-existing gap (documented, not changed in R1): inactive non-analysts match the legacy acciones read rule', async () => {
    assert.equal(await visibleActions(U.inactive_okrs), 3)
    assert.equal((await capsOf(U.inactive_okrs)).readCrossAreaExecution, false)
  })
  await check('RLS okrs: Super Admin, Direction and OKRS area read all; others by scope; inactive none', async () => {
    assert.equal(await visibleOkrs(U.super_admin), 2)
    assert.equal(await visibleOkrs(U.direction), 2)
    assert.equal(await visibleOkrs(U.okrs_analyst_relational), 2)
    assert.equal(await visibleOkrs(U.okrs_operative_text_only), 2)
    assert.equal(await visibleOkrs(U.manager), 1)
    assert.equal(await visibleOkrs(U.collaborator), 1)
    assert.equal(await visibleOkrs(U.inactive_okrs), 0)
  })
  await check('Team Kanban: OKRS area reads only OKR-tagged team actions', async () => {
    assert.equal(await visibleTeam(U.okrs_analyst_relational), 1)
    assert.equal(await visibleTeam(U.collaborator), 0)
    assert.equal(await visibleTeam(U.direction), 2)
    assert.equal(await visibleTeam(U.inactive_okrs), 0)
  })

  const okrWrites = async (userId) => {
    await asUser(userId)
    return count("with u as (update okrs set scope=scope returning id) select count(*) n from u")
  }
  const canTag = async (userId) => { await asUser(userId); return flag('select public.okr_can_tag_actions() as value') }
  await check('OKR write: Direction cannot edit or tag; okrs_admin module and catalog admin can', async () => {
    assert.equal(await okrWrites(U.direction), 0)
    assert.equal(await canTag(U.direction), false)
    assert.equal(await okrWrites(U.collaborator), 0)
    assert.equal(await okrWrites(U.explicit_modules), 2)
    assert.equal(await canTag(U.explicit_modules), true)
    assert.equal(await okrWrites(U.catalog_admin_dg), 2)
    assert.equal(await okrWrites(U.inactive_okrs), 0)
  })
  await check('Transition (legacy=true): OKRS area keeps inherited OKR administration', async () => {
    assert.equal(await okrWrites(U.okrs_analyst_relational), 2)
    assert.equal(await canTag(U.okrs_analyst_relational), true)
  })

  const inboxRows = async (userId) => { await asUser(userId); return count('select count(*) n from whatsapp_messages') }
  const inboxRpc = async (userId) => { await asUser(userId); return query('select * from public.whatsapp_inbox_list_conversations()') }
  const settingsRows = async (userId) => { await asUser(userId); return count('select count(*) n from whatsapp_followup_settings') }
  await check('WhatsApp inbox: separate capability; Direction and collaborators see only their own messages', async () => {
    assert.equal(await inboxRows(U.explicit_modules), 2)
    assert.equal(await inboxRows(U.manager), 1)
    assert.equal(await inboxRows(U.direction), 0)
    assert.equal((await inboxRpc(U.explicit_modules)).length, 2)
    await assert.rejects(inboxRpc(U.direction), /No autorizado/)
    await assert.rejects(inboxRpc(U.collaborator), /No autorizado/)
    await assert.rejects(inboxRpc(U.inactive_okrs), /No autorizado/)
    assert.equal((await inboxRpc(U.okrs_operative_text_only)).length, 2, 'legacy transition')
  })
  await check('WhatsApp settings and phone linking: inbox module alone grants neither', async () => {
    assert.equal(await settingsRows(U.explicit_modules), 0)
    await asUser(U.explicit_modules)
    assert.equal(await count('with u as (update whatsapp_followup_settings set enabled=false returning id) select count(*) n from u'), 0)
    await assert.rejects(query('select public.admin_upsert_whatsapp_identity($1,$2)', [U.collaborator, '5215550000002']), /No autorizado/)
    await assert.rejects(query('select public.admin_clear_whatsapp_identity($1)', [U.manager]), /No autorizado/)
    assert.equal(await settingsRows(U.super_admin), 1)
    await asUser(U.super_admin)
    assert.ok(await flag('select public.admin_upsert_whatsapp_identity($1,$2) as value', [U.collaborator, '5215550000002']))
    assert.equal(await settingsRows(U.direction), 0)
  })

  await check('Escalation: profile edits cannot change role, activation or gain a functional area', async () => {
    await asUser(U.collaborator)
    await assert.rejects(query("update usuarios set rol='super_admin' where id=$1", [U.collaborator]), /identity, role or activation/)
    await assert.rejects(query("update usuarios set area='OKRS' where id=$1", [U.collaborator]), /functional area/)
    await assert.rejects(query("update usuarios set area=' okrs ' where id=$1", [U.collaborator]), /functional area/)
    assert.equal(await count("with u as (update usuarios set nombre='Colaborador' where id=$1 returning id) select count(*) n from u",
      [U.collaborator]), 1)
    await asUser(U.inactive_okrs)
    await assert.rejects(query('update usuarios set activo=true where id=$1', [U.inactive_okrs]), /identity, role or activation/)
    await asUser(U.direction)
    await assert.rejects(query("update usuarios set area='OKRS' where id=$1", [U.direction]), /Executive profile/)
  })
  await check('Escalation: self-service area RPC and direct writes cannot add or remove the OKRS area', async () => {
    await asUser(U.collaborator)
    await assert.rejects(query('select * from settings_users_set_areas($1,$2,$3)', [U.collaborator, area.OKRS, [area.OKRS]]),
      /administrator/)
    await assert.rejects(query('insert into usuario_areas(user_id,area_id) values($1,$2)', [U.collaborator, area.OKRS]),
      /administrator/)
    const row = (await query('select * from settings_users_set_areas($1,$2,$3)',
      [U.collaborator, area.Comercial, [area.Comercial, area.Ventas]]))[0]
    assert.equal(row.area, 'Comercial')
    assert.equal((await capsOf(U.collaborator)).okrsArea, false)
    await asUser(U.okrs_analyst_relational)
    await assert.rejects(query('select * from settings_users_set_areas($1,$2,$3)',
      [U.okrs_analyst_relational, area.Ventas, [area.Ventas]]), /administrator/)
    await assert.rejects(query('delete from usuario_areas where user_id=$1 and area_id=$2',
      [U.okrs_analyst_relational, area.OKRS]), /administrator/)
    const kept = (await query('select * from settings_users_set_areas($1,$2,$3)',
      [U.okrs_analyst_relational, area.Ventas, [area.OKRS, area.Ventas]]))[0]
    assert.equal(kept.area, 'Ventas')
    assert.deepEqual([...kept.areas].sort(), ['OKRS', 'Ventas'])
    assert.equal((await capsOf(U.okrs_analyst_relational)).okrsArea, true)
    await asUser(U.okrs_analyst_relational)
    await query("update usuarios set area='OKRS' where id=$1", [U.okrs_analyst_relational])
  })

  await check('Area change and revocation by an administrator take effect on the next read', async () => {
    await asUser(U.super_admin)
    await query('select * from settings_users_set_areas($1,$2,$3)', [U.collaborator, area.OKRS, [area.OKRS, area.Ventas]])
    assert.equal((await capsOf(U.collaborator)).readCrossAreaExecution, true)
    assert.equal(await visibleActions(U.collaborator), 3)
    assert.equal(await visibleOkrs(U.collaborator), 2)
    await asUser(U.super_admin)
    await query('select * from settings_users_set_areas($1,$2,$3)', [U.collaborator, area.Ventas, [area.Ventas]])
    assert.equal((await capsOf(U.collaborator)).readCrossAreaExecution, false)
    assert.equal(await visibleActions(U.collaborator), 1)
    assert.equal(await visibleOkrs(U.collaborator), 1)
  })
  await check('Residual risk documented: RH (org hierarchy) can still assign the OKRS area', async () => {
    await asUser(U.rh)
    await query('select * from settings_users_set_areas($1,$2,$3)', [U.collaborator, area.OKRS, [area.OKRS]])
    assert.equal((await capsOf(U.collaborator)).okrsArea, true)
    await asUser(U.super_admin)
    await query('select * from settings_users_set_areas($1,$2,$3)', [U.collaborator, area.Ventas, [area.Ventas]])
  })
  await check('Module revocation and deactivation remove capabilities immediately', async () => {
    await asOwner()
    await query("delete from catalog_role_modules where module_key='whatsapp_inbox'")
    await assert.rejects(inboxRpc(U.explicit_modules), /No autorizado/)
    await asOwner()
    await query('update usuarios set activo=false where id=$1', [U.explicit_modules])
    const caps = await capsOf(U.explicit_modules)
    assert.equal(Object.values(caps).some(Boolean), false)
    assert.equal(await okrWrites(U.explicit_modules), 0)
    await asOwner()
    await query('update usuarios set activo=true where id=$1', [U.explicit_modules])
    await query("insert into catalog_role_modules values($1,'whatsapp_inbox')", [id(507)])
    assert.equal((await capsOf(U.explicit_modules)).whatsappInbox, true)
  })

  await check('agent_session_context: owner-only, bounded TTL, inactive users cannot write', async () => {
    const insert = 'insert into agent_session_context(usuario_id,channel,session_hash,payload,capability_fingerprint,expires_at) values($1,$2,$3,$4,$5,$6)'
    const soon = new Date(Date.now() + 30 * 60_000).toISOString()
    await asUser(U.collaborator)
    await query(insert, [U.collaborator, 'web', 'a'.repeat(32), { ids: ['x'] }, 'fp', soon])
    await assert.rejects(query(insert, [U.manager, 'web', 'b'.repeat(32), {}, 'fp', soon]), /row-level security/)
    await assert.rejects(query(insert, [U.collaborator, 'web', 'c'.repeat(32), {}, 'fp',
      new Date(Date.now() + 2 * 3600_000).toISOString()]), /row-level security/)
    await assert.rejects(query(insert, [U.collaborator, 'sms', 'd'.repeat(32), {}, 'fp', soon]), /check constraint/)
    await asUser(U.manager)
    assert.equal(await count('select count(*) n from agent_session_context'), 0)
    assert.equal(await count('with d as (delete from agent_session_context returning 1) select count(*) n from d'), 0)
    await asUser(U.inactive_okrs)
    await assert.rejects(query(insert, [U.inactive_okrs, 'web', 'e'.repeat(32), {}, 'fp', soon]), /row-level security/)
    await asUser(U.collaborator)
    assert.equal(await count('select count(*) n from agent_session_context'), 1)
  })

  await check('Audit script runs read-only against the local fixture', async () => {
    await asOwner()
    const audit = readFileSync(auditScript, 'utf8')
    const results = await db.exec(audit)
    const members = results.find((r) => r.fields?.some((f) => f.name === 'okrs_by_usuario_areas'))
    assert.ok(members)
    assert.deepEqual(members.rows.map((r) => r.nombre).sort(),
      ['inactive_okrs', 'okrs_analyst_relational', 'okrs_operative_text_only'])
    const roles = results.find((r) => r.fields?.some((f) => f.name === 'assigned_users'))
    assert.deepEqual(roles.rows.map((r) => r.module_key).sort(), ['okrs_admin', 'okrs_admin', 'whatsapp_inbox'])
    await assert.rejects(db.exec(audit.replace('commit;', 'insert into areas(id,nombre) values (gen_random_uuid(),\'x\'); commit;')),
      /read-only/)
    await db.exec('rollback')
  })

  // Step B: end inherited OKRS-area administration (manual script, local only).
  await db.exec(readFileSync(scriptB, 'utf8'))
  await db.exec(readFileSync(scriptB, 'utf8'))
  passed.push('Script B applies and is idempotent')

  await check('After B: OKRS area keeps transversal read but loses inherited administration and WhatsApp', async () => {
    for (const name of ['okrs_analyst_relational', 'okrs_operative_text_only']) {
      const caps = await capsOf(U[name])
      assert.deepEqual(caps, {
        ...parity.profiles.find((p) => p.name === name).expected,
        adminAllOkrs: false, whatsappAssistant: false, whatsappInbox: false, whatsappSettings: false, whatsappIdentityLink: false,
      }, name)
    }
    assert.equal(await visibleOkrs(U.okrs_analyst_relational), 2)
    assert.equal(await visibleActions(U.okrs_analyst_relational), 3)
    assert.equal(await visibleTeam(U.okrs_analyst_relational), 1)
    assert.equal(await okrWrites(U.okrs_analyst_relational), 0)
    assert.equal(await canTag(U.okrs_analyst_relational), false)
    await assert.rejects(inboxRpc(U.okrs_operative_text_only), /No autorizado/)
    assert.equal(await inboxRows(U.okrs_operative_text_only), 0)
    assert.equal(await settingsRows(U.okrs_operative_text_only), 0)
  })
  await check('After B: explicit grants, Super Admin and Direction are unchanged', async () => {
    for (const name of ['super_admin', 'app_super_admin', 'direction', 'explicit_modules', 'catalog_admin_dg', 'manager'])
      assert.deepEqual(await capsOf(U[name]), parity.profiles.find((p) => p.name === name).expected, name)
    assert.equal((await inboxRpc(U.explicit_modules)).length, 2)
    assert.equal(await okrWrites(U.explicit_modules), 2)
  })
  await check('Reapplying migration A does not undo the revocation', async () => {
    await asOwner()
    await db.exec(readFileSync(migrationA, 'utf8'))
    assert.equal((await capsOf(U.okrs_operative_text_only)).whatsappInbox, false)
  })
  await check('Rollback of B restores inherited access; reapplying B revokes again', async () => {
    await asOwner()
    await db.exec(readFileSync(scriptB, 'utf8').replace('select false;', 'select true;'))
    assert.equal((await capsOf(U.okrs_operative_text_only)).whatsappInbox, true)
    await db.exec(readFileSync(scriptB, 'utf8'))
    assert.equal((await capsOf(U.okrs_operative_text_only)).whatsappInbox, false)
  })

  for (const label of passed) console.log('ok - ' + label)
  console.log(`Local PostgreSQL (PGlite): ${passed.length} R1 transversal checks passed.`)
} finally {
  await db.close()
}
