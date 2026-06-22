-- =============================================================================
-- Acciones: permitir cierre automatico a Hecho con checklist completo sin
-- exigir evidencia cargada.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.try_set_accion_hecho(
  p_accion_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid;
  action_row public.acciones_diarias%ROWTYPE;
  pending_count integer;
  has_evidence boolean;
BEGIN
  actor_id := COALESCE(p_usuario_id, public.get_my_usuario_id());

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_usuario_id IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND p_usuario_id IS DISTINCT FROM public.get_my_usuario_id()
  THEN
    RAISE EXCEPTION 'No puedes cerrar acciones en nombre de otro usuario.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO action_row
  FROM public.acciones_diarias
  WHERE id = p_accion_id
  FOR UPDATE;

  IF action_row.id IS NULL THEN
    RAISE EXCEPTION 'Accion no encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF action_row.estado = 'Verificado'::action_status THEN
    RAISE EXCEPTION 'La accion ya esta verificada y no puede modificarse.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.can_close_accion_as(p_accion_id, actor_id) THEN
    RAISE EXCEPTION 'No tienes permiso para marcar esta accion como Hecha.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)
  INTO pending_count
  FROM public.accion_checkpoints c
  WHERE c.accion_id = p_accion_id
    AND c.activo = true
    AND c.completado = false;

  IF pending_count > 0 THEN
    RAISE EXCEPTION 'No puedes marcar esta accion como Hecha porque aun existen puntos de validacion pendientes.'
      USING ERRCODE = '23514';
  END IF;

  has_evidence := action_row.evidencia_cargada OR public.accion_has_evidencia(p_accion_id);

  UPDATE public.acciones_diarias
  SET
    estado = 'Hecho'::action_status,
    evidencia_cargada = CASE WHEN has_evidence THEN true ELSE evidencia_cargada END,
    completed_at = COALESCE(completed_at, now()),
    completed_by = COALESCE(completed_by, actor_id),
    updated_by = actor_id
  WHERE id = p_accion_id
    AND estado IS DISTINCT FROM 'Hecho'::action_status;

  RETURN jsonb_build_object(
    'ok', true,
    'accion_id', p_accion_id,
    'estado', 'Hecho',
    'closed_by', actor_id
  );
END;
$$;

COMMENT ON FUNCTION public.try_set_accion_hecho(uuid, uuid) IS
  'Cierra una accion en una transaccion: permisos + checklist completo; la evidencia no es requisito.';

GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid, uuid) TO service_role;

DROP TRIGGER IF EXISTS acciones_diarias_block_hecho_evidencia ON public.acciones_diarias;
DROP FUNCTION IF EXISTS public.acciones_prevent_hecho_if_evidencia_missing();

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
  can_try_close boolean;
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
    SELECT NOT EXISTS (
      SELECT 1
      FROM public.accion_checkpoints pending
      WHERE pending.accion_id = v_accion_id
        AND pending.activo = true
        AND pending.completado = false
    )
    INTO can_try_close;

    IF can_try_close THEN
      PERFORM public.try_set_accion_hecho(v_accion_id, me);
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) IS
  'Marca/desmarca un punto y cierra automaticamente cuando el checklist queda completo.';

CREATE OR REPLACE FUNCTION public.set_accion_checkpoint_completado_for_usuario(
  p_checkpoint_id uuid,
  p_completado boolean,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accion_id uuid;
  can_try_close boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Funcion reservada para integraciones de servidor.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.accion_id
  INTO v_accion_id
  FROM public.accion_checkpoints c
  WHERE c.id = p_checkpoint_id
    AND c.activo = true;

  IF v_accion_id IS NULL THEN
    RAISE EXCEPTION 'Punto de checklist no encontrado o inactivo.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_close_accion_as(v_accion_id, p_usuario_id) THEN
    RAISE EXCEPTION 'No tienes permiso para marcar este punto del checklist.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accion_checkpoints
  SET
    completado = p_completado,
    checked_at = CASE WHEN p_completado THEN now() ELSE NULL END,
    checked_by = CASE WHEN p_completado THEN p_usuario_id ELSE NULL END
  WHERE id = p_checkpoint_id;

  IF p_completado THEN
    SELECT NOT EXISTS (
      SELECT 1
      FROM public.accion_checkpoints pending
      WHERE pending.accion_id = v_accion_id
        AND pending.activo = true
        AND pending.completado = false
    )
    INTO can_try_close;

    IF can_try_close THEN
      RETURN public.try_set_accion_hecho(v_accion_id, p_usuario_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'accion_id', v_accion_id);
END;
$$;

COMMENT ON FUNCTION public.set_accion_checkpoint_completado_for_usuario(uuid, boolean, uuid) IS
  'Marca un checkpoint desde integraciones server-side y cierra automaticamente con checklist completo.';

GRANT EXECUTE ON FUNCTION public.set_accion_checkpoint_completado_for_usuario(uuid, boolean, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
