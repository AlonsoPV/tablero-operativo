-- Rol Direccion: acceso tipo Analista + administracion de usuarios,
-- catalogos y modulos de Academia.
-- Esta migracion corrige la capa de datos para que la UI no dependa solo
-- de permisos visuales.

CREATE OR REPLACE FUNCTION public.normalize_business_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    translate(
      trim(coalesce(p_role, '')),
      U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1',
      'aeiouun'
    )
  );
$$;

COMMENT ON FUNCTION public.normalize_business_role(text) IS
  'Normaliza roles de negocio para comparar sin acentos y sin espacios.';

CREATE OR REPLACE FUNCTION public.has_business_role(p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.user_id = auth.uid()
      AND public.normalize_business_role(u.rol::text) = public.normalize_business_role(p_role)
      AND u.activo = true
  );
$$;

COMMENT ON FUNCTION public.has_business_role(text) IS
  'Indica si el usuario autenticado tiene un rol de negocio activo en public.usuarios.';

UPDATE public.catalog_roles
SET
  nombre = 'Direccion',
  descripcion = 'Direccion: acceso operativo tipo Analista con gestion de usuarios, catalogos y modulos de Academia.'
WHERE public.normalize_business_role(nombre) = 'direccion';

INSERT INTO public.catalog_roles (nombre, descripcion, activo)
SELECT
  'Direccion',
  'Direccion: acceso operativo tipo Analista con gestion de usuarios, catalogos y modulos de Academia.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_roles cr
  WHERE public.normalize_business_role(cr.nombre) = 'direccion'
);

DROP POLICY IF EXISTS usuarios_select_direction_all ON public.usuarios;
CREATE POLICY usuarios_select_direction_all ON public.usuarios
  FOR SELECT TO authenticated
  USING (public.has_business_role('Direccion'));

DROP POLICY IF EXISTS usuarios_insert_admin ON public.usuarios;
CREATE POLICY usuarios_insert_admin ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_business_role('Direccion')
  );

DROP POLICY IF EXISTS usuarios_update_own_or_admin ON public.usuarios;
DROP POLICY IF EXISTS usuarios_update_own ON public.usuarios;
CREATE POLICY usuarios_update_own_or_admin ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_app_admin()
    OR public.has_business_role('Direccion')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_app_admin()
    OR public.has_business_role('Direccion')
  );

CREATE OR REPLACE FUNCTION public.get_auth_user_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() != p_user_id
    AND NOT public.is_app_admin()
    AND NOT public.has_business_role('Direccion')
  THEN
    RETURN NULL;
  END IF;

  SELECT au.email INTO v_email
  FROM auth.users au
  WHERE au.id = p_user_id
  LIMIT 1;

  RETURN v_email;
END;
$$;

COMMENT ON FUNCTION public.get_auth_user_email(uuid) IS
  'Devuelve el email de auth.users para user_id. Solo propio usuario, app admin o Direccion.';

DO $$
BEGIN
  IF to_regclass('public.gaps') IS NOT NULL THEN
    DROP POLICY IF EXISTS gaps_insert_admin ON public.gaps;
    CREATE POLICY gaps_insert_admin ON public.gaps
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      );

    DROP POLICY IF EXISTS gaps_update_admin ON public.gaps;
    CREATE POLICY gaps_update_admin ON public.gaps
      FOR UPDATE TO authenticated
      USING (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      )
      WITH CHECK (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      );

    DROP POLICY IF EXISTS gaps_delete_admin ON public.gaps;
    CREATE POLICY gaps_delete_admin ON public.gaps
      FOR DELETE TO authenticated
      USING (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      );
  END IF;

  IF to_regclass('public.catalog_kpis') IS NOT NULL THEN
    DROP POLICY IF EXISTS catalog_kpis_insert_admin ON public.catalog_kpis;
    CREATE POLICY catalog_kpis_insert_admin ON public.catalog_kpis
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      );

    DROP POLICY IF EXISTS catalog_kpis_update_admin ON public.catalog_kpis;
    CREATE POLICY catalog_kpis_update_admin ON public.catalog_kpis
      FOR UPDATE TO authenticated
      USING (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      )
      WITH CHECK (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      );

    DROP POLICY IF EXISTS catalog_kpis_delete_admin ON public.catalog_kpis;
    CREATE POLICY catalog_kpis_delete_admin ON public.catalog_kpis
      FOR DELETE TO authenticated
      USING (
        public.is_app_admin()
        OR public.has_business_role('Direccion')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.academy_modules') IS NOT NULL THEN
    DROP POLICY IF EXISTS academy_modules_select_authenticated ON public.academy_modules;
    CREATE POLICY academy_modules_select_authenticated ON public.academy_modules
      FOR SELECT TO authenticated
      USING (
        is_active
        OR public.is_super_admin()
        OR public.has_business_role('Direccion')
      );

    DROP POLICY IF EXISTS academy_modules_insert_super_admin ON public.academy_modules;
    CREATE POLICY academy_modules_insert_super_admin ON public.academy_modules
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR public.has_business_role('Direccion')
      );

    DROP POLICY IF EXISTS academy_modules_update_super_admin ON public.academy_modules;
    CREATE POLICY academy_modules_update_super_admin ON public.academy_modules
      FOR UPDATE TO authenticated
      USING (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR public.has_business_role('Direccion')
      )
      WITH CHECK (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR public.has_business_role('Direccion')
      );

    DROP POLICY IF EXISTS academy_modules_delete_super_admin ON public.academy_modules;
    CREATE POLICY academy_modules_delete_super_admin ON public.academy_modules
      FOR DELETE TO authenticated
      USING (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR public.has_business_role('Direccion')
      );
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS academia_insert ON storage.objects;
    CREATE POLICY academia_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'academia'
        AND (
          public.is_app_admin()
          OR public.has_business_role('super_admin')
          OR public.has_business_role('DG')
          OR public.has_business_role('Sistemas')
          OR public.has_business_role('Direccion')
        )
      );

    DROP POLICY IF EXISTS academia_update ON storage.objects;
    CREATE POLICY academia_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'academia'
        AND (
          public.is_app_admin()
          OR public.has_business_role('super_admin')
          OR public.has_business_role('DG')
          OR public.has_business_role('Sistemas')
          OR public.has_business_role('Direccion')
        )
      )
      WITH CHECK (
        bucket_id = 'academia'
        AND (
          public.is_app_admin()
          OR public.has_business_role('super_admin')
          OR public.has_business_role('DG')
          OR public.has_business_role('Sistemas')
          OR public.has_business_role('Direccion')
        )
      );

    DROP POLICY IF EXISTS academia_delete ON storage.objects;
    CREATE POLICY academia_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'academia'
        AND (
          public.is_app_admin()
          OR public.has_business_role('super_admin')
          OR public.has_business_role('DG')
          OR public.has_business_role('Sistemas')
          OR public.has_business_role('Direccion')
        )
      );
  END IF;
END $$;
