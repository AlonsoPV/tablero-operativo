-- P0: users could change their own rol, activo, user_id or id through the usuarios UPDATE policy.
-- Independent of R0 and R1. Definer RPCs (settings_users_set_roles, ...) run as the owner and keep their own checks;
-- this guard applies to direct client writes only (roles authenticated and anon).
begin;

do $$
begin
  if has_schema_privilege('authenticated','public','CREATE')
     or has_schema_privilege('anon','public','CREATE') then
    raise exception 'Unsafe public schema CREATE privilege; review before applying the usuarios guard';
  end if;
end $$;

-- Explicit administrators only. can_manage_catalogs() is not used: before R0 it also admits Direction.
create or replace function public.is_explicit_privilege_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select auth.uid() is not null
    and exists (select 1 from public.usuarios u where u.user_id = auth.uid() and u.activo = true)
    and (public.is_current_user_super_admin()
      or public.is_app_admin()
      or public.has_business_role('DG')
      or public.has_business_role('Sistemas'));
$$;

create or replace function public.guard_usuarios_privileges()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if current_user::text not in ('authenticated', 'anon') or public.is_explicit_privilege_admin() then
    return new;
  end if;
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id
     or new.rol is distinct from old.rol or new.activo is distinct from old.activo then
    raise exception 'Profile cannot change identity, role or activation' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_usuarios_privileges on public.usuarios;
create trigger guard_usuarios_privileges before update on public.usuarios
for each row execute function public.guard_usuarios_privileges();

revoke update on public.usuarios from anon;

revoke all on function public.is_explicit_privilege_admin(), public.guard_usuarios_privileges() from public, anon;
grant execute on function public.is_explicit_privilege_admin() to authenticated, service_role;

do $$
declare routine record;
begin
  for routine in
    select r.rolname as owner_name, p.proowner as owner_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'is_explicit_privilege_admin', 'guard_usuarios_privileges', 'is_current_user_super_admin',
      'is_app_admin', 'has_business_role')
  loop
    if routine.owner_name in ('authenticated', 'anon')
       or pg_has_role('authenticated'::regrole, routine.owner_oid, 'MEMBER')
       or pg_has_role('anon'::regrole, routine.owner_oid, 'MEMBER') then
      raise exception 'Untrusted permission function owner; review ownership before applying the usuarios guard';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
