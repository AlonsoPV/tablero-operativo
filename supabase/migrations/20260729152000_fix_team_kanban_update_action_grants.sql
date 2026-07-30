CREATE OR REPLACE FUNCTION public.team_kanban_update_action(
  p_action_id uuid,
  p_state_id uuid DEFAULT NULL,
  p_assignee uuid DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_blocked boolean DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL
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
      fecha_limite = coalesce(p_due_at, fecha_limite),
      completed_at = CASE WHEN v_final THEN coalesce(completed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = p_action_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.team_kanban_update_action(
  uuid,
  uuid,
  uuid,
  text,
  boolean
);

REVOKE ALL ON FUNCTION public.team_kanban_update_action(
  uuid,
  uuid,
  uuid,
  text,
  boolean,
  timestamptz
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_kanban_update_action(
  uuid,
  uuid,
  uuid,
  text,
  boolean,
  timestamptz
) TO authenticated;

NOTIFY pgrst, 'reload schema';
