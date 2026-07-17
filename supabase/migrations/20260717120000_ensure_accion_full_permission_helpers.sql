-- Reparacion idempotente: algunas bases pueden tener RPCs recientes de checklist
-- sin las funciones helper de permisos de acciones completas.

CREATE OR REPLACE FUNCTION public.is_action_privileged_usuario(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND public.normalize_business_role(u.rol::text) IN (
        public.normalize_business_role('super_admin'),
        public.normalize_business_role('Direccion')
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.user_roles ur ON ur.user_id = u.user_id
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND ur.app_role = 'super_admin'
  );
$$;

COMMENT ON FUNCTION public.is_action_privileged_usuario(uuid) IS
  'Indica si usuarios.id tiene privilegio especifico sobre acciones: super_admin o Direccion.';

CREATE OR REPLACE FUNCTION public.can_manage_accion_full_as(
  p_accion_id uuid,
  p_usuario_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.acciones_diarias a
    WHERE a.id = p_accion_id
      AND (
        (a.created_by IS NOT NULL AND a.created_by = p_usuario_id)
        OR public.is_action_privileged_usuario(p_usuario_id)
      )
  );
$$;

COMMENT ON FUNCTION public.can_manage_accion_full_as(uuid, uuid) IS
  'Permite edicion completa/verificacion: creador-asignador, super_admin o Direccion.';

CREATE OR REPLACE FUNCTION public.can_manage_accion_full(p_accion_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.can_manage_accion_full_as(p_accion_id, public.get_my_usuario_id());
$$;

COMMENT ON FUNCTION public.can_manage_accion_full(uuid) IS
  'Permiso del usuario autenticado para editar completamente o verificar una accion.';

REVOKE ALL ON FUNCTION public.is_action_privileged_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_accion_full_as(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_accion_full(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_action_privileged_usuario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_accion_full_as(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_accion_full(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
