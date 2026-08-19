-- Checklist de acciones de equipo: validacion persistente, auditoria y bloqueo de cierre.

CREATE OR REPLACE FUNCTION public.team_kanban_set_checklist_item_done(
  p_action_id uuid,
  p_item_index integer,
  p_done boolean
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_row public.acciones_equipo;
  v_item jsonb;
  v_closing_state_id uuid;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT actor.id
  INTO v_actor_id
  FROM public.usuarios actor
  WHERE actor.user_id = (SELECT auth.uid())
    AND actor.activo = true
  LIMIT 1;

  SELECT action.*
  INTO v_row
  FROM public.acciones_equipo action
  WHERE action.id = p_action_id
  FOR UPDATE;

  IF v_actor_id IS NULL OR v_row.id IS NULL THEN
    RAISE EXCEPTION 'Accion o perfil no encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_item_index < 0
    OR p_item_index >= jsonb_array_length(coalesce(v_row.checklist, '[]'::jsonb))
  THEN
    RAISE EXCEPTION 'Punto de checklist invalido'
      USING ERRCODE = '22023';
  END IF;

  v_item := v_row.checklist -> p_item_index;

  IF NOT (
    public.team_kanban_user_is_super_admin(v_actor_id)
    OR public.team_kanban_current_user_can_use_area(v_row.area_id)
    OR v_actor_id = v_row.asignado_a
    OR v_actor_id = v_row.creado_por
    OR v_actor_id = v_row.lider_id
    OR v_actor_id = nullif(v_item->>'responsable_id', '')::uuid
  ) THEN
    RAISE EXCEPTION 'Solo quien administra la accion, su responsable o el responsable del check puede validarlo'
      USING ERRCODE = '42501';
  END IF;

  v_item := v_item || jsonb_build_object(
    'done', coalesce(p_done, false),
    'checked_at', CASE WHEN coalesce(p_done, false) THEN to_jsonb(now()) ELSE 'null'::jsonb END,
    'checked_by', CASE WHEN coalesce(p_done, false) THEN to_jsonb(v_actor_id) ELSE 'null'::jsonb END
  );

  UPDATE public.acciones_equipo action
  SET checklist = jsonb_set(
        coalesce(action.checklist, '[]'::jsonb),
        ARRAY[p_item_index::text],
        v_item,
        false
      ),
      updated_at = now()
  WHERE action.id = p_action_id
  RETURNING action.* INTO v_row;

  IF coalesce(p_done, false)
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_row.checklist, '[]'::jsonb)) item
      WHERE NOT coalesce((item->>'done')::boolean, false)
    )
  THEN
    SELECT status.id
    INTO v_closing_state_id
    FROM public.statuses status
    WHERE status.activo
      AND status.es_cierre
    ORDER BY
      CASE WHEN lower(status.nombre) = 'hecho' THEN 0 ELSE 1 END,
      status.orden,
      status.id
    LIMIT 1;

    IF v_closing_state_id IS NOT NULL THEN
      UPDATE public.acciones_equipo action
      SET estado_id = v_closing_state_id,
          completed_at = coalesce(action.completed_at, now()),
          updated_at = now()
      WHERE action.id = p_action_id
        AND action.estado_id <> v_closing_state_id
      RETURNING action.* INTO v_row;
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

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

  SELECT action.*
  INTO v_row
  FROM public.acciones_equipo action
  WHERE action.id = p_action_id;

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
    RAISE EXCEPTION 'El responsable no pertenece al grupo de la accion'
      USING ERRCODE = '42501';
  END IF;

  IF p_state_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.statuses status
      WHERE status.id = p_state_id
        AND status.activo
    )
  THEN
    RAISE EXCEPTION 'Estado invalido'
      USING ERRCODE = '22023';
  END IF;

  SELECT status.es_cierre
  INTO v_final
  FROM public.statuses status
  WHERE status.id = coalesce(p_state_id, v_row.estado_id);

  IF p_state_id IS NOT NULL
    AND coalesce(v_final, false)
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_row.checklist, '[]'::jsonb)) item
      WHERE NOT coalesce((item->>'done')::boolean, false)
    )
  THEN
    RAISE EXCEPTION 'Completa todos los puntos del checklist antes de cerrar la accion'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.acciones_equipo action
  SET estado_id = coalesce(p_state_id, action.estado_id),
      asignado_a = coalesce(p_assignee, action.asignado_a),
      prioridad = coalesce(p_priority, action.prioridad),
      bloqueada = coalesce(p_blocked, action.bloqueada),
      fecha_limite = coalesce(p_due_at, action.fecha_limite),
      completed_at = CASE
        WHEN coalesce(v_final, false) THEN coalesce(action.completed_at, now())
        ELSE NULL
      END,
      updated_at = now()
  WHERE action.id = p_action_id
  RETURNING action.* INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_set_checklist_item_done(uuid, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_set_checklist_item_done(uuid, integer, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.team_kanban_update_action(uuid, uuid, uuid, text, boolean, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_update_action(uuid, uuid, uuid, text, boolean, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.team_kanban_set_checklist_item_done(uuid, integer, boolean) IS
  'Marca o desmarca un punto del checklist de equipo y registra checked_by/checked_at.';

NOTIFY pgrst, 'reload schema';
