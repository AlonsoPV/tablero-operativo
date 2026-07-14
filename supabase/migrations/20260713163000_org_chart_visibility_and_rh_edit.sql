-- =============================================================================
-- Organigrama: visibilidad total; edición de terceros solo RH
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RH = único rol de área que puede editar jerarquía de cualquiera
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_edit_any_org_hierarchy()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_belongs_to_area_name('RH');
$$;

COMMENT ON FUNCTION public.can_edit_any_org_hierarchy() IS
  'Solo usuarios del área RH pueden editar la jerarquía de otras personas.';

GRANT EXECUTE ON FUNCTION public.can_edit_any_org_hierarchy() TO authenticated;

-- -----------------------------------------------------------------------------
-- Listado completo del organigrama para cualquier autenticado
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.org_chart_list();

CREATE OR REPLACE FUNCTION public.org_chart_list()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  rol text,
  area text,
  areas text[],
  activo boolean,
  manager_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    u.nombre,
    u.rol::text,
    u.area,
    public.usuario_area_names(u.id),
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  ORDER BY u.nombre ASC;
END;
$$;

COMMENT ON FUNCTION public.org_chart_list() IS
  'Organigrama completo visible para cualquier usuario autenticado.';

GRANT EXECUTE ON FUNCTION public.org_chart_list() TO authenticated;

-- -----------------------------------------------------------------------------
-- Actualizar jefe: RH cualquiera | resto solo el propio
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settings_users_update_manager(
  p_user_id uuid,
  p_manager_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  rol text,
  area text,
  areas text[],
  activo boolean,
  manager_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_usuarios_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_my_usuarios_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF NOT public.can_edit_any_org_hierarchy()
    AND (v_my_usuarios_id IS NULL OR v_my_usuarios_id <> p_user_id)
  THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.usuarios u
  SET
    manager_user_id = p_manager_user_id,
    updated_at = now()
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    u.nombre,
    u.rol::text,
    u.area,
    public.usuario_area_names(u.id),
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  WHERE u.id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.settings_users_update_manager(uuid, uuid) IS
  'Actualiza jefe directo. RH cualquiera; el resto solo sobre sí mismo.';

GRANT EXECUTE ON FUNCTION public.settings_users_update_manager(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Direct reports: RH cualquiera | self con reglas previas
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settings_users_set_direct_reports(
  p_manager_id uuid,
  p_report_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  rol text,
  area text,
  areas text[],
  activo boolean,
  manager_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_usuarios_id uuid;
  v_is_rh boolean;
  v_report_ids uuid[] := COALESCE(p_report_ids, ARRAY[]::uuid[]);
  v_rid uuid;
BEGIN
  IF p_manager_id IS NULL THEN
    RAISE EXCEPTION 'Usuario invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_my_usuarios_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  v_is_rh := public.can_edit_any_org_hierarchy();

  IF NOT v_is_rh
    AND (v_my_usuarios_id IS NULL OR v_my_usuarios_id <> p_manager_id)
  THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_manager_id = ANY (v_report_ids) THEN
    RAISE EXCEPTION 'Un usuario no puede reportarse a sí mismo' USING ERRCODE = '23514';
  END IF;

  -- Liberar reportes actuales del manager (solo los que dejan de estarlo)
  IF v_is_rh THEN
    UPDATE public.usuarios u
    SET manager_user_id = NULL, updated_at = now()
    WHERE u.manager_user_id = p_manager_id
      AND NOT (u.id = ANY (v_report_ids));
  ELSE
    -- Self: solo quitar los que ya me reportaban y salen del set
    UPDATE public.usuarios u
    SET manager_user_id = NULL, updated_at = now()
    WHERE u.manager_user_id = p_manager_id
      AND NOT (u.id = ANY (v_report_ids));
  END IF;

  FOREACH v_rid IN ARRAY v_report_ids
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.usuarios u2
      WHERE u2.id = v_rid AND u2.manager_user_id = p_manager_id
    ) THEN
      CONTINUE;
    END IF;

    IF v_is_rh THEN
      UPDATE public.usuarios u
      SET manager_user_id = p_manager_id, updated_at = now()
      WHERE u.id = v_rid
        AND u.manager_user_id IS DISTINCT FROM p_manager_id;
    ELSE
      -- Self: solo sin líder o ya reportando a mí
      IF EXISTS (
        SELECT 1 FROM public.usuarios u2
        WHERE u2.id = v_rid AND u2.manager_user_id IS NULL
      ) THEN
        UPDATE public.usuarios u
        SET manager_user_id = p_manager_id, updated_at = now()
        WHERE u.id = v_rid;
      ELSE
        RAISE EXCEPTION 'No autorizado a tomar reportes con otro lider' USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    u.nombre,
    u.rol::text,
    u.area,
    public.usuario_area_names(u.id),
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  WHERE u.manager_user_id = p_manager_id
  ORDER BY u.nombre ASC;
END;
$$;

COMMENT ON FUNCTION public.settings_users_set_direct_reports(uuid, uuid[]) IS
  'Asigna reportes. RH cualquiera; el resto solo sobre sí mismo (sin lider / ya reportan).';

GRANT EXECUTE ON FUNCTION public.settings_users_set_direct_reports(uuid, uuid[]) TO authenticated;
