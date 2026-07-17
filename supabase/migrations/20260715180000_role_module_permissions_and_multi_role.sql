-- Roles configurables: permisos por modulo y usuarios con multiples roles.

ALTER TABLE public.catalog_roles
  ADD COLUMN IF NOT EXISTS system_key text;

UPDATE public.catalog_roles
SET system_key = lower(regexp_replace(btrim(nombre), '[^a-zA-Z0-9]+', '_', 'g'))
WHERE system_key IS NULL;

CREATE TABLE IF NOT EXISTS public.app_modules (
  key text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  route text NOT NULL,
  section text NOT NULL DEFAULT 'operacion',
  sort_order integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalog_role_modules (
  role_id uuid NOT NULL REFERENCES public.catalog_roles(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.app_modules(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.usuario_catalog_roles (
  user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.catalog_roles(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_catalog_roles_one_primary
  ON public.usuario_catalog_roles(user_id)
  WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_usuario_catalog_roles_role
  ON public.usuario_catalog_roles(role_id);

INSERT INTO public.app_modules (key, nombre, descripcion, route, section, sort_order)
VALUES
  ('dashboard', 'Dashboard', 'Indicadores y resumen operativo.', '/dashboard', 'operacion', 10),
  ('kanban', 'Kanban', 'Kanban Corporativo.', '/kanban', 'operacion', 20),
  ('team_kanban', 'Kanban por Equipos', 'Administracion de equipos por area.', '/kanban-equipos', 'operacion', 30),
  ('tickets', 'Tickets', 'Solicitudes y soporte.', '/tickets', 'operacion', 40),
  ('org_chart', 'Organigrama', 'Jerarquia organizacional.', '/organigrama', 'operacion', 50),
  ('discipline', 'Disciplina', 'Disciplina y gamificacion.', '/disciplina', 'operacion', 60),
  ('calendar', 'Calendario', 'Calendario operativo.', '/calendario', 'operacion', 70),
  ('notifications', 'Notificaciones', 'Centro de notificaciones.', '/notificaciones', 'operacion', 80),
  ('academy', 'Academia O2C', 'Modulos de aprendizaje.', '/academia', 'conocimiento', 90),
  ('manual', 'Manual', 'Manual operativo y gamificacion.', '/manual', 'conocimiento', 100),
  ('ai_assist', 'IA O2C', 'Asistente de inteligencia artificial.', '/asistente-ia', 'conocimiento', 110),
  ('sprints', 'Sprint Center', 'Gestion de sprints.', '/sprints', 'gestion', 120),
  ('reports', 'Reportes', 'Reportes operativos.', '/reportes', 'gestion', 130),
  ('strategy', 'Alineacion estrategica', 'Mapa estrategico.', '/estrategia', 'estrategia', 140),
  ('kpis', 'KPIs O2C', 'Indicadores O2C.', '/dashboard/kpis', 'estrategia', 150),
  ('gaps', 'Gaps O2C', 'Brechas O2C.', '/dashboard/gaps', 'estrategia', 160),
  ('impact', 'Matriz de Impacto', 'Matriz de impacto.', '/dashboard/impacto', 'estrategia', 170),
  ('settings_profile', 'Mi perfil', 'Configuracion del perfil propio.', '/settings/profile', 'configuracion', 180),
  ('settings_users', 'Usuarios', 'Administracion de usuarios.', '/settings/users', 'configuracion', 190),
  ('settings_catalogs', 'Catalogos', 'Administracion de catalogos.', '/settings/catalogs', 'configuracion', 200),
  ('settings_reminders', 'Recordatorios', 'Configuracion de recordatorios.', '/settings/reminders', 'configuracion', 210),
  ('settings_academy', 'Administrar Academia', 'Configuracion de Academia.', '/settings/academy/modules', 'configuracion', 220)
ON CONFLICT (key) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    route = EXCLUDED.route,
    section = EXCLUDED.section,
    sort_order = EXCLUDED.sort_order;

-- Backfill de rol principal conservando usuarios.rol durante la transicion.
INSERT INTO public.usuario_catalog_roles (user_id, role_id, is_primary)
SELECT u.id, cr.id, true
FROM public.usuarios u
JOIN LATERAL (
  SELECT r.id
  FROM public.catalog_roles r
  WHERE public.normalize_business_role(r.nombre) = public.normalize_business_role(u.rol::text)
  ORDER BY r.activo DESC, r.created_at
  LIMIT 1
) cr ON true
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

-- Valores iniciales compatibles con el acceso anterior.
INSERT INTO public.catalog_role_modules (role_id, module_key)
SELECT cr.id, m.key
FROM public.catalog_roles cr
CROSS JOIN public.app_modules m
WHERE cr.activo
  AND (
    public.normalize_business_role(cr.nombre) = 'super_admin'
    OR (
      public.normalize_business_role(cr.nombre) NOT IN ('operativo', 'analista', 'direccion')
      AND m.key <> 'team_kanban'
    )
    OR (
      public.normalize_business_role(cr.nombre) = 'direccion'
      AND m.key IN (
        'dashboard','kanban','tickets','org_chart','discipline','calendar','notifications',
        'academy','manual','ai_assist','settings_profile','settings_users','settings_catalogs',
        'settings_reminders','settings_academy'
      )
    )
    OR (
      public.normalize_business_role(cr.nombre) = 'operativo'
      AND m.key IN (
        'kanban','tickets','org_chart','discipline','calendar','notifications',
        'academy','manual','ai_assist','settings_profile'
      )
    )
    OR (
      public.normalize_business_role(cr.nombre) = 'analista'
      AND m.key IN ('kanban','org_chart','ai_assist')
    )
  )
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_manage_role_permissions()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      public.is_super_admin()
      OR public.has_business_role('super_admin')
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_role_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_role_permissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.catalog_role_save(
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_activo boolean,
  p_module_keys text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_old_name text;
  v_system_key text;
  v_result jsonb;
BEGIN
  IF NOT public.can_manage_role_permissions() THEN
    RAISE EXCEPTION 'Solo Super Admin puede administrar roles y permisos'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(btrim(COALESCE(p_nombre, ''))) < 2 THEN
    RAISE EXCEPTION 'El nombre del rol debe tener al menos 2 caracteres'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_roles cr
    WHERE public.normalize_business_role(cr.nombre) = public.normalize_business_role(p_nombre)
      AND cr.id IS DISTINCT FROM p_id
  ) THEN
    RAISE EXCEPTION 'Ya existe un rol con ese nombre' USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.catalog_roles (nombre, descripcion, activo, system_key)
    VALUES (
      btrim(p_nombre),
      NULLIF(btrim(COALESCE(p_descripcion, '')), ''),
      COALESCE(p_activo, true),
      'custom_' || replace(gen_random_uuid()::text, '-', '')
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT nombre, system_key INTO v_old_name, v_system_key
    FROM public.catalog_roles
    WHERE id = p_id
    FOR UPDATE;

    IF v_old_name IS NULL THEN
      RAISE EXCEPTION 'Rol no encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF v_system_key = 'super_admin' AND btrim(p_nombre) IS DISTINCT FROM v_old_name THEN
      RAISE EXCEPTION 'El nombre tecnico super_admin no se puede cambiar'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.catalog_roles
    SET nombre = btrim(p_nombre),
        descripcion = NULLIF(btrim(COALESCE(p_descripcion, '')), ''),
        activo = COALESCE(p_activo, activo),
        updated_at = now()
    WHERE id = p_id;
    v_id := p_id;

    UPDATE public.usuarios
    SET rol = btrim(p_nombre), updated_at = now()
    WHERE public.normalize_business_role(rol::text) = public.normalize_business_role(v_old_name);
  END IF;

  IF p_module_keys IS NOT NULL THEN
    DELETE FROM public.catalog_role_modules WHERE role_id = v_id;
    INSERT INTO public.catalog_role_modules (role_id, module_key)
    SELECT v_id, m.key
    FROM public.app_modules m
    WHERE m.activo AND m.key = ANY(COALESCE(p_module_keys, ARRAY[]::text[]))
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_system_key = 'super_admin' THEN
    INSERT INTO public.catalog_role_modules (role_id, module_key)
    SELECT v_id, m.key FROM public.app_modules m WHERE m.activo
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT to_jsonb(cr) || jsonb_build_object(
    'module_keys', COALESCE((
      SELECT jsonb_agg(rm.module_key ORDER BY m.sort_order)
      FROM public.catalog_role_modules rm
      JOIN public.app_modules m ON m.key = rm.module_key
      WHERE rm.role_id = cr.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.catalog_roles cr
  WHERE cr.id = v_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_role_save(uuid,text,text,boolean,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_role_save(uuid,text,text,boolean,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.settings_users_set_roles(
  p_user_id uuid,
  p_role_ids uuid[],
  p_primary_role_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_ids uuid[];
  v_primary_name text;
BEGIN
  IF NOT public.can_manage_role_permissions() THEN
    RAISE EXCEPTION 'Solo Super Admin puede asignar multiples roles'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT cr.id), ARRAY[]::uuid[])
  INTO v_role_ids
  FROM public.catalog_roles cr
  WHERE cr.activo
    AND cr.id = ANY(COALESCE(p_role_ids, ARRAY[]::uuid[]));

  IF cardinality(v_role_ids) = 0 OR NOT (p_primary_role_id = ANY(v_role_ids)) THEN
    RAISE EXCEPTION 'Selecciona al menos un rol y define uno como principal'
      USING ERRCODE = '22023';
  END IF;

  SELECT nombre INTO v_primary_name
  FROM public.catalog_roles
  WHERE id = p_primary_role_id AND activo;
  IF v_primary_name IS NULL THEN
    RAISE EXCEPTION 'Rol principal invalido' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.usuario_catalog_roles WHERE user_id = p_user_id;
  INSERT INTO public.usuario_catalog_roles (user_id, role_id, is_primary, created_by)
  SELECT p_user_id, role_id, role_id = p_primary_role_id, (SELECT auth.uid())
  FROM unnest(v_role_ids) AS role_id;

  UPDATE public.usuarios
  SET rol = v_primary_name, updated_at = now()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'primary_role_id', p_primary_role_id,
    'role_ids', to_jsonb(v_role_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settings_users_set_roles(uuid,uuid[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settings_users_set_roles(uuid,uuid[],uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_module_keys()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT access.key
  FROM (
    SELECT m.key
    FROM public.app_modules m
    WHERE m.activo AND public.can_manage_role_permissions()
    UNION
    SELECT m.key
    FROM public.usuarios u
    JOIN public.usuario_catalog_roles ur ON ur.user_id = u.id
    JOIN public.catalog_roles cr ON cr.id = ur.role_id AND cr.activo
    JOIN public.catalog_role_modules rm ON rm.role_id = cr.id
    JOIN public.app_modules m ON m.key = rm.module_key AND m.activo
    WHERE u.user_id = (SELECT auth.uid()) AND u.activo
  ) access
  ORDER BY access.key;
$$;

REVOKE ALL ON FUNCTION public.current_user_module_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_module_keys() TO authenticated;

ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_role_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_catalog_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_modules, public.catalog_role_modules, public.usuario_catalog_roles
  FROM anon, authenticated;
GRANT SELECT ON public.app_modules, public.catalog_role_modules TO authenticated;
GRANT SELECT ON public.usuario_catalog_roles TO authenticated;

CREATE POLICY app_modules_select_authenticated ON public.app_modules
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY catalog_role_modules_select_authenticated ON public.catalog_role_modules
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY usuario_catalog_roles_select_scoped ON public.usuario_catalog_roles
  FOR SELECT TO authenticated
  USING (
    public.can_manage_role_permissions()
    OR EXISTS (
      SELECT 1 FROM public.usuarios me
      WHERE me.id = usuario_catalog_roles.user_id
        AND me.user_id = (SELECT auth.uid())
    )
  );

-- La configuracion de roles es exclusiva de Super Admin tambien por Data API.
DROP POLICY IF EXISTS catalog_roles_insert_admin ON public.catalog_roles;
CREATE POLICY catalog_roles_insert_admin ON public.catalog_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_role_permissions());

DROP POLICY IF EXISTS catalog_roles_update_admin ON public.catalog_roles;
CREATE POLICY catalog_roles_update_admin ON public.catalog_roles
  FOR UPDATE TO authenticated
  USING (public.can_manage_role_permissions())
  WITH CHECK (public.can_manage_role_permissions());

DROP POLICY IF EXISTS catalog_roles_delete_admin ON public.catalog_roles;
CREATE POLICY catalog_roles_delete_admin ON public.catalog_roles
  FOR DELETE TO authenticated
  USING (public.can_manage_role_permissions());

COMMENT ON TABLE public.catalog_role_modules IS 'Modulos habilitados para cada rol configurable.';
COMMENT ON TABLE public.usuario_catalog_roles IS 'Relacion muchos-a-muchos entre usuarios y roles de negocio.';
