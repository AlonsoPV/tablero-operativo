CREATE TABLE IF NOT EXISTS public.accion_fecha_compromiso_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL CHECK (origen IN ('kanban', 'team_kanban')),
  accion_id uuid NOT NULL,
  accion_titulo text NOT NULL,
  motivo_key text NOT NULL CHECK (
    motivo_key IN (
      'planeacion_trabajo',
      'dependencias',
      'recursos_capacidad',
      'cambios_compromiso'
    )
  ),
  motivo_label text NOT NULL,
  fecha_anterior date NOT NULL,
  fecha_nueva date NOT NULL,
  changed_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  changed_by_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_anterior IS DISTINCT FROM fecha_nueva)
);

CREATE INDEX IF NOT EXISTS idx_accion_fecha_compromiso_cambios_created_at
  ON public.accion_fecha_compromiso_cambios(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accion_fecha_compromiso_cambios_accion
  ON public.accion_fecha_compromiso_cambios(origen, accion_id);

ALTER TABLE public.accion_fecha_compromiso_cambios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accion_fecha_compromiso_cambios_select_authenticated
  ON public.accion_fecha_compromiso_cambios;
CREATE POLICY accion_fecha_compromiso_cambios_select_authenticated
ON public.accion_fecha_compromiso_cambios
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS accion_fecha_compromiso_cambios_insert_authenticated
  ON public.accion_fecha_compromiso_cambios;
CREATE POLICY accion_fecha_compromiso_cambios_insert_authenticated
ON public.accion_fecha_compromiso_cambios
FOR INSERT
TO authenticated
WITH CHECK (changed_by = (SELECT auth.uid()));

GRANT SELECT, INSERT ON public.accion_fecha_compromiso_cambios TO authenticated;

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
