-- =============================================================================
-- Organigrama: alinear can_edit_any_org_hierarchy con el front.
-- El UI permite editar con user_roles.app_role = super_admin; el RPC solo
-- miraba usuarios.rol / área RH → 403 al guardar jefe (settings_users_update_manager).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_edit_any_org_hierarchy()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_belongs_to_area_name('RH')
    OR EXISTS (
      SELECT 1
      FROM public.usuarios me
      WHERE me.user_id = auth.uid()
        AND public.is_super_admin_role(me.rol::text)
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND lower(ur.app_role::text) = 'super_admin'
    )
    OR (
      to_regclass('public.usuario_catalog_roles') IS NOT NULL
      AND to_regclass('public.catalog_roles') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.usuarios u
        JOIN public.usuario_catalog_roles ucr ON ucr.user_id = u.id
        JOIN public.catalog_roles cr ON cr.id = ucr.role_id
        WHERE u.user_id = auth.uid()
          AND u.activo = true
          AND cr.activo = true
          AND (
            cr.system_key = 'super_admin'
            OR public.normalize_business_role(cr.nombre) = 'super_admin'
          )
      )
    );
$$;

COMMENT ON FUNCTION public.can_edit_any_org_hierarchy() IS
  'RH o Super Admin (rol de negocio, app_role o catálogo) pueden editar la jerarquía de otras personas.';
