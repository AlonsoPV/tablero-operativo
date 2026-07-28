-- Regla de acceso Analista:
-- solo Kanban por Equipos, Disciplina y Calendario.
-- En Kanban por Equipos, Analista entra a las RPC pero conserva alcance por
-- membresia/area porque NO se considera team_kanban_is_admin().

DELETE FROM public.catalog_role_modules crm
USING public.catalog_roles cr
WHERE crm.role_id = cr.id
  AND public.normalize_business_role(cr.nombre) = public.normalize_business_role('Analista')
  AND crm.module_key NOT IN ('team_kanban', 'discipline', 'calendar');

INSERT INTO public.catalog_role_modules (role_id, module_key)
SELECT cr.id, m.key
FROM public.catalog_roles cr
JOIN public.app_modules m ON m.key IN ('team_kanban', 'discipline', 'calendar')
WHERE cr.activo
  AND public.normalize_business_role(cr.nombre) = public.normalize_business_role('Analista')
  AND m.activo
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.team_kanban_can_enter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.team_kanban_is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.activo = true
        AND public.normalize_business_role(u.rol::text) = public.normalize_business_role('Analista')
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
  IF NOT public.team_kanban_can_enter() THEN
    RAISE EXCEPTION 'Kanban por Equipos esta disponible para Super Admin, Direccion y Analista'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_can_enter() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_can_enter() TO authenticated;

COMMENT ON FUNCTION public.team_kanban_can_enter() IS
  'Autoriza entrada a RPC de Kanban por Equipos. Analista no es admin; se limita por area/membresia en funciones internas.';

NOTIFY pgrst, 'reload schema';
