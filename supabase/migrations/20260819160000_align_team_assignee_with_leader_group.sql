-- Usa el mismo alcance del grupo del lider en el selector y al guardar.

CREATE OR REPLACE FUNCTION public.team_kanban_assignee_belongs_to_area(
  p_area_id uuid,
  p_assignee uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.team_kanban_user_is_available(p_area_id, p_assignee);
$$;

REVOKE ALL ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid) IS
  'Compatibilidad interna: valida al responsable con el grupo organizacional del lider del actor actual.';

NOTIFY pgrst, 'reload schema';
