-- =============================================================================
-- /settings/users/:id — detalle alineado con settings_users_list().
--
-- El listado admin usa RPC SECURITY DEFINER; el detalle leía public.usuarios con
-- RLS y fallaba para roles que gestionan usuarios (DG, Sistemas, super_admin
-- de negocio) si no tienen app_role en user_roles.
--
-- Incluye helpers de permisos por si faltan migraciones anteriores en DEV.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_business_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    translate(
      trim(coalesce(p_role, '')),
      U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1',
      'aeiouun'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.user_id = auth.uid()
      AND public.normalize_business_role(u.rol::text) = public.normalize_business_role(p_role)
      AND u.activo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.has_business_role('DG')
    OR public.has_business_role('Sistemas')
    OR public.has_business_role('super_admin');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_catalogs()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.is_app_admin()
    OR public.is_business_admin()
    OR public.has_business_role('Direccion');
$$;

COMMENT ON FUNCTION public.can_manage_catalogs() IS
  'Permiso comun para administrar catalogos y configuracion: admin app, admin de negocio o Direccion.';

DROP POLICY IF EXISTS usuarios_select_catalog_managers ON public.usuarios;

CREATE POLICY usuarios_select_catalog_managers ON public.usuarios
  FOR SELECT TO authenticated
  USING (public.can_manage_catalogs());

COMMENT ON POLICY usuarios_select_catalog_managers ON public.usuarios IS
  'Quien administra catalogos/usuarios puede leer perfiles para /settings/users.';

DROP FUNCTION IF EXISTS public.settings_users_get(uuid);

CREATE OR REPLACE FUNCTION public.settings_users_get(p_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  nombre text,
  rol text,
  area text,
  activo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    au.email::text,
    u.nombre,
    u.rol::text,
    u.area,
    u.activo,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  LEFT JOIN auth.users au ON au.id = u.user_id
  WHERE u.id = p_id
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.settings_users_get(uuid) IS
  'Detalle de usuario para /settings/users/:id. Valida can_manage_catalogs().';

GRANT EXECUTE ON FUNCTION public.settings_users_get(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_auth_user_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() != p_user_id
    AND NOT public.can_manage_catalogs()
  THEN
    RETURN NULL;
  END IF;

  SELECT au.email INTO v_email
  FROM auth.users au
  WHERE au.id = p_user_id
  LIMIT 1;

  RETURN v_email;
END;
$$;

COMMENT ON FUNCTION public.get_auth_user_email(uuid) IS
  'Devuelve email de auth.users. Propio usuario o quien puede gestionar usuarios (can_manage_catalogs).';
