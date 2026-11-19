-- Safe R0 rollback verification. Roll back only to security-compatible app/Edge artifacts.
-- Keep the approved database security floor. This file performs no schema/data/ACL changes.
begin read only;

do $$
begin
  if to_regprocedure('public.can_query_ai_whatsapp_for_usuario(uuid)') is null
     or to_regprocedure('public.is_current_user_direction()') is null then
    raise exception 'Approved R0 security baseline missing; stop rollback and review forward migration';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='usuarios'
      and t.tgname='guard_direction_profile_privileges' and t.tgenabled <> 'D'
  ) then
    raise exception 'Approved profile guard missing; stop rollback';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='usuarios' and policyname='r0_direction_update'
      and permissive='RESTRICTIVE'
  ) then
    raise exception 'Approved restrictive policy missing; stop rollback';
  end if;
  if has_function_privilege('anon','public.can_query_ai_whatsapp_for_usuario(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.can_query_ai_whatsapp_for_usuario(uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.can_query_ai_whatsapp_for_usuario(uuid)','EXECUTE') then
    raise exception 'Unexpected query gate ACL; stop rollback';
  end if;
end $$;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       md5(pg_get_functiondef(p.oid)) as definition_hash, p.proacl, p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'can_manage_catalogs','is_action_privileged_usuario','okr_can_view',
  'can_query_ai_whatsapp_for_usuario','guard_direction_profile_privileges'
)
order by p.proname, arguments;

commit;
