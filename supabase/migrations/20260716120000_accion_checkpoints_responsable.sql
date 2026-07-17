-- Responsable independiente por punto de checklist.
-- Permite que el responsable del check valide el punto aunque no sea responsable de la accion.

ALTER TABLE public.accion_checkpoints
  ADD COLUMN IF NOT EXISTS responsable_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accion_checkpoints_responsable_id
  ON public.accion_checkpoints(responsable_id)
  WHERE activo = true AND responsable_id IS NOT NULL;

COMMENT ON COLUMN public.accion_checkpoints.responsable_id IS
  'usuarios.id responsable especifico del punto de checklist; independiente del responsable de la accion.';

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
  is_checkpoint_responsable boolean;
BEGIN
  me := public.get_my_usuario_id();
  can_admin := public.is_app_admin() OR public.is_business_admin();

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN
      NEW.created_by := me;
    END IF;

    IF NEW.responsable_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.usuarios u
        WHERE u.id = NEW.responsable_id
          AND u.activo = true
      )
    THEN
      RAISE EXCEPTION 'El responsable del check no existe o esta inactivo.'
        USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
  END IF;

  SELECT a.created_by, a.responsable
  INTO action_creator, action_responsable
  FROM public.acciones_diarias a
  WHERE a.id = OLD.accion_id;

  IF can_admin OR (action_creator IS NOT NULL AND action_creator = me) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    IF NEW.responsable_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.usuarios u
        WHERE u.id = NEW.responsable_id
          AND u.activo = true
      )
    THEN
      RAISE EXCEPTION 'El responsable del check no existe o esta inactivo.'
        USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Solo la persona creadora de la accion puede eliminar puntos del checklist.';
  END IF;

  is_checkpoint_responsable := OLD.responsable_id IS NOT NULL AND OLD.responsable_id = me;

  IF action_responsable IS DISTINCT FROM me AND NOT is_checkpoint_responsable THEN
    RAISE EXCEPTION 'Solo la persona creadora de la accion, el responsable asignado o el responsable del check pueden actualizar este checklist.';
  END IF;

  IF NEW.accion_id IS DISTINCT FROM OLD.accion_id
    OR NEW.texto IS DISTINCT FROM OLD.texto
    OR NEW.orden IS DISTINCT FROM OLD.orden
    OR NEW.obligatorio IS DISTINCT FROM OLD.obligatorio
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.responsable_id IS DISTINCT FROM OLD.responsable_id
  THEN
    RAISE EXCEPTION 'Solo quien administra la accion puede editar la estructura o responsable del check.';
  END IF;

  IF NEW.completado IS NOT DISTINCT FROM OLD.completado
    AND (
      NEW.checked_at IS DISTINCT FROM OLD.checked_at
      OR NEW.checked_by IS DISTINCT FROM OLD.checked_by
    )
  THEN
    RAISE EXCEPTION 'Solo se puede actualizar auditoria al marcar o desmarcar puntos.';
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

CREATE OR REPLACE FUNCTION public.set_accion_checkpoint_completado(
  p_checkpoint_id uuid,
  p_completado boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  v_accion_id uuid;
  v_creator uuid;
  v_action_responsable uuid;
  v_checkpoint_responsable uuid;
  can_admin boolean;
BEGIN
  me := public.get_my_usuario_id();
  can_admin := public.is_app_admin() OR public.is_business_admin();

  SELECT c.accion_id, c.responsable_id, a.created_by, a.responsable
  INTO v_accion_id, v_checkpoint_responsable, v_creator, v_action_responsable
  FROM public.accion_checkpoints c
  JOIN public.acciones_diarias a ON a.id = c.accion_id
  WHERE c.id = p_checkpoint_id
    AND c.activo = true;

  IF v_accion_id IS NULL THEN
    RAISE EXCEPTION 'Punto de checklist no encontrado o inactivo.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    can_admin
    OR (v_creator IS NOT NULL AND v_creator = me)
    OR v_action_responsable = me
    OR v_checkpoint_responsable = me
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para marcar este punto del checklist.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accion_checkpoints
  SET
    completado = p_completado,
    checked_at = CASE WHEN p_completado THEN now() ELSE NULL END,
    checked_by = CASE WHEN p_completado THEN me ELSE NULL END
  WHERE id = p_checkpoint_id;
END;
$$;

COMMENT ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) IS
  'Marca/desmarca un punto del checklist validando creador, responsable de accion, responsable del check o admin.';

GRANT EXECUTE ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.add_accion_checkpoint(uuid, text, integer, boolean);

CREATE OR REPLACE FUNCTION public.add_accion_checkpoint(
  p_accion_id uuid,
  p_texto text,
  p_orden integer,
  p_obligatorio boolean DEFAULT true,
  p_responsable_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
BEGIN
  me := public.get_my_usuario_id();

  IF me IS NULL THEN
    RAISE EXCEPTION 'No autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_contribute_accion_checklist(p_accion_id) THEN
    RAISE EXCEPTION 'No tienes permiso para agregar puntos al checklist de esta accion.'
      USING ERRCODE = '42501';
  END IF;

  IF p_responsable_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = p_responsable_id
        AND u.activo = true
    )
  THEN
    RAISE EXCEPTION 'El responsable del check no existe o esta inactivo.'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.accion_checkpoints (
    accion_id,
    texto,
    orden,
    obligatorio,
    responsable_id,
    created_by,
    activo,
    completado
  )
  VALUES (
    p_accion_id,
    btrim(coalesce(p_texto, '')),
    coalesce(p_orden, 0),
    coalesce(p_obligatorio, true),
    p_responsable_id,
    me,
    true,
    false
  );
END;
$$;

COMMENT ON FUNCTION public.add_accion_checkpoint(uuid, text, integer, boolean, uuid) IS
  'Agrega un punto de checklist con responsable opcional y permisos de colaboracion.';

GRANT EXECUTE ON FUNCTION public.add_accion_checkpoint(uuid, text, integer, boolean, uuid) TO authenticated;
