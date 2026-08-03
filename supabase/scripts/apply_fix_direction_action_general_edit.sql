-- Ejecutar completo en Supabase SQL Editor.
-- Corrige RLS para que usuarios con rol Direccion puedan editar acciones ajenas.

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
    LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND (
        public.normalize_business_role(u.rol::text) = 'super_admin'
        OR public.normalize_business_role(u.rol::text) = 'direccion'
        OR public.normalize_business_role(u.rol::text) LIKE 'direccion_%'
        OR lower(ur.app_role::text) IN ('super_admin', 'admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_kanban_action_editor_role(p_usuario_id uuid)
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
        'kanban',
        'editor_kanban',
        'kanban_editor'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_accion_general_as(
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
        a.created_by = p_usuario_id
        OR a.updated_by = p_usuario_id
        OR public.is_action_privileged_usuario(p_usuario_id)
        OR public.has_kanban_action_editor_role(p_usuario_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_accion_general(p_accion_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.can_edit_accion_general_as(p_accion_id, public.get_my_usuario_id());
$$;

REVOKE ALL ON FUNCTION public.is_action_privileged_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_kanban_action_editor_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_accion_general_as(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_accion_general(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_action_privileged_usuario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_kanban_action_editor_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_accion_general_as(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_accion_general(uuid) TO authenticated;

DROP POLICY IF EXISTS acciones_update_own_or_admin ON public.acciones_diarias;
DROP POLICY IF EXISTS acciones_update_responsable_creator_or_admin ON public.acciones_diarias;

CREATE POLICY acciones_update_responsable_creator_or_admin ON public.acciones_diarias
  FOR UPDATE TO authenticated
  USING (
    NOT public.is_business_analyst()
    AND public.can_edit_accion_general(id)
  )
  WITH CHECK (
    NOT public.is_business_analyst()
    AND public.can_edit_accion_general(id)
  );

NOTIFY pgrst, 'reload schema';
