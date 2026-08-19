-- El grupo de asignacion parte del Lider superior y conserva toda su rama,
-- aunque los descendientes trabajen en subareas diferentes.

CREATE OR REPLACE FUNCTION public.team_kanban_assignable_users(
  p_actor_id uuid,
  p_area_id uuid
)
RETURNS TABLE (usuario_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE actor_lineage AS (
    SELECT
      actor.id,
      actor.manager_user_id,
      actor.rol,
      0 AS depth,
      ARRAY[actor.id] AS path
    FROM public.usuarios actor
    WHERE actor.id = p_actor_id
      AND actor.activo = true

    UNION ALL

    SELECT
      manager.id,
      manager.manager_user_id,
      manager.rol,
      member.depth + 1,
      member.path || manager.id
    FROM actor_lineage member
    JOIN public.usuarios manager ON manager.id = member.manager_user_id
    WHERE manager.activo = true
      AND NOT manager.id = ANY(member.path)
  ),
  group_root AS (
    SELECT candidate.id
    FROM (
      SELECT lineage.id, lineage.depth
      FROM actor_lineage lineage
      WHERE public.normalize_business_role(lineage.rol::text) =
        public.normalize_business_role('Lider')

      UNION ALL

      SELECT p_actor_id, -1
      WHERE NOT EXISTS (
        SELECT 1
        FROM actor_lineage lineage
        WHERE public.normalize_business_role(lineage.rol::text) =
          public.normalize_business_role('Lider')
      )
    ) candidate
    ORDER BY candidate.depth DESC
    LIMIT 1
  ),
  group_members AS (
    SELECT root.id
    FROM group_root root

    UNION

    SELECT report.id
    FROM public.usuarios report
    JOIN group_members manager ON report.manager_user_id = manager.id
    WHERE report.activo = true
  ),
  area_scope AS (
    SELECT scoped.usuario_id
    FROM public.team_kanban_area_scope_users(p_area_id) scoped
  ),
  permissions AS (
    SELECT
      public.team_kanban_user_is_super_admin(p_actor_id) AS is_global_admin,
      EXISTS (
        SELECT 1
        FROM public.area_lideres area_leader
        WHERE area_leader.area_id = p_area_id
          AND area_leader.user_id = p_actor_id
      ) AS is_area_leader
  )
  SELECT candidate.id
  FROM public.usuarios candidate
  CROSS JOIN permissions permission
  WHERE candidate.activo = true
    AND NOT public.team_kanban_user_is_super_admin(candidate.id)
    AND (
      (
        (permission.is_global_admin OR permission.is_area_leader)
        AND EXISTS (
          SELECT 1
          FROM area_scope scoped
          WHERE scoped.usuario_id = candidate.id
        )
      )
      OR EXISTS (
        SELECT 1
        FROM group_members member
        WHERE member.id = candidate.id
      )
    );
$$;

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

REVOKE ALL ON FUNCTION public.team_kanban_assignable_users(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.team_kanban_assignable_users(uuid, uuid) IS
  'Grupo recursivo del Lider superior: todos los integrantes de la rama pueden asignarse entre si, sin recorte por subarea.';

NOTIFY pgrst, 'reload schema';
