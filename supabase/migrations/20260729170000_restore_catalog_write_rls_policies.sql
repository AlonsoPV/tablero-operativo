-- DEV (y cualquier entorno parcial) quedó con RLS en catálogos pero sin
-- políticas INSERT/UPDATE/DELETE. Con RLS activo y sin policy de UPDATE,
-- PostgREST actualiza 0 filas → el toggle de estatus falla aunque el usuario
-- sea Super Admin y can_manage_catalogs() sea true.
--
-- Restaura políticas de escritura bajo can_manage_catalogs() de forma idempotente.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('statuses'),
        ('priorities'),
        ('areas'),
        ('catalog_roles'),
        ('dropdown_catalogs'),
        ('dropdown_options'),
        ('catalog_kpis'),
        ('gaps')
    ) AS t(table_name)
  LOOP
    IF to_regclass(format('public.%I', r.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.table_name || '_select_authenticated', r.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      r.table_name || '_select_authenticated',
      r.table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.table_name || '_insert_admin', r.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_catalogs())',
      r.table_name || '_insert_admin',
      r.table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.table_name || '_update_admin', r.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_catalogs()) WITH CHECK (public.can_manage_catalogs())',
      r.table_name || '_update_admin',
      r.table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.table_name || '_delete_admin', r.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage_catalogs())',
      r.table_name || '_delete_admin',
      r.table_name
    );

    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      r.table_name
    );
  END LOOP;
END $$;
