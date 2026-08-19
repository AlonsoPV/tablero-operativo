-- Kanban por Equipos: las asignaciones siguen el organigrama de arriba hacia abajo.

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
  WITH RECURSIVE actor AS (
    SELECT u.id
    FROM public.usuarios u
    WHERE u.id = p_actor_id
      AND u.activo = true
  ),
  descendants AS (
    SELECT report.id
    FROM public.usuarios report
    JOIN actor ON report.manager_user_id = actor.id
    WHERE report.activo = true

    UNION

    SELECT report.id
    FROM public.usuarios report
    JOIN descendants parent ON report.manager_user_id = parent.id
    WHERE report.activo = true
  ),
  vertical_scope AS (
    SELECT id FROM actor
    UNION
    SELECT id FROM descendants
  ),
  actor_permissions AS (
    SELECT
      public.team_kanban_user_is_super_admin(p_actor_id) AS is_global_admin,
      EXISTS (
        SELECT 1
        FROM public.area_lideres leader
        WHERE leader.area_id = p_area_id
          AND leader.user_id = p_actor_id
      ) AS is_area_leader,
      public.team_kanban_user_is_in_area_scope(p_actor_id, p_area_id) AS is_in_area
  )
  SELECT scoped.usuario_id
  FROM public.team_kanban_area_scope_users(p_area_id) scoped
  CROSS JOIN actor_permissions permissions
  WHERE NOT public.team_kanban_user_is_super_admin(scoped.usuario_id)
    AND (
      permissions.is_global_admin
      OR (
        permissions.is_in_area
        AND (
          permissions.is_area_leader
          OR EXISTS (
            SELECT 1
            FROM vertical_scope vertical_user
            WHERE vertical_user.id = scoped.usuario_id
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_users_share_immediate_scope(
  p_actor_id uuid,
  p_target_id uuid,
  p_area_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_kanban_assignable_users(p_actor_id, p_area_id) assignable
    WHERE assignable.usuario_id = p_target_id
  );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_user_is_available(
  p_area_id uuid,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor AS (
    SELECT u.id
    FROM public.usuarios u
    WHERE u.user_id = (SELECT auth.uid())
      AND u.activo = true
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM actor
    JOIN public.team_kanban_assignable_users(actor.id, p_area_id) assignable
      ON assignable.usuario_id = p_target_id
  );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_available_users(p_area_id uuid)
RETURNS TABLE (
  id uuid,
  nombre text,
  rol text,
  area text,
  manager_user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT u.id
  INTO v_actor_id
  FROM public.usuarios u
  WHERE u.user_id = (SELECT auth.uid())
    AND u.activo = true
  LIMIT 1;

  IF v_actor_id IS NULL
    OR NOT public.team_kanban_current_user_can_use_area(p_area_id)
  THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    target.id,
    target.nombre,
    target.rol::text,
    area.nombre,
    target.manager_user_id
  FROM public.team_kanban_assignable_users(v_actor_id, p_area_id) assignable
  JOIN public.usuarios target ON target.id = assignable.usuario_id
  JOIN public.areas area ON area.id = p_area_id
  ORDER BY target.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_assignable_users(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_users_share_immediate_scope(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_user_is_available(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.team_kanban_available_users(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.team_kanban_assignable_users(uuid, uuid) IS
  'Responsables permitidos: actor y descendientes de su rama; lider de area ve su area; Super Admin conserva alcance global.';

NOTIFY pgrst, 'reload schema';
