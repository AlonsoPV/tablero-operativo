-- Reconoce variantes de rol Direccion (por ejemplo Direccion general) en
-- Kanban por Equipos. Mantiene el alcance por membresia para Analista.

CREATE OR REPLACE FUNCTION public.team_kanban_is_direction_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.normalize_business_role(p_role) = public.normalize_business_role('Direccion')
    OR public.normalize_business_role(p_role) LIKE public.normalize_business_role('Direccion') || ' %';
$$;

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
          public.normalize_business_role(u.rol::text) = public.normalize_business_role('super_admin')
          OR public.team_kanban_is_direction_role(u.rol::text)
          OR lower(ur.app_role::text) = 'super_admin'
        )
    );
$$;

INSERT INTO public.catalog_role_modules (role_id, module_key)
SELECT cr.id, 'team_kanban'
FROM public.catalog_roles cr
WHERE cr.activo
  AND public.team_kanban_is_direction_role(cr.nombre)
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.team_kanban_is_direction_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_is_direction_role(text) TO authenticated;

COMMENT ON FUNCTION public.team_kanban_is_direction_role(text) IS
  'Detecta roles de Direccion, incluyendo variantes como Direccion general.';

NOTIFY pgrst, 'reload schema';
