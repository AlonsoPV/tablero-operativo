-- Rollback of 20261119135000_guard_usuarios_privileges.sql. Manual only.
-- Reopens the self-escalation path on usuarios; use only to unblock a verified regression.
-- The anon UPDATE grant is intentionally not restored.
begin;
drop trigger if exists guard_usuarios_privileges on public.usuarios;
drop function if exists public.guard_usuarios_privileges();
notify pgrst, 'reload schema';
commit;
