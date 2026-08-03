-- Permite que el perfil/catalogo Kanban edite campos generales de acciones.
-- No le otorga verificacion: Verificado sigue limitado a creador/asignador,
-- Direccion o super_admin mediante can_manage_accion_full_as.

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
  )
  OR (
    to_regclass('public.usuario_catalog_roles') IS NOT NULL
    AND to_regclass('public.catalog_roles') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.usuario_catalog_roles ucr ON ucr.user_id = u.id
      JOIN public.catalog_roles cr ON cr.id = ucr.role_id
      WHERE u.id = p_usuario_id
        AND u.activo = true
        AND cr.activo = true
        AND (
          public.normalize_business_role(COALESCE(cr.system_key, '')) IN (
            'kanban',
            'editor_kanban',
            'kanban_editor'
          )
          OR public.normalize_business_role(cr.nombre) IN (
            'kanban',
            'editor_kanban',
            'kanban_editor'
          )
        )
    )
  );
$$;

COMMENT ON FUNCTION public.has_kanban_action_editor_role(uuid) IS
  'Reconoce perfiles Kanban configurables que pueden editar campos generales de acciones.';

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
        public.can_manage_accion_full_as(p_accion_id, p_usuario_id)
        OR public.has_kanban_action_editor_role(p_usuario_id)
      )
  );
$$;

COMMENT ON FUNCTION public.can_edit_accion_general_as(uuid, uuid) IS
  'Permite editar campos generales: creador/asignador, Direccion, super_admin o perfil Kanban.';

CREATE OR REPLACE FUNCTION public.can_edit_accion_general(p_accion_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.can_edit_accion_general_as(p_accion_id, public.get_my_usuario_id());
$$;

COMMENT ON FUNCTION public.can_edit_accion_general(uuid) IS
  'Permiso del usuario autenticado para editar campos generales de una accion.';

REVOKE ALL ON FUNCTION public.has_kanban_action_editor_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_accion_general_as(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_accion_general(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_kanban_action_editor_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_accion_general_as(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_accion_general(uuid) TO authenticated;

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
  can_general_edit boolean;
  can_close_hecho boolean;
BEGIN
  me := public.get_my_usuario_id();
  is_server_role := auth.role() = 'service_role';
  can_full_manage := is_server_role OR public.can_manage_accion_full_as(NEW.id, me);
  can_general_edit := is_server_role OR public.can_edit_accion_general_as(NEW.id, me);
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
    IF NOT can_general_edit AND (
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
      RAISE EXCEPTION 'Solo quien asigno la accion, perfil Kanban, Direccion o super_admin pueden editar esta accion.'
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
  'Hecho: creador/responsable/admin operativo o checklist completo. Edicion general: creador-asignador, perfil Kanban, super_admin o Direccion. Verificado: creador-asignador, super_admin o Direccion.';

NOTIFY pgrst, 'reload schema';
