-- Kanban por Equipos: colaboracion segmentada por area.
-- Todos los usuarios con acceso al modulo y membresia del area ven el mismo tablero
-- y pueden asignar acciones solo a usuarios activos de esa misma area.

CREATE OR REPLACE FUNCTION public.team_kanban_current_user_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
      WHERE u.user_id = (SELECT auth.uid())
        AND u.activo = true
        AND (
          public.normalize_business_role(u.rol::text) = public.normalize_business_role('super_admin')
          OR lower(ur.app_role::text) = 'super_admin'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_user_belongs_to_area(
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
    FROM public.usuarios u
    JOIN public.areas a ON a.id = p_area_id
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.usuario_areas ua
          WHERE ua.user_id = u.id
            AND ua.area_id = p_area_id
        )
        OR lower(btrim(u.area)) = lower(btrim(a.nombre))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_current_user_can_use_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id
    FROM public.usuarios
    WHERE user_id = (SELECT auth.uid())
      AND activo = true
    LIMIT 1
  )
  SELECT public.team_kanban_current_user_is_global_admin()
    OR EXISTS (
      SELECT 1
      FROM me
      WHERE public.team_kanban_user_belongs_to_area(me.id, p_area_id)
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
  SELECT public.team_kanban_user_belongs_to_area(p_assignee, p_area_id)
    OR EXISTS (
      SELECT 1
      FROM public.area_lideres al
      JOIN public.usuarios u ON u.id = al.user_id
      WHERE al.area_id = p_area_id
        AND al.user_id = p_assignee
        AND u.activo = true
    );
$$;

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
    WHERE u.user_id = (SELECT auth.uid())
      AND u.activo = true
    LIMIT 1
  ),
  membership AS (
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN public.usuario_areas ua ON ua.area_id = a.id
    JOIN me ON me.id = ua.user_id
    UNION
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN me ON me.area IS NOT NULL
      AND lower(btrim(a.nombre)) = lower(btrim(me.area))
  ),
  visible AS (
    SELECT a.id, a.nombre
    FROM public.areas a
    WHERE public.team_kanban_current_user_is_global_admin()
    UNION
    SELECT m.id, m.nombre
    FROM membership m
  )
  SELECT
    v.id,
    v.nombre,
    EXISTS (
      SELECT 1
      FROM public.area_lideres al
      CROSS JOIN me
      WHERE al.area_id = v.id
        AND al.user_id = me.id
    ) AS is_leader,
    (
      SELECT count(*)
      FROM public.usuarios u
      WHERE public.team_kanban_user_belongs_to_area(u.id, v.id)
    ) AS member_count,
    (
      SELECT count(*)
      FROM public.acciones_equipo ae
      JOIN public.area_kanban_estados s ON s.id = ae.estado_id
      WHERE ae.area_id = v.id
        AND NOT s.es_final
    ) AS open_count
  FROM visible v
  ORDER BY v.nombre;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_my_areas_internal()
RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.team_kanban_my_areas_membership_source();
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_board(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_is_leader boolean;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT id
  INTO v_me
  FROM public.usuarios
  WHERE user_id = (SELECT auth.uid())
    AND activo = true
  LIMIT 1;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  v_is_leader := EXISTS (
    SELECT 1
    FROM public.area_lideres al
    WHERE al.area_id = p_area_id
      AND al.user_id = v_me
  );

  RETURN jsonb_build_object(
    'isLeader', v_is_leader,
    'canManage', true,
    'states', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.orden)
      FROM public.area_kanban_estados s
      WHERE s.area_id = p_area_id
        AND s.activo
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) ORDER BY u.nombre)
      FROM public.usuarios u
      WHERE public.team_kanban_user_belongs_to_area(u.id, p_area_id)
    ), '[]'::jsonb),
    'actions', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('asignado_nombre', u.nombre) ORDER BY a.created_at DESC)
      FROM public.acciones_equipo a
      JOIN public.usuarios u ON u.id = a.asignado_a
      WHERE a.area_id = p_area_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_create_action(
  p_area_id uuid,
  p_title text,
  p_description text,
  p_assignee uuid,
  p_priority text,
  p_due_at timestamptz,
  p_evidence boolean,
  p_checklist jsonb DEFAULT '[]'::jsonb,
  p_evidence_text text DEFAULT NULL,
  p_story_points integer DEFAULT 0,
  p_tipo_accion text DEFAULT 'operativa',
  p_gap_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_catalog_kpi_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_state uuid;
  v_row public.acciones_equipo;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT id
  INTO v_me
  FROM public.usuarios
  WHERE user_id = (SELECT auth.uid())
    AND activo = true
  LIMIT 1;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'Solo puedes crear acciones en areas asignadas a tu perfil'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_assignee_belongs_to_area(p_area_id, p_assignee) THEN
    RAISE EXCEPTION 'El responsable no pertenece al area seleccionada'
      USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_state
  FROM public.area_kanban_estados
  WHERE area_id = p_area_id
    AND activo
  ORDER BY orden
  LIMIT 1;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'El area no tiene estados activos'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.acciones_equipo(
    area_id,
    estado_id,
    titulo,
    descripcion,
    asignado_a,
    lider_id,
    creado_por,
    prioridad,
    fecha_limite,
    evidencia_requerida,
    evidencia_esperada,
    checklist,
    story_points,
    tipo_accion,
    gap_ids,
    catalog_kpi_ids
  )
  VALUES (
    p_area_id,
    v_state,
    trim(p_title),
    nullif(trim(p_description), ''),
    p_assignee,
    v_me,
    v_me,
    p_priority,
    p_due_at,
    p_evidence,
    nullif(trim(p_evidence_text), ''),
    coalesce(p_checklist, '[]'::jsonb),
    coalesce(p_story_points, 0),
    coalesce(p_tipo_accion, 'operativa'),
    coalesce(p_gap_ids, ARRAY[]::uuid[]),
    coalesce(p_catalog_kpi_ids, ARRAY[]::uuid[])
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_update_action(
  p_action_id uuid,
  p_state_id uuid DEFAULT NULL,
  p_assignee uuid DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_blocked boolean DEFAULT NULL
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.acciones_equipo;
  v_final boolean;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT *
  INTO v_row
  FROM public.acciones_equipo
  WHERE id = p_action_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Accion no encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(v_row.area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  IF p_assignee IS NOT NULL
    AND NOT public.team_kanban_assignee_belongs_to_area(v_row.area_id, p_assignee)
  THEN
    RAISE EXCEPTION 'El responsable no pertenece al area de la accion'
      USING ERRCODE = '42501';
  END IF;

  IF p_state_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.area_kanban_estados s
      WHERE s.id = p_state_id
        AND s.area_id = v_row.area_id
        AND s.activo
    )
  THEN
    RAISE EXCEPTION 'Estado invalido para esta area'
      USING ERRCODE = '22023';
  END IF;

  SELECT es_final
  INTO v_final
  FROM public.area_kanban_estados
  WHERE id = coalesce(p_state_id, v_row.estado_id);

  UPDATE public.acciones_equipo
  SET estado_id = coalesce(p_state_id, estado_id),
      asignado_a = coalesce(p_assignee, asignado_a),
      prioridad = coalesce(p_priority, prioridad),
      bloqueada = coalesce(p_blocked, bloqueada),
      completed_at = CASE WHEN v_final THEN coalesce(completed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = p_action_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

DROP POLICY IF EXISTS area_lideres_select_scoped ON public.area_lideres;
CREATE POLICY area_lideres_select_scoped
ON public.area_lideres FOR SELECT TO authenticated
USING (public.team_kanban_current_user_can_use_area(area_id));

DROP POLICY IF EXISTS area_estados_select_scoped ON public.area_kanban_estados;
CREATE POLICY area_estados_select_scoped
ON public.area_kanban_estados FOR SELECT TO authenticated
USING (public.team_kanban_current_user_can_use_area(area_id));

DROP POLICY IF EXISTS acciones_equipo_select_scoped ON public.acciones_equipo;
CREATE POLICY acciones_equipo_select_scoped
ON public.acciones_equipo FOR SELECT TO authenticated
USING (public.team_kanban_current_user_can_use_area(area_id));

DROP POLICY IF EXISTS escalamiento_select_leaders ON public.escalamiento_historial;
CREATE POLICY escalamiento_select_leaders
ON public.escalamiento_historial FOR SELECT TO authenticated
USING (public.team_kanban_current_user_can_use_area(area_origen_id));

REVOKE ALL ON FUNCTION public.team_kanban_current_user_is_global_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_user_belongs_to_area(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_current_user_can_use_area(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_kanban_current_user_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_user_belongs_to_area(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_current_user_can_use_area(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.team_kanban_current_user_can_use_area(uuid) IS
  'Autoriza Kanban por Equipos por segmentacion de area; solo super_admin global omite membresia.';

NOTIFY pgrst, 'reload schema';
