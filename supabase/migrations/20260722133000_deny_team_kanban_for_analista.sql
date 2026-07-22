-- Cierra acceso accidental de Analista a Kanban por Equipos.
-- El modulo queda disponible solo para Direccion y super_admin.

DELETE FROM public.catalog_role_modules crm
USING public.catalog_roles cr
WHERE crm.role_id = cr.id
  AND crm.module_key = 'team_kanban'
  AND public.normalize_business_role(cr.nombre) = public.normalize_business_role('Analista');

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
        AND public.normalize_business_role(u.rol::text) <> public.normalize_business_role('Analista')
        AND (
          public.normalize_business_role(u.rol::text) IN (
            public.normalize_business_role('super_admin'),
            public.normalize_business_role('Direccion')
          )
          OR lower(ur.app_role::text) = 'super_admin'
        )
    );
$$;

COMMENT ON FUNCTION public.team_kanban_is_super_admin() IS
  'Autoriza Kanban por Equipos para Direccion o super_admin; Analista queda excluido aunque tenga modulo/app_role accidental.';

NOTIFY pgrst, 'reload schema';
