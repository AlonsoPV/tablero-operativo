-- Kanban por Equipos: al reasignar, el responsable debe pertenecer al area
-- de la accion incluso para roles con permisos ejecutivos.

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
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_assignee
      AND u.activo = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.usuario_areas ua
          WHERE ua.area_id = p_area_id
            AND ua.user_id = u.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.area_lideres al
          WHERE al.area_id = p_area_id
            AND al.user_id = u.id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid) TO authenticated;

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
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  IF NOT public.team_kanban_assignee_belongs_to_area(p_area_id, p_assignee) THEN
    RAISE EXCEPTION 'El responsable no pertenece al area seleccionada'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.team_kanban_create_action_internal(
    p_area_id, p_title, p_description, p_assignee, p_priority, p_due_at,
    p_evidence, p_checklist, p_evidence_text, p_story_points, p_tipo_accion,
    p_gap_ids, p_catalog_kpi_ids
  );
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
  v_area_id uuid;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  IF p_assignee IS NOT NULL THEN
    SELECT area_id
    INTO v_area_id
    FROM public.acciones_equipo
    WHERE id = p_action_id;

    IF v_area_id IS NULL THEN
      RAISE EXCEPTION 'Accion no encontrada'
        USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.team_kanban_assignee_belongs_to_area(v_area_id, p_assignee) THEN
      RAISE EXCEPTION 'El responsable no pertenece al area de la accion'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN public.team_kanban_update_action_internal(
    p_action_id, p_state_id, p_assignee, p_priority, p_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_create_action(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_update_action(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_kanban_create_action(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_update_action(uuid,uuid,uuid,text,boolean) TO authenticated;

COMMENT ON FUNCTION public.team_kanban_assignee_belongs_to_area(uuid, uuid) IS
  'Valida que el responsable de una accion de equipo sea usuario activo y pertenezca al area por membresia o liderazgo.';

NOTIFY pgrst, 'reload schema';
