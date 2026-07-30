-- Gaps y KPIs de catálogo seguían con políticas viejas (solo is_app_admin / Dirección).
-- Super Admin de negocio no pasaba el USING/WITH CHECK → UPDATE 0 filas → PGRST116.
-- Unifica escritura de gaps + catalog_kpis (+ mediciones) bajo can_manage_catalogs().

DO $$
BEGIN
  IF to_regclass('public.gaps') IS NOT NULL THEN
    DROP POLICY IF EXISTS gaps_insert_admin ON public.gaps;
    DROP POLICY IF EXISTS gaps_update_admin ON public.gaps;
    DROP POLICY IF EXISTS gaps_delete_admin ON public.gaps;

    CREATE POLICY gaps_insert_admin ON public.gaps
      FOR INSERT TO authenticated
      WITH CHECK (public.can_manage_catalogs());

    CREATE POLICY gaps_update_admin ON public.gaps
      FOR UPDATE TO authenticated
      USING (public.can_manage_catalogs())
      WITH CHECK (public.can_manage_catalogs());

    CREATE POLICY gaps_delete_admin ON public.gaps
      FOR DELETE TO authenticated
      USING (public.can_manage_catalogs());

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gaps TO authenticated;
  END IF;

  IF to_regclass('public.catalog_kpis') IS NOT NULL THEN
    DROP POLICY IF EXISTS catalog_kpis_insert_admin ON public.catalog_kpis;
    DROP POLICY IF EXISTS catalog_kpis_update_admin ON public.catalog_kpis;
    DROP POLICY IF EXISTS catalog_kpis_delete_admin ON public.catalog_kpis;

    CREATE POLICY catalog_kpis_insert_admin ON public.catalog_kpis
      FOR INSERT TO authenticated
      WITH CHECK (public.can_manage_catalogs());

    CREATE POLICY catalog_kpis_update_admin ON public.catalog_kpis
      FOR UPDATE TO authenticated
      USING (public.can_manage_catalogs())
      WITH CHECK (public.can_manage_catalogs());

    CREATE POLICY catalog_kpis_delete_admin ON public.catalog_kpis
      FOR DELETE TO authenticated
      USING (public.can_manage_catalogs());

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_kpis TO authenticated;
  END IF;

  IF to_regclass('public.catalog_kpi_measurements') IS NOT NULL THEN
    DROP POLICY IF EXISTS catalog_kpi_measurements_insert_admin ON public.catalog_kpi_measurements;
    DROP POLICY IF EXISTS catalog_kpi_measurements_update_admin ON public.catalog_kpi_measurements;
    DROP POLICY IF EXISTS catalog_kpi_measurements_delete_admin ON public.catalog_kpi_measurements;

    CREATE POLICY catalog_kpi_measurements_insert_admin ON public.catalog_kpi_measurements
      FOR INSERT TO authenticated
      WITH CHECK (public.can_manage_catalogs());

    CREATE POLICY catalog_kpi_measurements_update_admin ON public.catalog_kpi_measurements
      FOR UPDATE TO authenticated
      USING (public.can_manage_catalogs())
      WITH CHECK (public.can_manage_catalogs());

    CREATE POLICY catalog_kpi_measurements_delete_admin ON public.catalog_kpi_measurements
      FOR DELETE TO authenticated
      USING (public.can_manage_catalogs());

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_kpi_measurements TO authenticated;
  END IF;
END $$;
