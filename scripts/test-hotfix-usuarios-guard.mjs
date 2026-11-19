import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

// Isolated PostgreSQL/WASM. Never connects to a Supabase project and never uses service credentials
// to stand in for ordinary users: every user check runs as role authenticated or anon with JWT claims.
const { PGlite } = await import(pathToFileURL(process.env.WHATSAPP_PGLITE_PATH).href)
const db = new PGlite()
const guardRole = 'supabase/migrations/20261119135000_guard_usuarios_privileges.sql'
const guardArea = 'supabase/migrations/20261119136000_guard_privileged_area_membership.sql'
const rollbackArea = 'supabase/scripts/rollback_guard_privileged_area_membership.sql'
const compatRef = process.env.HOTFIX_COMPAT_REF ?? 'r1/agente-confiable'

function definition(text, name) {
  const match = text.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\$\\$;', 'i'))
  assert.ok(match, name)
  return match[0]
}
const migration = (file) => readFileSync('supabase/migrations/' + file, 'utf8')
const fromRef = (file) => existsSync(`supabase/migrations/${file}`)
  ? readFileSync(`supabase/migrations/${file}`, 'utf8')
  : execSync(`git show ${compatRef}:supabase/migrations/${file}`, { encoding: 'utf8' })

const id = (n) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
const area = { Ventas: id(201), Comercial: id(202), RH: id(203), OKRS: id(204) }
const U = {
  op: id(1), analyst: id(2), leader: id(3), direction: id(4), rhMember: id(5), dg: id(6), sistemas: id(7),
  appAdmin: id(8), superRol: id(9), superCatalog: id(10), inactive: id(11), inactiveSuper: id(12),
}
const query = async (sql, values = []) => (await db.query(sql, values)).rows
const flag = async (sql, values = []) => (await query(sql, values))[0].value
const passed = []
const check = async (label, fn) => { await fn(); passed.push(label) }

const session = async (role, sub) => {
  await db.exec('reset role')
  await query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)",
    [sub ?? '', role ?? ''])
  if (role) await db.exec('set role ' + role)
}
const asUser = (uid) => session('authenticated', uid)
const asAnon = () => session('anon', '')
const asService = () => session('service_role', '')
const asOwner = () => session(null, '')

const areaOf = async (uid) => { await asOwner(); return flag('select area as value from usuarios where id=$1', [uid]) }
const relAreas = async (uid) => {
  await asOwner()
  return (await query('select a.nombre from usuario_areas ua join areas a on a.id=ua.area_id where ua.user_id=$1 order by 1',
    [uid])).map((r) => r.nombre)
}
const setAreas = (uid, primary, ids) => query('select * from settings_users_set_areas($1,$2,$3)', [uid, primary, ids])
const resetAreas = async (uid, name) => {
  await asOwner()
  await query('delete from usuario_areas where user_id=$1', [uid])
  await query('insert into usuario_areas(user_id,area_id,is_primary) values($1,$2,true)', [uid, area[name]])
  await query('update usuarios set area=$2 where id=$1', [uid, name])
}
const orgManager = async (uid) => { await asUser(uid); const v = await flag('select can_manage_org_hierarchy() as value'); await asOwner(); return v }
const ROLE_ERR = /identity, role or activation/
const AREA_ERR = /Privileged area membership requires an administrator/

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'');
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid(), auth.role() to anon,authenticated,service_role;
    create table usuarios(id uuid primary key,user_id uuid,nombre text,rol text,activo boolean,area text,
      manager_user_id uuid,created_at timestamptz default now(),updated_at timestamptz default now());
    create table user_roles(user_id uuid,app_role text);
    create table areas(id uuid primary key,nombre text,activo boolean default true);
    create table usuario_areas(id uuid primary key default gen_random_uuid(),
      user_id uuid not null references usuarios(id) on delete cascade, area_id uuid not null references areas(id),
      is_primary boolean not null default false, unique(user_id,area_id));
    create unique index usuario_areas_one_primary on usuario_areas(user_id) where is_primary;
    create table catalog_roles(id uuid primary key,nombre text,system_key text,activo boolean);
    create table usuario_catalog_roles(user_id uuid,role_id uuid);
    create function is_app_admin() returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from user_roles where user_id=auth.uid() and app_role in ('admin','super_admin'));
    $$;
    create function is_super_admin() returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from user_roles where user_id=auth.uid() and app_role='super_admin');
    $$;
  `)
  // Pre-R0/R1 production definitions, taken verbatim from the migrations on main.
  for (const [file, name] of [
    ['20260803124500_prioritize_privileged_action_edit.sql', 'normalize_business_role'],
    ['20260729163000_super_admin_can_manage_all_catalogs.sql', 'is_current_user_super_admin'],
    ['20260729163000_super_admin_can_manage_all_catalogs.sql', 'has_business_role'],
    ['20260620120000_settings_users_detail_access.sql', 'is_business_admin'],
    ['20260729163000_super_admin_can_manage_all_catalogs.sql', 'can_manage_catalogs'],
    ['20260714123000_org_chart_governance_gamification.sql', 'is_super_admin_role'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'usuario_area_names'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'user_belongs_to_area_name'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'sync_usuario_primary_area'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'can_manage_org_hierarchy'],
    ['20260712120000_usuario_areas_and_self_hierarchy.sql', 'settings_users_set_areas'],
    ['20261005130000_fix_org_hierarchy_super_admin_app_role.sql', 'can_edit_any_org_hierarchy'],
  ]) await db.exec(definition(migration(file), name))
  await db.exec(`
    create trigger trg_usuario_areas_sync_primary after insert or update or delete on usuario_areas
      for each row execute function sync_usuario_primary_area();
    alter table usuarios enable row level security;
    alter table usuario_areas enable row level security;
    alter table user_roles enable row level security;
    alter table usuario_catalog_roles enable row level security;
    -- Production grants and policies observed before the hotfix.
    grant all on usuarios, usuario_areas, user_roles, usuario_catalog_roles to anon, authenticated, service_role;
    grant select on areas, catalog_roles to anon, authenticated, service_role;
    create policy usuarios_select on usuarios for select to authenticated using (true);
    create policy usuarios_update_own_or_admin on usuarios for update to authenticated
      using ((user_id = auth.uid()) or can_manage_catalogs() or can_manage_org_hierarchy())
      with check ((user_id = auth.uid()) or can_manage_catalogs() or can_manage_org_hierarchy());
    create policy usuarios_insert_admin on usuarios for insert to authenticated
      with check (is_app_admin() or has_business_role('Direccion'));
    create policy usuario_areas_select on usuario_areas for select to authenticated using (
      exists (select 1 from usuarios u where u.id = usuario_areas.user_id
        and (u.user_id = auth.uid() or can_manage_catalogs())) or can_manage_org_hierarchy());
  `)
  await query(`insert into areas(id,nombre) values ($1,'Ventas'),($2,'Comercial'),($3,'RH'),($4,'OKRS')`,
    [area.Ventas, area.Comercial, area.RH, area.OKRS])
  for (const [key, rol, activo, home] of [
    ['op', 'Operativo', true, 'Ventas'], ['analyst', 'Analista', true, 'Ventas'], ['leader', 'Líder', true, 'Ventas'],
    ['direction', 'Direccion', true, 'Comercial'], ['rhMember', 'Operativo', true, 'RH'], ['dg', 'DG', true, 'Comercial'],
    ['sistemas', 'Sistemas', true, 'Comercial'], ['appAdmin', 'Operativo', true, 'Comercial'],
    ['superRol', 'super_admin', true, 'Comercial'], ['superCatalog', 'Líder', true, 'Ventas'],
    ['inactive', 'Operativo', false, 'Ventas'], ['inactiveSuper', 'super_admin', false, 'Comercial'],
  ]) {
    await query('insert into usuarios(id,user_id,nombre,rol,activo,area) values($1,$1,$2,$3,$4,$5)', [U[key], key, rol, activo, home])
    await query('insert into usuario_areas(user_id,area_id,is_primary) values($1,$2,true)', [U[key], area[home]])
  }
  await query("insert into user_roles values($1,'admin')", [U.appAdmin])
  await query("insert into catalog_roles values($1,'super_admin','super_admin',true)", [id(300)])
  await query('insert into usuario_catalog_roles values($1,$2)', [U.superCatalog, id(300)])

  // Before the hotfix: reproduce both escalation paths.
  await check('Before: an ordinary user makes themselves super_admin', async () => {
    await asUser(U.op)
    await query("update usuarios set rol='super_admin' where id=$1", [U.op])
    assert.equal(await flag('select is_current_user_super_admin() as value'), true)
    await asOwner()
    await query("update usuarios set rol='Operativo' where id=$1", [U.op])
  })
  await check('Before: an ordinary user joins RH by text and becomes an org manager', async () => {
    await asUser(U.op)
    await query("update usuarios set area='RH' where id=$1", [U.op])
    assert.equal(await orgManager(U.op), true)
    await resetAreas(U.op, 'Ventas')
  })
  await check('Before: an ordinary user joins RH through settings_users_set_areas', async () => {
    await asUser(U.op)
    await setAreas(U.op, area.RH, [area.RH])
    assert.deepEqual(await relAreas(U.op), ['RH'])
    assert.equal(await orgManager(U.op), true)
    await resetAreas(U.op, 'Ventas')
  })
  await check('Before: anon holds UPDATE and TRUNCATE on usuarios', async () => {
    assert.equal(await flag("select has_table_privilege('anon','public.usuarios','UPDATE') as value"), true)
    assert.equal(await flag("select has_table_privilege('anon','public.usuarios','TRUNCATE') as value"), true)
  })

  // Application order and preconditions.
  await check('136000 refuses to apply without 135000', async () => {
    await asOwner()
    await assert.rejects(db.exec(readFileSync(guardArea, 'utf8')), /Apply 20261119135000/)
    await db.exec('rollback')
  })
  await check('Both migrations refuse an unsafe public schema', async () => {
    for (const file of [guardRole, guardArea]) {
      await db.exec('grant create on schema public to authenticated')
      await assert.rejects(db.exec(readFileSync(file, 'utf8')), /Unsafe public schema CREATE/)
      await db.exec('rollback; revoke create on schema public from authenticated')
    }
  })
  for (const file of [guardRole, guardRole, guardArea, guardArea]) await db.exec(readFileSync(file, 'utf8'))
  passed.push('135000 and 136000 apply on the pre-R0/R1 schema and are idempotent')

  const ordinary = async (label) => {
    await check(`${label} Ordinary users cannot change their role, activation or identity`, async () => {
      for (const uid of [U.op, U.analyst, U.leader]) {
        await asUser(uid)
        for (const target of ['DG', 'Sistemas', 'super_admin'])
          await assert.rejects(query('update usuarios set rol=$2 where id=$1', [uid, target]), ROLE_ERR)
        await assert.rejects(query('update usuarios set activo=false where id=$1', [uid]), ROLE_ERR)
        await assert.rejects(query('update usuarios set user_id=$2 where id=$1', [uid, U.dg]), ROLE_ERR)
      }
    })
    await check(`${label} Ordinary users cannot join RH by text (any spelling) or by RPC`, async () => {
      for (const uid of [U.op, U.analyst, U.leader]) {
        await asUser(uid)
        for (const spelling of ['RH', 'rh', ' Rh '])
          await assert.rejects(query('update usuarios set area=$2 where id=$1', [uid, spelling]), AREA_ERR)
        await assert.rejects(setAreas(uid, area.RH, [area.RH]), AREA_ERR)
        await assert.rejects(setAreas(uid, area.Ventas, [area.Ventas, area.RH]), AREA_ERR)
        assert.equal(await orgManager(uid), false)
        assert.deepEqual(await relAreas(uid), ['Ventas'])
      }
    })
    await check(`${label} Ordinary users keep name, normal areas and hierarchy self-service`, async () => {
      await asUser(U.op)
      await query("update usuarios set nombre='Op', manager_user_id=$2 where id=$1", [U.op, U.leader])
      await setAreas(U.op, area.Comercial, [area.Comercial, area.Ventas])
      assert.equal(await areaOf(U.op), 'Comercial')
      await asUser(U.op)
      await query("update usuarios set area='Ventas' where id=$1", [U.op])
      await resetAreas(U.op, 'Ventas')
    })
    await check(`${label} Anonymous sessions cannot write usuarios or usuario_areas`, async () => {
      for (const [table, ops] of [['usuarios', ['UPDATE', 'INSERT', 'DELETE', 'TRUNCATE']],
        ['usuario_areas', ['UPDATE', 'INSERT', 'DELETE', 'TRUNCATE']]])
        for (const op of ops)
          assert.equal(await flag(`select has_table_privilege('anon','public.${table}','${op}') as value`), false, `${table} ${op}`)
      for (const fn of ['is_explicit_privilege_admin()', 'can_grant_privileged_area(text)'])
        assert.equal(await flag(`select has_function_privilege('anon','public.${fn}','EXECUTE') as value`), false, fn)
      await asAnon()
      await assert.rejects(query("update usuarios set rol='super_admin'"), /permission denied/)
      await assert.rejects(query('insert into usuario_areas(user_id,area_id) values($1,$2)', [U.op, area.RH]), /permission denied/)
      await asOwner()
    })
    await check(`${label} Inactive users (including an inactive Super Admin) cannot reactivate or join RH`, async () => {
      for (const uid of [U.inactive, U.inactiveSuper]) {
        await asUser(uid)
        await assert.rejects(query('update usuarios set activo=true where id=$1', [uid]), ROLE_ERR)
        await assert.rejects(query("update usuarios set area='RH' where id=$1", [uid]), AREA_ERR)
        await assert.rejects(setAreas(uid, area.RH, [area.RH]), AREA_ERR)
      }
    })
    await check(`${label} Administrators cannot be self-assigned: app_role, catalog role and new profiles stay closed`, async () => {
      await asUser(U.op)
      await assert.rejects(query("insert into user_roles values($1,'super_admin')", [U.op]), /row-level security/)
      await assert.rejects(query('insert into usuario_catalog_roles values($1,$2)', [U.op, id(300)]), /row-level security/)
      await assert.rejects(query("insert into usuarios(id,user_id,nombre,rol,activo) values($1,$1,'x','super_admin',true)", [id(99)]),
        /row-level security/)
      await asOwner()
    })
    await check(`${label} Explicit administrators manage role, activation and RH for others`, async () => {
      for (const admin of [U.dg, U.sistemas, U.appAdmin, U.superRol, U.superCatalog]) {
        await asUser(admin)
        await query("update usuarios set rol='Líder', activo=false where id=$1", [U.op])
        await query("update usuarios set rol='Operativo', activo=true where id=$1", [U.op])
        await setAreas(U.op, area.Ventas, [area.Ventas, area.RH])
        assert.deepEqual(await relAreas(U.op), ['RH', 'Ventas'])
        await resetAreas(U.op, 'Ventas')
      }
    })
    await check(`${label} An existing RH member keeps RH administration and can edit their own areas`, async () => {
      await asUser(U.rhMember)
      await setAreas(U.op, area.Ventas, [area.Ventas, area.RH])
      assert.deepEqual(await relAreas(U.op), ['RH', 'Ventas'])
      await resetAreas(U.op, 'Ventas')
      await asUser(U.rhMember)
      await setAreas(U.rhMember, area.RH, [area.RH, area.Comercial])
      assert.deepEqual(await relAreas(U.rhMember), ['Comercial', 'RH'])
      assert.equal(await areaOf(U.rhMember), 'RH')
      await asUser(U.rhMember)
      await setAreas(U.rhMember, area.Comercial, [area.Comercial, area.RH])
      assert.equal(await areaOf(U.rhMember), 'Comercial')
      assert.equal(await orgManager(U.rhMember), true)
      await resetAreas(U.rhMember, 'RH')
    })
    await check(`${label} Leaving RH is allowed; returning in a later request requires an administrator`, async () => {
      await asUser(U.rhMember)
      await setAreas(U.rhMember, area.Comercial, [area.Comercial])
      await assert.rejects(setAreas(U.rhMember, area.RH, [area.RH]), AREA_ERR)
      await resetAreas(U.rhMember, 'RH')
    })
    await check(`${label} Service role and sessions without JWT are not restricted`, async () => {
      await asService()
      await query("update usuarios set area='RH' where id=$1", [U.op])
      await query('insert into usuario_areas(user_id,area_id) values($1,$2)', [U.op, area.RH])
      await resetAreas(U.op, 'Ventas')
    })
  }

  await ordinary('[pre-R0/R1]')
  await check('[pre-R0/R1] Direction (still a catalog manager before R0) can no longer grant roles or RH', async () => {
    await asUser(U.direction)
    await assert.rejects(query("update usuarios set rol='super_admin' where id=$1", [U.op]), ROLE_ERR)
    await assert.rejects(setAreas(U.op, area.RH, [area.RH]), AREA_ERR)
    await asOwner()
  })

  await check('Rollback of 136000 reopens self-assignment of RH; reapplying closes it', async () => {
    await asOwner()
    await db.exec(readFileSync(rollbackArea, 'utf8'))
    await asUser(U.op)
    await setAreas(U.op, area.RH, [area.RH])
    assert.equal(await orgManager(U.op), true)
    await resetAreas(U.op, 'Ventas')
    await db.exec(readFileSync(guardArea, 'utf8'))
    await asUser(U.op)
    await assert.rejects(setAreas(U.op, area.RH, [area.RH]), AREA_ERR)
    assert.equal(await flag("select has_table_privilege('anon','public.usuarios','TRUNCATE') as value"), false)
    await asOwner()
  })

  // Compatibility: the R0 and A definitions now deployed in DEV and PROD.
  await asOwner()
  const r0 = fromRef('20261118150000_direction_executive_scope.sql')
  const a = fromRef('20261119140000_r1_transversal_access.sql')
  await db.exec("alter table areas add column system_key text; update areas set system_key='okrs' where nombre='OKRS'")
  for (const [text, name] of [[r0, 'can_manage_catalogs'], [r0, 'can_manage_org_hierarchy'],
    [a, 'settings_users_set_areas'], [a, 'guard_profile_privileges'], [a, 'guard_functional_area_membership']])
    await db.exec(definition(text, name))
  await db.exec(`
    create trigger guard_profile_privileges before update on usuarios for each row execute function guard_profile_privileges();
    create trigger guard_functional_area_membership before insert or update or delete on usuario_areas
      for each row execute function guard_functional_area_membership();
  `)
  const compatSource = existsSync('supabase/migrations/20261119140000_r1_transversal_access.sql') ? 'working tree' : compatRef
  passed.push(`Compatibility schema loaded from ${compatSource} (R0 can_manage_*, A set_areas and area guards)`)
  await ordinary('[with R0+A]')
  await check('[with R0+A] Direction is not a catalog manager and cannot grant RH', async () => {
    await asUser(U.direction)
    assert.equal(await flag('select can_manage_catalogs() as value'), false)
    await assert.rejects(setAreas(U.op, area.RH, [area.RH]), /No autorizado/)
    await asOwner()
  })

  console.log(passed.map((label) => 'ok - ' + label).join('\n'))
  console.log(`Local PostgreSQL (PGlite): ${passed.length} hotfix checks passed.`)
} finally {
  await db.close()
}
