-- P0, part 2: membership in an area named in authorization rules (RH -> can_manage_org_hierarchy,
-- can_edit_any_org_hierarchy) was self-assignable through usuarios.area or settings_users_set_areas.
-- Requires 20261119135000_guard_usuarios_privileges.sql. Independent of R0 and R1.
-- Decides by the JWT role, so definer RPCs called by users are covered; service_role and
-- sessions without JWT (owner, migrations) are not restricted.
begin;

do $$
begin
  if has_schema_privilege('authenticated','public','CREATE')
     or has_schema_privilege('anon','public','CREATE') then
    raise exception 'Unsafe public schema CREATE privilege; review before applying the area guard';
  end if;
  if to_regprocedure('public.is_explicit_privilege_admin()') is null then
    raise exception 'Apply 20261119135000_guard_usuarios_privileges.sql first';
  end if;
end $$;

-- Every literal passed to user_belongs_to_area_name() by an authorization function belongs here.
create or replace function public.is_privileged_area_name(p_name text)
returns boolean language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select public.normalize_business_role(coalesce(p_name, '')) in ('rh');
$$;

create or replace function public.can_grant_privileged_area(p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.is_explicit_privilege_admin() or public.user_belongs_to_area_name(p_name);
$$;

create or replace function public.guard_privileged_area_membership()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  area_name text;
  released text := coalesce(current_setting('scrumban.privileged_area_released', true), '');
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  -- settings_users_set_areas deletes and re-inserts in one transaction: only exactly what was removed may return.
  if tg_op = 'DELETE' then
    select a.nombre into area_name from public.areas a where a.id = old.area_id;
    if public.is_privileged_area_name(area_name) then
      perform set_config('scrumban.privileged_area_released',
        released || ',' || old.user_id::text || ':' || old.area_id::text, true);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.user_id = old.user_id and new.area_id = old.area_id then
    return new;
  end if;
  select a.nombre into area_name from public.areas a where a.id = new.area_id;
  if not public.is_privileged_area_name(area_name)
     or public.can_grant_privileged_area(area_name)
     or position(',' || new.user_id::text || ':' || new.area_id::text || ',' in released || ',') > 0 then
    return new;
  end if;
  raise exception 'Privileged area membership requires an administrator' using errcode = '42501';
end $$;

create or replace function public.guard_privileged_area_text()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and public.normalize_business_role(new.area) is not distinct from public.normalize_business_role(old.area) then
    return new;
  end if;
  if not public.is_privileged_area_name(new.area) or public.can_grant_privileged_area(new.area) then
    return new;
  end if;
  -- The text field may mirror a relational membership already accepted by guard_privileged_area_membership.
  if exists (select 1 from public.usuario_areas ua join public.areas a on a.id = ua.area_id
             where ua.user_id = new.id
               and public.normalize_business_role(a.nombre) = public.normalize_business_role(new.area)) then
    return new;
  end if;
  raise exception 'Privileged area membership requires an administrator' using errcode = '42501';
end $$;

drop trigger if exists guard_privileged_area_membership on public.usuario_areas;
create trigger guard_privileged_area_membership before insert or update or delete on public.usuario_areas
for each row execute function public.guard_privileged_area_membership();

drop trigger if exists guard_privileged_area_text on public.usuarios;
create trigger guard_privileged_area_text before insert or update of area on public.usuarios
for each row execute function public.guard_privileged_area_text();

revoke insert, delete, truncate, references, trigger on public.usuarios from anon;
revoke truncate on public.usuarios from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.usuario_areas from anon;
revoke truncate on public.usuario_areas from authenticated;

revoke all on function public.is_privileged_area_name(text), public.can_grant_privileged_area(text),
  public.guard_privileged_area_membership(), public.guard_privileged_area_text() from public, anon;
grant execute on function public.is_privileged_area_name(text), public.can_grant_privileged_area(text)
  to authenticated, service_role;

do $$
declare routine record;
begin
  for routine in
    select r.rolname as owner_name, p.proowner as owner_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'is_privileged_area_name', 'can_grant_privileged_area', 'guard_privileged_area_membership',
      'guard_privileged_area_text', 'is_explicit_privilege_admin', 'user_belongs_to_area_name',
      'normalize_business_role')
  loop
    if routine.owner_name in ('authenticated', 'anon')
       or pg_has_role('authenticated'::regrole, routine.owner_oid, 'MEMBER')
       or pg_has_role('anon'::regrole, routine.owner_oid, 'MEMBER') then
      raise exception 'Untrusted permission function owner; review ownership before applying the area guard';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
