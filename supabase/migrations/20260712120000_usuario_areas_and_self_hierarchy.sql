-- =============================================================================
-- Multi-área (principal + adicionales) y jerarquía editable desde perfil.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo: asegurar área RH
-- -----------------------------------------------------------------------------

INSERT INTO public.areas (nombre, descripcion, activo)
SELECT 'RH', 'Recursos Humanos: altas, organigrama y administración de personas.', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.areas a
  WHERE lower(trim(a.nombre)) = 'rh'
);

-- -----------------------------------------------------------------------------
-- Tabla usuario_areas
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usuario_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, area_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_areas_one_primary
  ON public.usuario_areas (user_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_usuario_areas_user_id ON public.usuario_areas (user_id);
CREATE INDEX IF NOT EXISTS idx_usuario_areas_area_id ON public.usuario_areas (area_id);

COMMENT ON TABLE public.usuario_areas IS
  'Membresías de área por usuario. is_primary sincroniza usuarios.area.';

-- -----------------------------------------------------------------------------
-- Helpers: áreas y permiso de organigrama (antes de RLS que los usa)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.usuario_area_names(p_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT array_agg(a.nombre ORDER BY ua.is_primary DESC, a.nombre ASC)
      FROM public.usuario_areas ua
      INNER JOIN public.areas a ON a.id = ua.area_id
      WHERE ua.user_id = p_user_id
    ),
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = p_user_id AND u.area IS NOT NULL AND trim(u.area) <> ''
      )
      THEN ARRAY[(SELECT u.area FROM public.usuarios u WHERE u.id = p_user_id)]
      ELSE ARRAY[]::text[]
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_area_name(p_area_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.user_id = auth.uid()
      AND u.activo = true
      AND (
        public.normalize_business_role(u.area) = public.normalize_business_role(p_area_name)
        OR EXISTS (
          SELECT 1
          FROM public.usuario_areas ua
          INNER JOIN public.areas a ON a.id = ua.area_id
          WHERE ua.user_id = u.id
            AND public.normalize_business_role(a.nombre) = public.normalize_business_role(p_area_name)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org_hierarchy()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_catalogs()
    OR public.has_business_role('Direccion')
    OR public.user_belongs_to_area_name('RH');
$$;

COMMENT ON FUNCTION public.can_manage_org_hierarchy() IS
  'Admin/catálogos, Dirección o área RH pueden editar organigrama de cualquiera.';

ALTER TABLE public.usuario_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuario_areas_select ON public.usuario_areas;
CREATE POLICY usuario_areas_select ON public.usuario_areas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = usuario_areas.user_id
        AND (u.user_id = auth.uid() OR public.can_manage_catalogs())
    )
    OR public.can_manage_org_hierarchy()
  );

-- Escritura solo vía SECURITY DEFINER RPCs.

-- Backfill desde usuarios.area
INSERT INTO public.usuario_areas (user_id, area_id, is_primary)
SELECT u.id, a.id, true
FROM public.usuarios u
INNER JOIN public.areas a ON lower(trim(a.nombre)) = lower(trim(u.area))
WHERE u.area IS NOT NULL
  AND trim(u.area) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.usuario_areas ua
    WHERE ua.user_id = u.id AND ua.area_id = a.id
  );

-- Sync usuarios.area cuando cambia primary
CREATE OR REPLACE FUNCTION public.sync_usuario_primary_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(NEW.user_id, OLD.user_id);
  v_primary_name text;
BEGIN
  SELECT a.nombre
  INTO v_primary_name
  FROM public.usuario_areas ua
  INNER JOIN public.areas a ON a.id = ua.area_id
  WHERE ua.user_id = v_user_id
    AND ua.is_primary = true
  LIMIT 1;

  UPDATE public.usuarios u
  SET
    area = v_primary_name,
    updated_at = now()
  WHERE u.id = v_user_id
    AND u.area IS DISTINCT FROM v_primary_name;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_usuario_areas_sync_primary ON public.usuario_areas;
CREATE TRIGGER trg_usuario_areas_sync_primary
  AFTER INSERT OR UPDATE OR DELETE ON public.usuario_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_usuario_primary_area();
-- -----------------------------------------------------------------------------
-- RPC: set áreas (principal + adicionales)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settings_users_set_areas(
  p_user_id uuid,
  p_primary_area_id uuid,
  p_area_ids uuid[]
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
  v_all_ids uuid[];
  v_area_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_my_usuarios_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF NOT public.can_manage_org_hierarchy()
    AND (v_my_usuarios_id IS NULL OR v_my_usuarios_id <> p_user_id)
  THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_primary_area_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.areas a WHERE a.id = p_primary_area_id)
  THEN
    RAISE EXCEPTION 'Area principal invalida' USING ERRCODE = '22023';
  END IF;

  v_all_ids := COALESCE(p_area_ids, ARRAY[]::uuid[]);
  IF p_primary_area_id IS NOT NULL
    AND NOT (p_primary_area_id = ANY (v_all_ids))
  THEN
    v_all_ids := array_append(v_all_ids, p_primary_area_id);
  END IF;

  -- Validar IDs
  FOREACH v_area_id IN ARRAY v_all_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.areas a WHERE a.id = v_area_id) THEN
      RAISE EXCEPTION 'Area invalida' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.usuario_areas ua WHERE ua.user_id = p_user_id;

  IF cardinality(v_all_ids) > 0 THEN
    INSERT INTO public.usuario_areas (user_id, area_id, is_primary)
    SELECT DISTINCT
      p_user_id,
      aid,
      (aid = p_primary_area_id)
    FROM unnest(v_all_ids) AS aid;
  ELSE
    UPDATE public.usuarios u
    SET area = NULL, updated_at = now()
    WHERE u.id = p_user_id;
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

GRANT EXECUTE ON FUNCTION public.settings_users_set_areas(uuid, uuid, uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- Ampliar settings_users_update_manager (self + org managers)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.settings_users_update_manager(uuid, uuid);

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

  IF NOT public.can_manage_org_hierarchy()
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
  'Actualiza jefe directo. Org managers (admin/Direccion/RH) o el propio usuario.';

GRANT EXECUTE ON FUNCTION public.settings_users_update_manager(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- RPC: set direct reports
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
  v_is_global boolean;
  v_report_ids uuid[] := COALESCE(p_report_ids, ARRAY[]::uuid[]);
  v_rid uuid;
BEGIN
  IF p_manager_id IS NULL THEN
    RAISE EXCEPTION 'Manager invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_my_usuarios_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  v_is_global := public.can_manage_org_hierarchy();

  IF NOT v_is_global
    AND (v_my_usuarios_id IS NULL OR v_my_usuarios_id <> p_manager_id)
  THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_manager_id = ANY (v_report_ids) THEN
    RAISE EXCEPTION 'Un usuario no puede reportarse a sí mismo' USING ERRCODE = '23514';
  END IF;

  -- Quitar reportes actuales que ya no están en la lista
  IF v_is_global THEN
    UPDATE public.usuarios u
    SET manager_user_id = NULL, updated_at = now()
    WHERE u.manager_user_id = p_manager_id
      AND NOT (u.id = ANY (v_report_ids));
  ELSE
    UPDATE public.usuarios u
    SET manager_user_id = NULL, updated_at = now()
    WHERE u.manager_user_id = p_manager_id
      AND NOT (u.id = ANY (v_report_ids));
  END IF;

  -- Asignar nuevos reportes
  FOREACH v_rid IN ARRAY v_report_ids LOOP
    IF v_is_global THEN
      UPDATE public.usuarios u
      SET manager_user_id = p_manager_id, updated_at = now()
      WHERE u.id = v_rid
        AND u.manager_user_id IS DISTINCT FROM p_manager_id;
    ELSIF EXISTS (
      SELECT 1 FROM public.usuarios u2
      WHERE u2.id = v_rid AND u2.manager_user_id = p_manager_id
    ) THEN
      NULL; -- ya reporta
    ELSIF EXISTS (
      SELECT 1 FROM public.usuarios u2
      WHERE u2.id = v_rid AND u2.manager_user_id IS NULL
    ) THEN
      UPDATE public.usuarios u
      SET manager_user_id = p_manager_id, updated_at = now()
      WHERE u.id = v_rid;
    ELSE
      RAISE EXCEPTION 'No puedes asignar un reporte que ya tiene otro lider'
        USING ERRCODE = '42501';
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

GRANT EXECUTE ON FUNCTION public.settings_users_set_direct_reports(uuid, uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- Actualizar listados con areas[]
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
DECLARE
  v_my_id uuid;
BEGIN
  SELECT u.id INTO v_my_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF public.can_manage_org_hierarchy() THEN
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
    RETURN;
  END IF;

  IF v_my_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE
  ancestors AS (
    SELECT u.manager_user_id AS uid
    FROM public.usuarios u
    WHERE u.id = v_my_id AND u.manager_user_id IS NOT NULL
    UNION ALL
    SELECT u.manager_user_id
    FROM public.usuarios u
    INNER JOIN ancestors a ON u.id = a.uid
    WHERE u.manager_user_id IS NOT NULL
  ),
  descendants AS (
    SELECT u.id AS uid
    FROM public.usuarios u
    WHERE u.manager_user_id = v_my_id
    UNION ALL
    SELECT u.id
    FROM public.usuarios u
    INNER JOIN descendants d ON u.manager_user_id = d.uid
  ),
  visible AS (
    SELECT v_my_id AS uid
    UNION
    SELECT uid FROM ancestors WHERE uid IS NOT NULL
    UNION
    SELECT uid FROM descendants
  )
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
  WHERE u.id IN (SELECT uid FROM visible)
  ORDER BY u.nombre ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_chart_list() TO authenticated;

DROP FUNCTION IF EXISTS public.settings_users_list();

CREATE OR REPLACE FUNCTION public.settings_users_list()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
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
  IF NOT public.can_manage_catalogs() AND NOT public.can_manage_org_hierarchy() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    au.email::text,
    u.nombre,
    u.rol::text,
    u.area,
    public.usuario_area_names(u.id),
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  LEFT JOIN auth.users au ON au.id = u.user_id
  ORDER BY u.nombre ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settings_users_list() TO authenticated;

DROP FUNCTION IF EXISTS public.settings_users_get(uuid);

CREATE OR REPLACE FUNCTION public.settings_users_get(p_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
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
  IF NOT public.can_manage_catalogs() AND NOT public.can_manage_org_hierarchy() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    au.email::text,
    u.nombre,
    u.rol::text,
    u.area,
    public.usuario_area_names(u.id),
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  LEFT JOIN auth.users au ON au.id = u.user_id
  WHERE u.id = p_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settings_users_get(uuid) TO authenticated;

-- Peers para editar jerarquía desde perfil (cadena + candidatos sin líder)
DROP FUNCTION IF EXISTS public.settings_users_hierarchy_peers();

CREATE OR REPLACE FUNCTION public.settings_users_hierarchy_peers()
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
DECLARE
  v_my_id uuid;
BEGIN
  SELECT u.id INTO v_my_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF public.can_manage_org_hierarchy() THEN
    RETURN QUERY
    SELECT
      u.id, u.user_id, u.nombre, u.rol::text, u.area,
      public.usuario_area_names(u.id), u.activo, u.manager_user_id,
      u.created_at, u.updated_at
    FROM public.usuarios u
    ORDER BY u.nombre ASC;
    RETURN;
  END IF;

  IF v_my_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE
  ancestors AS (
    SELECT u.manager_user_id AS uid
    FROM public.usuarios u
    WHERE u.id = v_my_id AND u.manager_user_id IS NOT NULL
    UNION ALL
    SELECT u.manager_user_id
    FROM public.usuarios u
    INNER JOIN ancestors a ON u.id = a.uid
    WHERE u.manager_user_id IS NOT NULL
  ),
  descendants AS (
    SELECT u.id AS uid
    FROM public.usuarios u
    WHERE u.manager_user_id = v_my_id
    UNION ALL
    SELECT u.id
    FROM public.usuarios u
    INNER JOIN descendants d ON u.manager_user_id = d.uid
  ),
  visible AS (
    SELECT v_my_id AS uid
    UNION SELECT uid FROM ancestors WHERE uid IS NOT NULL
    UNION SELECT uid FROM descendants
    UNION
    SELECT u.id FROM public.usuarios u
    WHERE u.activo = true
      AND (u.manager_user_id IS NULL OR u.manager_user_id = v_my_id)
  )
  SELECT
    u.id, u.user_id, u.nombre, u.rol::text, u.area,
    public.usuario_area_names(u.id), u.activo, u.manager_user_id,
    u.created_at, u.updated_at
  FROM public.usuarios u
  WHERE u.id IN (SELECT uid FROM visible)
  ORDER BY u.nombre ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settings_users_hierarchy_peers() TO authenticated;

-- RLS update usuarios: org hierarchy managers también
DROP POLICY IF EXISTS usuarios_update_own_or_admin ON public.usuarios;

CREATE POLICY usuarios_update_own_or_admin ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_catalogs()
    OR public.can_manage_org_hierarchy()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.can_manage_catalogs()
    OR public.can_manage_org_hierarchy()
  );

-- Select para RH en listados de usuarios (además de catalogs)
DROP POLICY IF EXISTS usuarios_select_org_managers ON public.usuarios;
CREATE POLICY usuarios_select_org_managers ON public.usuarios
  FOR SELECT TO authenticated
  USING (public.can_manage_org_hierarchy());
