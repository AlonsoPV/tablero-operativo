-- Rollback of 20261119136000_guard_privileged_area_membership.sql. Manual only.
-- Reopens self-assignment of the RH area; use only to unblock a verified regression.
-- Revoked anon and TRUNCATE grants are intentionally not restored.
-- Fast mitigation without dropping objects:
--   alter table public.usuario_areas disable trigger guard_privileged_area_membership;
--   alter table public.usuarios disable trigger guard_privileged_area_text;
begin;
drop trigger if exists guard_privileged_area_membership on public.usuario_areas;
drop trigger if exists guard_privileged_area_text on public.usuarios;
drop function if exists public.guard_privileged_area_membership();
drop function if exists public.guard_privileged_area_text();
drop function if exists public.can_grant_privileged_area(text);
drop function if exists public.is_privileged_area_name(text);
notify pgrst, 'reload schema';
commit;
