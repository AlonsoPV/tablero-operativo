-- Align evidence permissions with full action edit permissions:
-- action creator, super admin, or direccion can add/delete action evidence.

DROP POLICY IF EXISTS accion_evidencias_insert ON public.accion_evidencias;
DROP POLICY IF EXISTS accion_evidencias_insert_creator ON public.accion_evidencias;
DROP POLICY IF EXISTS accion_evidencias_insert_manage_accion ON public.accion_evidencias;
DROP POLICY IF EXISTS accion_evidencias_delete_creator ON public.accion_evidencias;
DROP POLICY IF EXISTS accion_evidencias_delete_manage_accion ON public.accion_evidencias;

CREATE POLICY accion_evidencias_insert_manage_accion
  ON public.accion_evidencias
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_accion_full(accion_id));

CREATE POLICY accion_evidencias_delete_manage_accion
  ON public.accion_evidencias
  FOR DELETE
  TO authenticated
  USING (public.can_manage_accion_full(accion_id));

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS evidencias_insert ON storage.objects;
    CREATE POLICY evidencias_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'evidencias'
        AND (
          (storage.foldername(name))[1] IS DISTINCT FROM 'acciones'
          OR (
            (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.can_manage_accion_full(((storage.foldername(name))[2])::uuid)
          )
        )
      );

    DROP POLICY IF EXISTS evidencias_delete ON storage.objects;
    CREATE POLICY evidencias_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'evidencias'
        AND (
          (storage.foldername(name))[1] IS DISTINCT FROM 'acciones'
          OR (
            (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.can_manage_accion_full(((storage.foldername(name))[2])::uuid)
          )
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
