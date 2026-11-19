-- Rollback of 20261119150000_inactive_users_rls.sql. Manual only.
-- Removes the restrictive policies; inactive users regain the legacy read access (RC-05).
begin;
do $$
declare target record;
begin
  for target in
    select tablename from pg_policies
    where schemaname = 'public' and policyname = 'rc05_active_users_only'
  loop
    execute format('drop policy if exists %I on public.%I', 'rc05_active_users_only', target.tablename);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
