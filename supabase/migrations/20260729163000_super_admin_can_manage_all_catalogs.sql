-- Super Admin debe poder administrar todos los catálogos (statuses, areas, etc.).
-- El PGRST116 al desactivar estatus ocurre porque RLS bloquea el UPDATE
-- (can_manage_catalogs = false) y PostgREST interpreta 0 filas como error .single().

-- 1) Normalización estable de roles (Super Admin → super_admin)
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

-- 2) Detecta Super Admin por app_role, usuarios.rol o catalog_roles
CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND lower(ur.app_role::text) IN ('super_admin', 'admin')
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.user_id = v_uid
      AND u.activo = true
      AND public.normalize_business_role(u.rol::text) = 'super_admin'
  ) THEN
    RETURN true;
  END IF;

  IF to_regclass('public.usuario_catalog_roles') IS NOT NULL
     AND to_regclass('public.catalog_roles') IS NOT NULL
     AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.usuario_catalog_roles ucr ON ucr.user_id = u.id
      JOIN public.catalog_roles cr ON cr.id = ucr.role_id
      WHERE u.user_id = v_uid
        AND u.activo = true
        AND cr.activo = true
        AND (
          cr.system_key = 'super_admin'
          OR public.normalize_business_role(cr.nombre) = 'super_admin'
        )
    ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_current_user_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin() TO authenticated;

-- 3) Rol de negocio: usuarios.rol + roles de catálogo asignados
CREATE OR REPLACE FUNCTION public.has_business_role(p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target text := public.normalize_business_role(p_role);
BEGIN
  IF v_uid IS NULL OR v_target = '' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.user_id = v_uid
      AND u.activo = true
      AND public.normalize_business_role(u.rol::text) = v_target
  ) THEN
    RETURN true;
  END IF;

  IF to_regclass('public.usuario_catalog_roles') IS NOT NULL
     AND to_regclass('public.catalog_roles') IS NOT NULL
     AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.usuario_catalog_roles ucr ON ucr.user_id = u.id
      JOIN public.catalog_roles cr ON cr.id = ucr.role_id
      WHERE u.user_id = v_uid
        AND u.activo = true
        AND cr.activo = true
        AND (
          public.normalize_business_role(cr.nombre) = v_target
          OR (v_target = 'super_admin' AND cr.system_key = 'super_admin')
        )
    ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 4) Permiso de catálogos: Super Admin siempre; también admin app/negocio y Dirección
CREATE OR REPLACE FUNCTION public.can_manage_catalogs()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.is_current_user_super_admin()
    OR public.is_app_admin()
    OR public.is_super_admin()
    OR public.is_business_admin()
    OR public.has_business_role('Direccion')
    OR public.has_business_role('DG')
    OR public.has_business_role('Sistemas');
$$;

COMMENT ON FUNCTION public.can_manage_catalogs() IS
  'Administrar catálogos y configuración: Super Admin (app/negocio/catálogo), admin app, DG, Sistemas o Dirección.';

-- 5) Grants de escritura en catálogos (RLS sigue filtrando con can_manage_catalogs)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.statuses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.priorities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dropdown_catalogs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dropdown_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_kpis TO authenticated;
