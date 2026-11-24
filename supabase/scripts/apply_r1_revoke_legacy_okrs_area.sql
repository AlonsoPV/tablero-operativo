-- R1 complement, step B: end administrative and WhatsApp access inherited from the OKRS area.
-- NOT a migration. Apply manually only after:
--   1. 20261119140000_r1_transversal_access.sql is applied in the target environment;
--   2. audit_okrs_area_legacy_grants.sql was reviewed and the migration matrix approved;
--   3. every approved user holds a catalog role with okrs_admin / whatsapp_* modules.
-- OKRS-area members keep transversal read of OKRs, actions and indicators.
-- Rollback: rerun this function with "select true".
begin;

do $$
begin
  if to_regprocedure('public.access_capabilities_for_usuario(uuid)') is null then
    raise exception 'Apply 20261119140000_r1_transversal_access.sql first';
  end if;
end $$;

create or replace function public.legacy_okrs_area_grants()
returns boolean language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select false;
$$;

notify pgrst, 'reload schema';
commit;
