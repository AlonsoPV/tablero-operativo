-- Habilita Kanban por Equipos para rol de negocio Direccion, manteniendo
-- el acceso existente de super_admin. Se conservan nombres de funciones para
-- no romper wrappers/RLS ya publicados.

CREATE OR REPLACE FUNCTION public.team_kanban_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
      WHERE u.user_id = (SELECT auth.uid())
        AND u.activo = true
        AND (
          public.normalize_business_role(u.rol::text) IN (
            public.normalize_business_role('super_admin'),
            public.normalize_business_role('Direccion')
          )
          OR lower(ur.app_role::text) = 'super_admin'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_assert_super_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.team_kanban_is_super_admin() THEN
    RAISE EXCEPTION 'Kanban por Equipos esta disponible para Super Admin y Direccion'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

INSERT INTO public.catalog_role_modules (role_id, module_key)
SELECT cr.id, 'team_kanban'
FROM public.catalog_roles cr
WHERE cr.activo
  AND public.normalize_business_role(cr.nombre) = 'direccion'
ON CONFLICT DO NOTHING;

COMMENT ON FUNCTION public.team_kanban_is_super_admin() IS
  'Autoriza Kanban por Equipos para rol de negocio Direccion o super_admin, y app_role super_admin.';

NOTIFY pgrst, 'reload schema';
