DROP FUNCTION IF EXISTS public.team_kanban_update_action(
  uuid,
  uuid,
  uuid,
  text,
  boolean
);

NOTIFY pgrst, 'reload schema';
