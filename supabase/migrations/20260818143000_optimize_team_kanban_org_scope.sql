-- Evita recalcular el alcance organizacional por cada candidato del selector.

CREATE OR REPLACE FUNCTION public.team_kanban_area_scope_users(p_area_id uuid)
RETURNS TABLE (usuario_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH area_context AS (
    SELECT a.id, a.nombre
    FROM public.areas a
    WHERE a.id = p_area_id
  ),
  direct_members AS (
    SELECT u.id
    FROM public.usuarios u
    CROSS JOIN area_context a
    WHERE u.activo = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.usuario_areas ua
          WHERE ua.user_id = u.id
            AND ua.area_id = a.id
        )
        OR lower(btrim(u.area)) = lower(btrim(a.nombre))
      )
  ),
  leaders AS (
    SELECT u.id
    FROM public.area_lideres al
    JOIN public.usuarios u ON u.id = al.user_id AND u.activo = true
    WHERE al.area_id = p_area_id
  ),
  managers AS (
    SELECT manager.id
    FROM direct_members member
    JOIN public.usuarios report ON report.id = member.id
    JOIN public.usuarios manager
      ON manager.id = report.manager_user_id
     AND manager.activo = true
  )
  SELECT id FROM direct_members
  UNION
  SELECT id FROM leaders
  UNION
  SELECT id FROM managers;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_user_is_in_area_scope(
  p_usuario_id uuid,
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
    FROM public.team_kanban_area_scope_users(p_area_id) scoped
    WHERE scoped.usuario_id = p_usuario_id
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
      FROM public.usuarios actor
      WHERE actor.id = p_actor_id
        AND actor.activo = true
    )
    AND public.team_kanban_user_is_in_area_scope(p_target_id, p_area_id)
    AND NOT public.team_kanban_user_is_super_admin(p_target_id)
    AND (
      public.team_kanban_user_is_super_admin(p_actor_id)
      OR public.team_kanban_user_is_in_area_scope(p_actor_id, p_area_id)
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
  SELECT public.team_kanban_current_user_can_use_area(p_area_id)
    AND public.team_kanban_user_is_in_area_scope(p_target_id, p_area_id)
    AND NOT public.team_kanban_user_is_super_admin(p_target_id);
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
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  IF NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.nombre,
    u.rol::text,
    a.nombre,
    u.manager_user_id
  FROM public.team_kanban_area_scope_users(p_area_id) scoped
  JOIN public.usuarios u ON u.id = scoped.usuario_id
  JOIN public.areas a ON a.id = p_area_id
  WHERE NOT public.team_kanban_user_is_super_admin(u.id)
  ORDER BY u.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_area_scope_users(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_user_is_in_area_scope(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_users_share_immediate_scope(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_user_is_available(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.team_kanban_available_users(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_available_users(uuid)
  TO authenticated;
