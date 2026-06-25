-- Make the action-close RPC callable from PostgREST with either one or two args.
-- The browser client now sends p_usuario_id explicitly, but this wrapper keeps
-- older deployed bundles from failing with "function try_set_accion_hecho(uuid) does not exist".

DROP FUNCTION IF EXISTS public.try_set_accion_hecho(uuid, uuid);

CREATE OR REPLACE FUNCTION public.try_set_accion_hecho(
  p_accion_id uuid,
  p_usuario_id uuid
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
  requires_evidence boolean;
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

  requires_evidence := public.accion_requires_evidencia_text(action_row.evidencia_esperada);
  has_evidence := action_row.evidencia_cargada OR public.accion_has_evidencia(p_accion_id);

  IF requires_evidence AND NOT has_evidence THEN
    RAISE EXCEPTION 'No se puede marcar como Hecho sin evidencia cargada.'
      USING ERRCODE = '23514';
  END IF;

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

CREATE OR REPLACE FUNCTION public.try_set_accion_hecho(p_accion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.try_set_accion_hecho(p_accion_id, public.get_my_usuario_id());
END;
$$;

COMMENT ON FUNCTION public.try_set_accion_hecho(uuid, uuid) IS
  'Cierra una accion en una transaccion: permisos + checklist completo + evidencia cuando aplica.';
COMMENT ON FUNCTION public.try_set_accion_hecho(uuid) IS
  'Wrapper para PostgREST: cierra una accion usando el usuario autenticado.';

GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
