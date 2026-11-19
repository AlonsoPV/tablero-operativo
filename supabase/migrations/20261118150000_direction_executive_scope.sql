-- R0: executive reads are independent from administrative/write privileges.
-- Organization boundary remains the existing Supabase project.
begin;

-- Definer functions require a schema that callers cannot populate with objects.
do $$
begin
  if has_schema_privilege('authenticated','public','CREATE')
     or has_schema_privilege('anon','public','CREATE')
     or has_schema_privilege('authenticated','auth','CREATE')
     or has_schema_privilege('anon','auth','CREATE') then
    raise exception 'Unsafe public schema CREATE privilege or auth schema ACL; review before applying R0';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='auth' and p.proname in ('uid','role')
      and (pg_has_role('authenticated'::regrole,p.proowner,'MEMBER')
           or pg_has_role('anon'::regrole,p.proowner,'MEMBER'))
  ) then
    raise exception 'Untrusted authentication function owner';
  end if;
end $$;

create or replace function public.can_manage_catalogs()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.user_id = auth.uid() and u.activo = true)
    and (public.is_current_user_super_admin()
    or public.is_app_admin()
    or public.is_super_admin()
    or public.is_business_admin()
    or public.has_business_role('DG')
    or public.has_business_role('Sistemas'));
$$;

create or replace function public.is_current_user_direction()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u
    where u.user_id = auth.uid()
      and (split_part(public.normalize_business_role(u.rol::text), '_', 1) = 'direccion'
        or exists (
          select 1 from public.usuario_catalog_roles ucr
          join public.catalog_roles cr on cr.id = ucr.role_id
          where ucr.user_id = u.id and cr.activo = true
            and (split_part(public.normalize_business_role(cr.nombre), '_', 1) = 'direccion'
              or split_part(public.normalize_business_role(coalesce(cr.system_key,'')), '_', 1) = 'direccion')
        )));
$$;
revoke all on function public.is_current_user_direction() from public, anon;
grant execute on function public.is_current_user_direction() to authenticated, service_role;

create or replace function public.can_manage_org_hierarchy()
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_catalogs() or public.user_belongs_to_area_name('RH');
$$;

create or replace function public.can_manage_challenges()
returns boolean language sql stable set search_path = public as $$
  select public.can_manage_catalogs() or public.has_business_role('DG')
    or public.has_business_role('Sistemas') or public.has_business_role('super_admin');
$$;

create or replace function public.can_edit_manual_gamification()
returns boolean language sql stable set search_path = public as $$
  select auth.uid() is not null
    and (public.is_super_admin() or public.has_business_role('super_admin'));
$$;

create or replace function public.team_kanban_is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u
    left join public.user_roles ur on ur.user_id = u.user_id
    where u.user_id = p_user and u.activo = true
      and (lower(u.rol::text) in ('administrador','super admin','super_admin')
        or ur.app_role::text in ('admin','super_admin')));
$$;

create or replace function public.team_kanban_is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_current_user_super_admin();
$$;

create or replace function public.team_kanban_can_view(
  p_action public.acciones_equipo, p_auth_user uuid default auth.uid())
returns boolean language sql stable set search_path = public as $$
  select public.team_kanban_is_admin(p_auth_user)
    or exists (select 1 from public.usuarios u where u.user_id = p_auth_user
      and u.activo = true and (
        split_part(public.normalize_business_role(u.rol::text), '_', 1) = 'direccion'
        or u.id = p_action.lider_id or u.id = p_action.asignado_a or u.id = p_action.creado_por));
$$;

create or replace function public.is_action_privileged_usuario(p_usuario_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.activo = true
      and public.normalize_business_role(u.rol::text) = 'super_admin'
  ) or exists (
    select 1 from public.usuarios u
    join public.user_roles ur on ur.user_id = u.user_id
    where u.id = p_usuario_id and u.activo = true
      and lower(ur.app_role::text) in ('super_admin', 'admin')
  ) or exists (
    select 1 from public.usuarios u
    join public.usuario_catalog_roles ucr on ucr.user_id = u.id
    join public.catalog_roles cr on cr.id = ucr.role_id
    where u.id = p_usuario_id and u.activo = true and cr.activo = true
      and (public.normalize_business_role(coalesce(cr.system_key, '')) = 'super_admin'
           or public.normalize_business_role(cr.nombre) = 'super_admin')
  );
$$;

create or replace function public.okr_can_view(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.okr_active_user() and (
    public.is_current_user_super_admin()
    or exists (
      select 1 from public.usuarios u
      where u.user_id = auth.uid() and u.activo = true
        and split_part(public.normalize_business_role(u.rol::text), '_', 1) = 'direccion'
        and exists (select 1 from public.okrs o where o.id = p_id)
    )
    or exists (
      select 1 from public.okrs o where o.id = p_id and (
        o.scope = 'company' or public.okr_manage_scope(o.area_id)
        or o.owner_user_id = public.get_my_usuario_id()
        or exists (select 1 from public.usuario_areas ua
                   where ua.area_id = o.area_id and ua.user_id = public.get_my_usuario_id())
        or exists (select 1 from public.usuarios u join public.areas a on a.nombre = u.area
                   where u.user_id = auth.uid() and a.id = o.area_id)
        or exists (select 1 from public.okr_key_results k
                   where k.okr_id = o.id and k.owner_user_id = public.get_my_usuario_id())
      )
    )
  );
$$;

-- Keep can_use_ai_whatsapp_for_usuario unchanged for WhatsApp operations.
-- This separate query capability grants no Inbox/configuration access.
create or replace function public.can_query_ai_whatsapp_for_usuario(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_use_ai_whatsapp_for_usuario(p_usuario_id)
    or exists (
      select 1 from public.usuarios u
      where u.id = p_usuario_id and u.user_id is not null and u.activo = true
        and split_part(public.normalize_business_role(u.rol::text), '_', 1) = 'direccion'
    );
$$;
revoke all on function public.can_query_ai_whatsapp_for_usuario(uuid) from public, anon, authenticated;
grant execute on function public.can_query_ai_whatsapp_for_usuario(uuid) to service_role;
grant execute on function public.can_edit_accion_general_as(uuid, uuid),
  public.can_manage_accion_full_as(uuid, uuid) to service_role;

comment on function public.can_manage_catalogs() is
  'Catalog administration requires an explicit app/business administrator grant; Direction alone grants executive reads.';
comment on function public.is_action_privileged_usuario(uuid) is
  'Global action privilege requires explicit administrator grants; creator/responsible rules are evaluated per operation.';
comment on function public.okr_can_view(uuid) is
  'Active Direction users read executive OKRs within this project; mutation policies retain separate authorization.';

-- Restrictive guards also cover older permissive policies that mention Direction directly.
-- They preserve existing access for other roles and independent admin assignments.
do $$
declare target text; operation text; clause text;
begin
  foreach target in array array[
    'gaps','catalog_kpis','academy_modules','statuses','priorities','areas',
    'catalog_roles','dropdown_catalogs','dropdown_options','app_modules',
    'catalog_role_modules','usuario_catalog_roles','user_roles','manual_gamification_rules',
    'usuarios'
  ] loop
    if to_regclass('public.' || target) is null then continue; end if;
    foreach operation in array array['insert','update','delete'] loop
      clause := '(not public.is_current_user_direction() or public.can_manage_catalogs())';
      if target = 'usuarios' and operation = 'update' then
        clause := '(not public.is_current_user_direction() or user_id = auth.uid() or public.can_manage_org_hierarchy())';
      end if;
      execute format('drop policy if exists %I on public.%I', 'r0_direction_' || operation, target);
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'r0_direction_' || operation, target, operation,
        case operation
          when 'insert' then 'with check ' || clause
          when 'delete' then 'using ' || clause
          else 'using ' || clause || ' with check ' || clause
        end);
    end loop;
  end loop;
end $$;

do $$
declare operation text; clause text :=
  '(bucket_id <> ''academia'' or not public.is_current_user_direction() or public.can_manage_catalogs())';
begin
  if to_regclass('storage.objects') is not null then
    foreach operation in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on storage.objects', 'r0_direction_academia_' || operation);
      execute format('create policy %I on storage.objects as restrictive for %s to authenticated %s',
        'r0_direction_academia_' || operation, operation,
        case operation when 'insert' then 'with check ' || clause
          when 'delete' then 'using ' || clause
          else 'using ' || clause || ' with check ' || clause end);
    end loop;
  end if;
end $$;

-- Self-profile editing must not turn executive access into another role or OKRS membership.
create or replace function public.guard_direction_profile_privileges()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.role() = 'authenticated'
     and (split_part(public.normalize_business_role(old.rol::text), '_', 1) = 'direccion'
          or public.is_current_user_direction())
     and not public.can_manage_catalogs() and (
       new.id is distinct from old.id or new.user_id is distinct from old.user_id
       or new.rol is distinct from old.rol or new.area is distinct from old.area
       or new.activo is distinct from old.activo
     ) then
    raise exception 'Executive profile cannot change identity, role, access area or activation'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_direction_profile_privileges on public.usuarios;
create trigger guard_direction_profile_privileges before update on public.usuarios
for each row execute function public.guard_direction_profile_privileges();

-- pg_temp must follow trusted schemas, including inside transitive permission helpers.
do $$
declare routine record;
begin
  for routine in
    select p.oid::regprocedure as signature, r.rolname as owner_name, p.proowner as owner_oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_roles r on r.oid=p.proowner
    where n.nspname='public' and p.prokind='f' and p.proname in (
      'can_manage_catalogs','is_current_user_direction','can_manage_org_hierarchy',
      'can_manage_challenges','can_edit_manual_gamification',
      'team_kanban_is_admin','team_kanban_is_super_admin','team_kanban_can_view',
      'is_action_privileged_usuario','okr_can_view','can_query_ai_whatsapp_for_usuario',
      'guard_direction_profile_privileges',
      'is_current_user_super_admin','is_app_admin','is_super_admin','is_business_admin',
      'normalize_business_role',
      'has_business_role','get_my_usuario_id','user_belongs_to_area_name',
      'okr_active_user','okr_manage_scope','team_kanban_is_leader',
      'can_edit_accion_general_as','can_edit_accion_general',
      'can_manage_accion_full_as','has_kanban_action_editor_role',
      'can_use_ai_whatsapp_for_usuario'
    )
  loop
    if routine.owner_name in ('authenticated','anon')
       or pg_has_role('authenticated'::regrole, routine.owner_oid, 'MEMBER')
       or pg_has_role('anon'::regrole, routine.owner_oid, 'MEMBER') then
      raise exception 'Untrusted permission function owner; review ownership before applying R0';
    end if;
    execute format('alter function %s set search_path to pg_catalog, public, pg_temp', routine.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
