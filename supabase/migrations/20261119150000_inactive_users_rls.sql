-- RC-05: inactive users kept reading operational data because the read policies do not check usuarios.activo
-- (and get_my_usuario_id() does not filter it). A restrictive SELECT policy is ANDed with every permissive one,
-- so existing access rules stay as they are for active users. service_role is not affected.
-- Authenticated accounts without a usuarios row are also blocked on these tables.
begin;

do $$
begin
  if has_schema_privilege('authenticated','public','CREATE')
     or has_schema_privilege('anon','public','CREATE') then
    raise exception 'Unsafe public schema CREATE privilege; review before applying RC-05';
  end if;
end $$;

create or replace function public.current_usuario_is_active()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.usuarios u where u.user_id = auth.uid() and u.activo = true);
$$;
revoke all on function public.current_usuario_is_active() from public, anon;
grant execute on function public.current_usuario_is_active() to authenticated, service_role;

do $$
declare target text;
begin
  foreach target in array array[
    'acciones_diarias', 'accion_areas_asignadas', 'accion_catalog_kpis', 'accion_checkpoints',
    'accion_comentarios', 'accion_dependencias', 'accion_evidencias', 'accion_fecha_compromiso_cambios',
    'accion_flujo_cascada', 'accion_gaps', 'acciones_equipo', 'okrs', 'okr_key_results',
    'okr_initiatives', 'okr_check_ins', 'whatsapp_messages', 'kpis', 'catalog_kpis', 'gaps', 'sprints'
  ] loop
    if to_regclass('public.' || target) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'rc05_active_users_only', target);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ((select public.current_usuario_is_active()))',
      'rc05_active_users_only', target);
  end loop;
end $$;

do $$
declare routine record;
begin
  for routine in
    select r.rolname as owner_name, p.proowner as owner_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'current_usuario_is_active'
  loop
    if routine.owner_name in ('authenticated', 'anon')
       or pg_has_role('authenticated'::regrole, routine.owner_oid, 'MEMBER')
       or pg_has_role('anon'::regrole, routine.owner_oid, 'MEMBER') then
      raise exception 'Untrusted permission function owner; review ownership before applying RC-05';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
