-- =============================================================================
-- Organigrama: jerarquía de reporte (manager_user_id) en public.usuarios
-- =============================================================================

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS manager_user_id uuid NULL
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.usuarios.manager_user_id IS
  'Jefe directo (usuarios.id). NULL = sin responsable superior. Usado por organigrama y escalamientos futuros.';

CREATE INDEX IF NOT EXISTS idx_usuarios_manager_user_id
  ON public.usuarios (manager_user_id);

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_manager_not_self;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_manager_not_self
  CHECK (manager_user_id IS NULL OR manager_user_id <> id);

-- -----------------------------------------------------------------------------
-- Validación de ciclos jerárquicos
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.would_create_hierarchy_cycle(
  p_user_id uuid,
  p_manager_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT p_manager_user_id AS current_id
    UNION ALL
    SELECT u.manager_user_id
    FROM public.usuarios u
    INNER JOIN chain c ON u.id = c.current_id
    WHERE u.manager_user_id IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1
    FROM chain
    WHERE current_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.would_create_hierarchy_cycle(uuid, uuid) IS
  'true si asignar p_manager_user_id como jefe de p_user_id cerraría un ciclo.';

CREATE OR REPLACE FUNCTION public.assert_valid_usuario_manager()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.manager_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.manager_user_id = NEW.id THEN
    RAISE EXCEPTION 'Un usuario no puede reportarse a sí mismo'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios m
    WHERE m.id = NEW.manager_user_id
  ) THEN
    RAISE EXCEPTION 'El jefe directo seleccionado no existe'
      USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios m
      WHERE m.id = NEW.manager_user_id
        AND m.activo = true
    ) THEN
      RAISE EXCEPTION 'El jefe directo debe estar activo'
        USING ERRCODE = '23514';
    END IF;

    IF public.would_create_hierarchy_cycle(NEW.id, NEW.manager_user_id) THEN
      RAISE EXCEPTION 'La jerarquía generaría un ciclo'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_validate_manager ON public.usuarios;

CREATE TRIGGER trg_usuarios_validate_manager
  BEFORE INSERT OR UPDATE OF manager_user_id
  ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_valid_usuario_manager();

-- -----------------------------------------------------------------------------
-- Listado de organigrama con visibilidad por rol
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.org_chart_list();

CREATE OR REPLACE FUNCTION public.org_chart_list()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  rol text,
  area text,
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
  SELECT u.id
  INTO v_my_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF public.can_manage_catalogs() THEN
    RETURN QUERY
    SELECT
      u.id,
      u.user_id,
      u.nombre,
      u.rol::text,
      u.area,
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
    WHERE u.id = v_my_id
      AND u.manager_user_id IS NOT NULL
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
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  WHERE u.id IN (SELECT uid FROM visible)
  ORDER BY u.nombre ASC;
END;
$$;

COMMENT ON FUNCTION public.org_chart_list() IS
  'Usuarios visibles en organigrama: admins ven todos; resto ve cadena de mando y equipo.';

GRANT EXECUTE ON FUNCTION public.org_chart_list() TO authenticated;

-- -----------------------------------------------------------------------------
-- Cadena de mando ascendente (para escalamientos futuros)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.org_chart_command_chain(uuid);

CREATE OR REPLACE FUNCTION public.org_chart_command_chain(p_user_id uuid)
RETURNS TABLE (
  nivel int,
  id uuid,
  nombre text,
  rol text,
  area text,
  activo boolean,
  manager_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_my_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT u.id INTO v_my_id FROM public.usuarios u WHERE u.user_id = auth.uid() LIMIT 1;

  IF NOT public.can_manage_catalogs()
    AND v_my_id IS NOT NULL
    AND p_user_id <> v_my_id
    AND NOT EXISTS (
      WITH RECURSIVE descendants AS (
        SELECT u.id FROM public.usuarios u WHERE u.manager_user_id = v_my_id
        UNION ALL
        SELECT u.id FROM public.usuarios u
        INNER JOIN descendants d ON u.manager_user_id = d.id
      )
      SELECT 1 FROM descendants WHERE id = p_user_id
    )
    AND NOT EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT u.manager_user_id AS uid FROM public.usuarios u WHERE u.id = v_my_id AND u.manager_user_id IS NOT NULL
        UNION ALL
        SELECT u.manager_user_id FROM public.usuarios u
        INNER JOIN ancestors a ON u.id = a.uid WHERE u.manager_user_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE uid = p_user_id
    )
  THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH RECURSIVE chain AS (
    SELECT
      0 AS nivel,
      u.id,
      u.nombre,
      u.rol::text AS rol,
      u.area,
      u.activo,
      u.manager_user_id
    FROM public.usuarios u
    WHERE u.id = p_user_id
    UNION ALL
    SELECT
      c.nivel + 1,
      m.id,
      m.nombre,
      m.rol::text,
      m.area,
      m.activo,
      m.manager_user_id
    FROM public.usuarios m
    INNER JOIN chain c ON m.id = c.manager_user_id
    WHERE c.manager_user_id IS NOT NULL
      AND c.nivel < 32
  )
  SELECT
    chain.nivel,
    chain.id,
    chain.nombre,
    chain.rol,
    chain.area,
    chain.activo,
    chain.manager_user_id
  FROM chain
  ORDER BY chain.nivel ASC;
END;
$$;

COMMENT ON FUNCTION public.org_chart_command_chain(uuid) IS
  'Cadena de mando desde p_user_id hacia arriba (nivel 0 = usuario, 1 = jefe directo, ...).';

GRANT EXECUTE ON FUNCTION public.org_chart_command_chain(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Actualizar RPCs de administración de usuarios
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.settings_users_list();

CREATE OR REPLACE FUNCTION public.settings_users_list()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  nombre text,
  rol text,
  area text,
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
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    au.email::text,
    u.nombre,
    u.rol::text,
    u.area,
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
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    au.email::text,
    u.nombre,
    u.rol::text,
    u.area,
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
