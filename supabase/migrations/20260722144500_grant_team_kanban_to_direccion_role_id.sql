-- Garantiza acceso a Kanban por Equipos para el rol Direccion indicado.
-- UUID compartido por negocio: 6e459285-3967-418d-99cc-7793df175107.

INSERT INTO public.catalog_role_modules (role_id, module_key)
SELECT '6e459285-3967-418d-99cc-7793df175107'::uuid, 'team_kanban'
WHERE EXISTS (
  SELECT 1
  FROM public.catalog_roles cr
  WHERE cr.id = '6e459285-3967-418d-99cc-7793df175107'::uuid
    AND cr.activo
)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
