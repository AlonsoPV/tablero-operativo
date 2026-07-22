-- Checks de seguimiento: el responsable del check debe pertenecer al area
-- de la accion cuando la accion tiene area definida.

CREATE OR REPLACE FUNCTION public.accion_checkpoint_responsable_belongs_to_accion_area(
  p_accion_id uuid,
  p_responsable_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accion AS (
    SELECT id, nullif(btrim(area::text), '') AS area_nombre
    FROM public.acciones_diarias
    WHERE id = p_accion_id
    LIMIT 1
  ),
  responsable AS (
    SELECT id, nullif(btrim(area::text), '') AS area_nombre
    FROM public.usuarios
    WHERE id = p_responsable_id
      AND activo = true
    LIMIT 1
  )
  SELECT EXISTS (SELECT 1 FROM accion)
    AND EXISTS (SELECT 1 FROM responsable)
    AND (
      (SELECT area_nombre FROM accion) IS NULL
      OR public.normalize_business_role((SELECT area_nombre FROM responsable)) =
         public.normalize_business_role((SELECT area_nombre FROM accion))
      OR EXISTS (
        SELECT 1
        FROM public.usuario_areas ua
        JOIN public.areas ar ON ar.id = ua.area_id
        JOIN responsable r ON r.id = ua.user_id
        WHERE public.normalize_business_role(ar.nombre) =
              public.normalize_business_role((SELECT area_nombre FROM accion))
      )
    );
$$;

REVOKE ALL ON FUNCTION public.accion_checkpoint_responsable_belongs_to_accion_area(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accion_checkpoint_responsable_belongs_to_accion_area(uuid, uuid) TO authenticated;

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
  target_accion_id uuid;
BEGIN
  me := public.get_my_usuario_id();
  can_admin := public.is_app_admin() OR public.is_business_admin();

  IF TG_OP = 'INSERT' THEN
    target_accion_id := NEW.accion_id;

    IF NEW.created_by IS NULL THEN
      NEW.created_by := me;
    END IF;

    IF NEW.responsable_id IS NOT NULL
      AND NOT public.accion_checkpoint_responsable_belongs_to_accion_area(NEW.accion_id, NEW.responsable_id)
    THEN
      RAISE EXCEPTION 'El responsable del check no pertenece al area de la accion o esta inactivo.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  target_accion_id := OLD.accion_id;

  SELECT a.created_by, a.responsable
  INTO action_creator, action_responsable
  FROM public.acciones_diarias a
  WHERE a.id = OLD.accion_id;

  IF can_admin OR (action_creator IS NOT NULL AND action_creator = me) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    IF NEW.responsable_id IS NOT NULL
      AND NOT public.accion_checkpoint_responsable_belongs_to_accion_area(target_accion_id, NEW.responsable_id)
    THEN
      RAISE EXCEPTION 'El responsable del check no pertenece al area de la accion o esta inactivo.'
        USING ERRCODE = '42501';
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
    AND NOT public.accion_checkpoint_responsable_belongs_to_accion_area(p_accion_id, p_responsable_id)
  THEN
    RAISE EXCEPTION 'El responsable del check no pertenece al area de la accion o esta inactivo.'
      USING ERRCODE = '42501';
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

COMMENT ON FUNCTION public.accion_checkpoint_responsable_belongs_to_accion_area(uuid, uuid) IS
  'Valida que el responsable de un check sea usuario activo y pertenezca al area de la accion, usando usuarios.area o usuario_areas.';

NOTIFY pgrst, 'reload schema';
