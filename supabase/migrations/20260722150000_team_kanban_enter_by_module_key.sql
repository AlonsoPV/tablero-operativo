-- Permite entrar a Kanban por Equipos a usuarios cuyo rol catalogado tenga
-- el modulo team_kanban, aunque usuarios.rol conserve otro texto legado.

CREATE OR REPLACE FUNCTION public.team_kanban_current_user_has_module(p_module_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.usuario_catalog_roles ucr ON ucr.user_id = u.id
    JOIN public.catalog_roles cr ON cr.id = ucr.role_id AND cr.activo
    JOIN public.catalog_role_modules crm ON crm.role_id = cr.id
    JOIN public.app_modules m ON m.key = crm.module_key AND m.activo
    WHERE u.user_id = (SELECT auth.uid())
      AND u.activo = true
      AND m.key = p_module_key
  );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_can_enter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.team_kanban_is_super_admin()
    OR public.team_kanban_current_user_has_module('team_kanban')
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
    RAISE EXCEPTION 'Kanban por Equipos requiere modulo team_kanban habilitado'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_current_user_has_module(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_current_user_has_module(text) TO authenticated;

COMMENT ON FUNCTION public.team_kanban_current_user_has_module(text) IS
  'Valida acceso por modulos de roles catalogados del usuario actual.';

NOTIFY pgrst, 'reload schema';
