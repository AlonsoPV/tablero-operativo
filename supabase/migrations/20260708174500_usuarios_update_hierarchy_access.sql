-- =============================================================================
-- Organigrama: permitir actualizar jerarquía a quien administra usuarios
-- (corrige PGRST116 cuando RLS bloquea UPDATE + .single() sin filas).
-- =============================================================================

DROP POLICY IF EXISTS usuarios_update_own_or_admin ON public.usuarios;

CREATE POLICY usuarios_update_own_or_admin ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_catalogs()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.can_manage_catalogs()
  );

COMMENT ON POLICY usuarios_update_own_or_admin ON public.usuarios IS
  'Propio perfil o quien puede administrar usuarios/catálogos (incluye app admin y super_admin).';

DROP FUNCTION IF EXISTS public.settings_users_update_manager(uuid, uuid);

CREATE OR REPLACE FUNCTION public.settings_users_update_manager(
  p_user_id uuid,
  p_manager_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  rol text,
  area text,
  activo boolean,
  manager_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario invalido'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.usuarios u
  SET
    manager_user_id = p_manager_user_id,
    updated_at = now()
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    u.nombre,
    u.rol::text,
    u.area,
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  WHERE u.id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.settings_users_update_manager(uuid, uuid) IS
  'Actualiza jefe directo (manager_user_id). Valida can_manage_catalogs().';

GRANT EXECUTE ON FUNCTION public.settings_users_update_manager(uuid, uuid) TO authenticated;
