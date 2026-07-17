-- Kanban por Equipos: el selector de areas solo lista membresias del perfil.
-- Antes, team_kanban_is_admin() devolvia TODAS las areas del catalogo.

CREATE OR REPLACE FUNCTION public.team_kanban_my_areas_membership_source()
RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT u.id, u.area
    FROM public.usuarios u
    WHERE u.user_id = auth.uid()
    LIMIT 1
  ),
  membership AS (
    -- Areas definidas en el perfil (usuario_areas).
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN public.usuario_areas ua ON ua.area_id = a.id
    JOIN me ON me.id = ua.user_id
    UNION
    -- Compatibilidad: area principal textual sin fila en usuario_areas.
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN me ON me.area IS NOT NULL
      AND lower(btrim(a.nombre)) = lower(btrim(me.area))
  ),
  visible AS (
    SELECT
      m.id,
      m.nombre,
      public.team_kanban_is_leader(m.id) AS is_leader
    FROM membership m
  )
  SELECT
    v.id,
    v.nombre,
    v.is_leader,
    (
      SELECT count(*)
      FROM public.usuario_areas ua
      JOIN public.usuarios member ON member.id = ua.user_id
      CROSS JOIN me
      WHERE ua.area_id = v.id
        AND (
          public.team_kanban_is_admin()
          OR member.id = me.id
          OR member.manager_user_id = me.id
        )
    ) AS member_count,
    (
      SELECT count(*)
      FROM public.acciones_equipo ae
      JOIN public.area_kanban_estados s ON s.id = ae.estado_id
      CROSS JOIN me
      WHERE ae.area_id = v.id
        AND NOT s.es_final
        AND (
          public.team_kanban_is_admin()
          OR ae.lider_id = me.id
          OR ae.asignado_a = me.id
          OR ae.creado_por = me.id
        )
    ) AS open_count
  FROM visible v
  ORDER BY v.nombre;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.team_kanban_my_areas_internal()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.team_kanban_my_areas_internal()
      RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT * FROM public.team_kanban_my_areas_membership_source();
      $body$;
    $fn$;
    REVOKE ALL ON FUNCTION public.team_kanban_my_areas_internal() FROM PUBLIC, anon, authenticated;
  ELSE
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.team_kanban_my_areas()
      RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT * FROM public.team_kanban_my_areas_membership_source();
      $body$;
    $fn$;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.team_kanban_my_areas_membership_source() IS
  'Fuente de areas del Kanban por Equipos: solo membresias del perfil (usuario_areas / area principal).';

REVOKE ALL ON FUNCTION public.team_kanban_my_areas_membership_source() FROM PUBLIC, anon, authenticated;
