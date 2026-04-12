-- =============================================================================
-- Catálogo: rol super_admin + alinear usuarios.rol con user_roles (app)
-- usuarios.rol debe coincidir con catalog_roles.nombre para la UI de catálogos.
-- =============================================================================

INSERT INTO public.catalog_roles (nombre, descripcion, activo)
SELECT
  'super_admin',
  'Super administrador: gestión de roles de aplicación y catálogos.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_roles cr
  WHERE lower(trim(cr.nombre)) = 'super_admin'
);

UPDATE public.usuarios u
SET rol = 'super_admin'
FROM public.user_roles ur
WHERE ur.user_id = u.user_id
  AND ur.app_role = 'super_admin';
