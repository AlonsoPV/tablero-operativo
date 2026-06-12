-- =============================================================================
-- Acciones: al completar el ultimo checkpoint activo, cerrar automaticamente
-- la accion en estado Hecho.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_accion_checkpoint_completado(
  p_checkpoint_id uuid,
  p_completado boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  v_accion_id uuid;
  v_creator uuid;
  v_responsable uuid;
  can_admin boolean;
BEGIN
  me := public.get_my_usuario_id();
  can_admin := public.is_app_admin() OR public.is_business_admin();

  SELECT c.accion_id, a.created_by, a.responsable
  INTO v_accion_id, v_creator, v_responsable
  FROM public.accion_checkpoints c
  JOIN public.acciones_diarias a ON a.id = c.accion_id
  WHERE c.id = p_checkpoint_id
    AND c.activo = true;

  IF v_accion_id IS NULL THEN
    RAISE EXCEPTION 'Punto de checklist no encontrado o inactivo.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    can_admin
    OR (v_creator IS NOT NULL AND v_creator = me)
    OR v_responsable = me
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para marcar este punto del checklist.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accion_checkpoints
  SET
    completado = p_completado,
    checked_at = CASE WHEN p_completado THEN now() ELSE NULL END,
    checked_by = CASE WHEN p_completado THEN me ELSE NULL END
  WHERE id = p_checkpoint_id;

  IF p_completado THEN
    UPDATE public.acciones_diarias a
    SET
      estado = 'Hecho'::action_status,
      completed_at = COALESCE(a.completed_at, now()),
      completed_by = COALESCE(a.completed_by, me),
      updated_by = me
    WHERE a.id = v_accion_id
      AND a.estado NOT IN ('Hecho'::action_status, 'Verificado'::action_status)
      AND NOT EXISTS (
        SELECT 1
        FROM public.accion_checkpoints pending
        WHERE pending.accion_id = a.id
          AND pending.activo = true
          AND pending.completado = false
      );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) IS
  'Marca/desmarca un checkpoint y pasa la accion a Hecho automaticamente cuando ya no quedan checkpoints activos pendientes.';

GRANT EXECUTE ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
