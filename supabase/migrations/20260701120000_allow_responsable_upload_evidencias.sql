-- Permite que el responsable asignado suba apoyo documental a su accion.
-- La eliminacion se mantiene restringida a quien puede editar completamente.

DROP POLICY IF EXISTS accion_evidencias_insert_manage_accion ON public.accion_evidencias;

CREATE POLICY accion_evidencias_insert_manage_accion
  ON public.accion_evidencias
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_accion_full(accion_id)
    OR public.can_close_accion_as(accion_id, public.get_my_usuario_id())
  );

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
            (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND (
              public.can_manage_accion_full(((storage.foldername(name))[2])::uuid)
              OR public.can_close_accion_as(((storage.foldername(name))[2])::uuid, public.get_my_usuario_id())
            )
          )
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
