-- Restaura y blinda el cierre automatico a Hecho cuando todos los checks
-- activos de una accion quedan completados.

CREATE OR REPLACE FUNCTION public.can_auto_close_accion_from_completed_checklist_as(
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
      AND a.estado IS DISTINCT FROM 'Verificado'::action_status
      AND NOT EXISTS (
        SELECT 1
        FROM public.accion_checkpoints pending
        WHERE pending.accion_id = a.id
          AND pending.activo = true
          AND pending.completado = false
      )
      AND EXISTS (
        SELECT 1
        FROM public.accion_checkpoints c
        WHERE c.accion_id = a.id
          AND c.activo = true
          AND (
            c.checked_by = p_usuario_id
            OR c.responsable_id = p_usuario_id
          )
      )
  );
$$;

COMMENT ON FUNCTION public.can_auto_close_accion_from_completed_checklist_as(uuid, uuid) IS
  'Permite cierre automatico a Hecho cuando todos los checks activos estan completos y el usuario valido o era responsable de un check.';

REVOKE ALL ON FUNCTION public.can_auto_close_accion_from_completed_checklist_as(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_auto_close_accion_from_completed_checklist_as(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.acciones_diarias_guard_estado_permissions_and_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  is_server_role boolean;
  can_full_manage boolean;
  can_close_hecho boolean;
BEGIN
  me := public.get_my_usuario_id();
  is_server_role := auth.role() = 'service_role';
  can_full_manage := is_server_role OR public.can_manage_accion_full_as(NEW.id, me);
  can_close_hecho :=
    is_server_role
    OR can_full_manage
    OR public.can_close_accion_as(NEW.id, me)
    OR public.can_auto_close_accion_from_completed_checklist_as(NEW.id, me);

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'Hecho'::action_status THEN
      IF NOT can_close_hecho THEN
        RAISE EXCEPTION 'Solo la persona creadora de la accion o el responsable asignado pueden marcar esta accion como Hecha.';
      END IF;
      NEW.completed_at := COALESCE(NEW.completed_at, now());
      NEW.completed_by := COALESCE(NEW.completed_by, me);
    ELSIF NEW.estado = 'Verificado'::action_status THEN
      IF NOT can_full_manage THEN
        RAISE EXCEPTION 'Solo quien asigno la accion, Direccion o super_admin pueden marcarla como Verificada.';
      END IF;
      NEW.verified_at := COALESCE(NEW.verified_at, now());
      NEW.verified_by := COALESCE(NEW.verified_by, me);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT can_full_manage AND (
      NEW.fecha IS DISTINCT FROM OLD.fecha
      OR NEW.titulo_accion IS DISTINCT FROM OLD.titulo_accion
      OR NEW.descripcion_accion IS DISTINCT FROM OLD.descripcion_accion
      OR NEW.responsable IS DISTINCT FROM OLD.responsable
      OR NEW.hora_limite IS DISTINCT FROM OLD.hora_limite
      OR NEW.evidencia_esperada IS DISTINCT FROM OLD.evidencia_esperada
      OR NEW.kpi_afectado IS DISTINCT FROM OLD.kpi_afectado
      OR NEW.gap_id IS DISTINCT FROM OLD.gap_id
      OR NEW.tipo_accion IS DISTINCT FROM OLD.tipo_accion
      OR NEW.story_points IS DISTINCT FROM OLD.story_points
      OR NEW.catalog_kpi_id IS DISTINCT FROM OLD.catalog_kpi_id
      OR NEW.okr_impactado IS DISTINCT FROM OLD.okr_impactado
      OR NEW.proceso IS DISTINCT FROM OLD.proceso
      OR NEW.area IS DISTINCT FROM OLD.area
      OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
      OR NEW.prioridad IS DISTINCT FROM OLD.prioridad
      OR NEW.prioridad_id IS DISTINCT FROM OLD.prioridad_id
      OR NEW.causa_raiz IS DISTINCT FROM OLD.causa_raiz
      OR NEW.responsable_bloqueo IS DISTINCT FROM OLD.responsable_bloqueo
      OR NEW.escalado IS DISTINCT FROM OLD.escalado
      OR NEW.fecha_escalamiento IS DISTINCT FROM OLD.fecha_escalamiento
      OR NEW.notas_escalamiento IS DISTINCT FROM OLD.notas_escalamiento
      OR NEW.repeticion IS DISTINCT FROM OLD.repeticion
      OR NEW.verificador_dato IS DISTINCT FROM OLD.verificador_dato
      OR NEW.verificador_gobierno IS DISTINCT FROM OLD.verificador_gobierno
      OR NEW.sprint_id IS DISTINCT FROM OLD.sprint_id
    ) THEN
      RAISE EXCEPTION 'Solo quien asigno la accion, Direccion o super_admin pueden editar esta accion.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      IF NEW.estado = 'Hecho'::action_status AND NOT can_close_hecho THEN
        RAISE EXCEPTION 'Solo la persona creadora de la accion, el responsable asignado o el validador del ultimo check pueden marcar esta accion como Hecha.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.estado = 'Verificado'::action_status AND NOT can_full_manage THEN
        RAISE EXCEPTION 'Solo quien asigno la accion, Direccion o super_admin pueden marcarla como Verificada.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.estado = 'Hecho'::action_status AND OLD.estado IS DISTINCT FROM 'Hecho'::action_status THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
        NEW.completed_by := COALESCE(NEW.completed_by, me);
      END IF;

      IF NEW.estado = 'Verificado'::action_status AND OLD.estado IS DISTINCT FROM 'Verificado'::action_status THEN
        NEW.verified_at := COALESCE(NEW.verified_at, now());
        NEW.verified_by := COALESCE(NEW.verified_by, me);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.acciones_diarias_guard_estado_permissions_and_audit() IS
  'Hecho: creador/responsable/admin operativo o cierre automatico por checklist completo. Verificado y edicion completa: creador-asignador, super_admin o Direccion.';

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
  can_update boolean;
  can_auto_close boolean;
BEGIN
  me := public.get_my_usuario_id();

  IF me IS NULL THEN
    RAISE EXCEPTION 'No autorizado.'
      USING ERRCODE = '42501';
  END IF;

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

  can_update :=
    public.can_manage_accion_full_as(v_accion_id, me)
    OR public.can_contribute_accion_checklist(v_accion_id)
    OR (v_creator IS NOT NULL AND v_creator = me)
    OR v_action_responsable = me
    OR v_checkpoint_responsable = me
    OR public.is_app_admin()
    OR public.is_business_admin();

  IF NOT can_update THEN
    RAISE EXCEPTION 'No tienes permiso para marcar este punto del checklist.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accion_checkpoints
  SET
    completado = p_completado,
    checked_at = CASE WHEN p_completado THEN now() ELSE NULL END,
    checked_by = CASE WHEN p_completado THEN me ELSE NULL END
  WHERE id = p_checkpoint_id
    AND activo = true;

  IF p_completado THEN
    SELECT NOT EXISTS (
      SELECT 1
      FROM public.accion_checkpoints pending
      WHERE pending.accion_id = v_accion_id
        AND pending.activo = true
        AND pending.completado = false
    )
    INTO can_auto_close;

    IF can_auto_close THEN
      UPDATE public.acciones_diarias
      SET
        estado = 'Hecho'::action_status,
        completed_at = COALESCE(completed_at, now()),
        completed_by = COALESCE(completed_by, me),
        updated_by = me
      WHERE id = v_accion_id
        AND estado NOT IN ('Hecho'::action_status, 'Verificado'::action_status);
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) IS
  'Marca/desmarca un punto validando permisos y pasa la accion a Hecho automaticamente cuando todos los checks activos quedan completos.';

REVOKE ALL ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
