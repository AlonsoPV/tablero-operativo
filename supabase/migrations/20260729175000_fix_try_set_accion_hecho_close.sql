-- Cierre a Hecho: alinear RPC con producto (evidencia no bloquea) y reconocer Super Admin
-- de negocio/catálogo. El 400 en try_set_accion_hecho suele ser RAISE de permisos o
-- la sobrecarga vieja que volvió a exigir evidencia.

CREATE OR REPLACE FUNCTION public.normalize_business_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      translate(
        trim(coalesce(p_role, '')),
        U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1',
        'aeiouun'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.accion_requires_evidencia_text(p_evidencia_esperada text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT false;
$$;

COMMENT ON FUNCTION public.accion_requires_evidencia_text(text) IS
  'La evidencia esperada es informativa; no bloquea el cierre de acciones.';

CREATE OR REPLACE FUNCTION public.is_action_privileged_usuario(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND public.normalize_business_role(u.rol::text) IN (
        'super_admin',
        'direccion'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.user_roles ur ON ur.user_id = u.user_id
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND lower(ur.app_role::text) IN ('super_admin', 'admin')
  )
  OR (
    to_regclass('public.usuario_catalog_roles') IS NOT NULL
    AND to_regclass('public.catalog_roles') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.usuario_catalog_roles ucr ON ucr.user_id = u.id
      JOIN public.catalog_roles cr ON cr.id = ucr.role_id
      WHERE u.id = p_usuario_id
        AND u.activo = true
        AND cr.activo = true
        AND (
          cr.system_key = 'super_admin'
          OR public.normalize_business_role(cr.nombre) IN ('super_admin', 'direccion')
        )
    )
  );
$$;

COMMENT ON FUNCTION public.is_action_privileged_usuario(uuid) IS
  'Privilegio sobre acciones: Super Admin / Direccion por usuarios.rol, app_role o catalog_roles.';

CREATE OR REPLACE FUNCTION public.is_business_admin_usuario(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND public.normalize_business_role(u.rol::text) IN (
        'dg',
        'sistemas',
        'super_admin'
      )
  )
  OR public.is_action_privileged_usuario(p_usuario_id);
$$;

DROP FUNCTION IF EXISTS public.try_set_accion_hecho(uuid, uuid);
DROP FUNCTION IF EXISTS public.try_set_accion_hecho(uuid);

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

  UPDATE public.acciones_diarias
  SET
    estado = 'Hecho'::action_status,
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
  'Cierra una accion: permisos + checklist completo; la evidencia no bloquea.';
COMMENT ON FUNCTION public.try_set_accion_hecho(uuid) IS
  'Wrapper PostgREST: cierra con el usuario autenticado.';

GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_set_accion_hecho(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
