-- Rol Direccion: hereda acceso operativo de Analista en UI y puede administrar
-- usuarios, catalogos y modulos de Academia.

INSERT INTO public.catalog_roles (nombre, descripcion, activo)
SELECT
  'Dirección',
  'Dirección: acceso operativo tipo Analista con gestión de usuarios, catálogos y módulos de Academia.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_roles cr
  WHERE lower(trim(cr.nombre)) IN ('dirección', 'direccion')
);

DO $$
BEGIN
  IF to_regclass('public.academy_modules') IS NOT NULL THEN
    DROP POLICY IF EXISTS academy_modules_select_authenticated ON public.academy_modules;
    CREATE POLICY academy_modules_select_authenticated ON public.academy_modules
      FOR SELECT TO authenticated
      USING (
        is_active
        OR public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.user_id = auth.uid()
            AND lower(trim(u.rol)) IN ('dirección', 'direccion')
        )
      );

    DROP POLICY IF EXISTS academy_modules_insert_super_admin ON public.academy_modules;
    CREATE POLICY academy_modules_insert_super_admin ON public.academy_modules
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.user_id = auth.uid()
            AND lower(trim(u.rol)) IN ('dirección', 'direccion')
        )
      );

    DROP POLICY IF EXISTS academy_modules_update_super_admin ON public.academy_modules;
    CREATE POLICY academy_modules_update_super_admin ON public.academy_modules
      FOR UPDATE TO authenticated
      USING (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.user_id = auth.uid()
            AND lower(trim(u.rol)) IN ('dirección', 'direccion')
        )
      )
      WITH CHECK (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.user_id = auth.uid()
            AND lower(trim(u.rol)) IN ('dirección', 'direccion')
        )
      );

    DROP POLICY IF EXISTS academy_modules_delete_super_admin ON public.academy_modules;
    CREATE POLICY academy_modules_delete_super_admin ON public.academy_modules
      FOR DELETE TO authenticated
      USING (
        public.is_super_admin()
        OR public.has_business_role('super_admin')
        OR EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.user_id = auth.uid()
            AND lower(trim(u.rol)) IN ('dirección', 'direccion')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS academia_insert ON storage.objects;
    CREATE POLICY academia_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'academia'
        AND (
          public.is_app_admin()
          OR public.has_business_role('super_admin')
          OR EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.user_id = auth.uid()
              AND lower(trim(u.rol)) IN ('dg', 'sistemas', 'dirección', 'direccion')
          )
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
          OR EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.user_id = auth.uid()
              AND lower(trim(u.rol)) IN ('dg', 'sistemas', 'dirección', 'direccion')
          )
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
          OR EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.user_id = auth.uid()
              AND lower(trim(u.rol)) IN ('dg', 'sistemas', 'dirección', 'direccion')
          )
        )
      );
  END IF;
END $$;
