-- Checklist: borrar puntos pendientes por RPC para evitar falsos exitos cuando
-- RLS no afecta filas. La estructura puede administrarla quien gestiona la
-- accion completa: creador/asignador, super_admin o Direccion.

CREATE OR REPLACE FUNCTION public.accion_checkpoints_guard_assignee_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  action_creator uuid;
  action_responsable uuid;
  can_admin boolean;
  can_full_structure boolean;
BEGIN
  me := public.get_my_usuario_id();
  can_admin := public.is_app_admin() OR public.is_business_admin();

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN
      NEW.created_by := me;
    END IF;
    RETURN NEW;
  END IF;

  SELECT a.created_by, a.responsable
  INTO action_creator, action_responsable
  FROM public.acciones_diarias a
  WHERE a.id = OLD.accion_id;

  can_full_structure :=
    can_admin
    OR public.can_manage_accion_full_as(OLD.accion_id, me)
    OR (action_creator IS NOT NULL AND action_creator = me);

  IF can_full_structure THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Solo quien puede administrar la accion puede eliminar puntos del checklist.'
      USING ERRCODE = '42501';
  END IF;

  IF action_responsable IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'Solo la persona creadora de la accion o el responsable asignado pueden actualizar este checklist.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.accion_id IS DISTINCT FROM OLD.accion_id
    OR NEW.texto IS DISTINCT FROM OLD.texto
    OR NEW.orden IS DISTINCT FROM OLD.orden
    OR NEW.obligatorio IS DISTINCT FROM OLD.obligatorio
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'El responsable asignado solo puede marcar o desmarcar puntos del checklist.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.completado IS NOT DISTINCT FROM OLD.completado
    AND (
      NEW.checked_at IS DISTINCT FROM OLD.checked_at
      OR NEW.checked_by IS DISTINCT FROM OLD.checked_by
    )
  THEN
    RAISE EXCEPTION 'El responsable asignado solo puede actualizar auditoria al marcar o desmarcar puntos.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.completado = true AND OLD.completado IS DISTINCT FROM true THEN
    NEW.checked_at := now();
    NEW.checked_by := me;
  ELSIF NEW.completado = false AND OLD.completado IS DISTINCT FROM false THEN
    NEW.checked_at := NULL;
    NEW.checked_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_accion_checkpoint(p_checkpoint_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  v_accion_id uuid;
  v_completado boolean;
BEGIN
  me := public.get_my_usuario_id();

  IF me IS NULL THEN
    RAISE EXCEPTION 'No autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.accion_id, c.completado
  INTO v_accion_id, v_completado
  FROM public.accion_checkpoints c
  WHERE c.id = p_checkpoint_id
    AND c.activo = true;

  IF v_accion_id IS NULL THEN
    RAISE EXCEPTION 'Punto de checklist no encontrado o ya eliminado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_completado THEN
    RAISE EXCEPTION 'No se puede eliminar un punto ya validado.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (
    public.can_manage_accion_full_as(v_accion_id, me)
    OR public.is_app_admin()
    OR public.is_business_admin()
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar este punto del checklist.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.accion_checkpoints
  WHERE id = p_checkpoint_id
    AND activo = true
    AND completado = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se elimino ningun punto del checklist.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.delete_accion_checkpoint(uuid) IS
  'Elimina un punto pendiente del checklist validando permisos completos sobre la accion.';

GRANT EXECUTE ON FUNCTION public.delete_accion_checkpoint(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
