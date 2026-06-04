-- =============================================================================
-- Acciones: checklist de validacion y evidencia adjunta solo editables por creador.
-- La lectura permanece abierta segun las politicas existentes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_accion_creator(p_accion_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.acciones_diarias a
    WHERE a.id = p_accion_id
      AND a.created_by IS NOT NULL
      AND a.created_by = public.get_my_usuario_id()
  );
$$;

COMMENT ON FUNCTION public.is_accion_creator(uuid) IS
  'Indica si el usuario autenticado es la persona creadora de la accion.';

DROP POLICY IF EXISTS accion_checkpoints_insert_responsable_or_admin ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_update_responsable_or_admin ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_delete_responsable_or_admin ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_insert_manage_accion ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_update_manage_accion ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_delete_manage_accion ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_insert_creator ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_update_creator ON public.accion_checkpoints;
DROP POLICY IF EXISTS accion_checkpoints_delete_creator ON public.accion_checkpoints;

CREATE POLICY accion_checkpoints_insert_creator ON public.accion_checkpoints
  FOR INSERT TO authenticated
  WITH CHECK (public.is_accion_creator(accion_id));

CREATE POLICY accion_checkpoints_update_creator ON public.accion_checkpoints
  FOR UPDATE TO authenticated
  USING (public.is_accion_creator(accion_id))
  WITH CHECK (public.is_accion_creator(accion_id));

CREATE POLICY accion_checkpoints_delete_creator ON public.accion_checkpoints
  FOR DELETE TO authenticated
  USING (public.is_accion_creator(accion_id));

DROP POLICY IF EXISTS accion_evidencias_insert ON public.accion_evidencias;
DROP POLICY IF EXISTS accion_evidencias_insert_creator ON public.accion_evidencias;
DROP POLICY IF EXISTS accion_evidencias_delete_creator ON public.accion_evidencias;

CREATE POLICY accion_evidencias_insert_creator ON public.accion_evidencias
  FOR INSERT TO authenticated
  WITH CHECK (public.is_accion_creator(accion_id));

CREATE POLICY accion_evidencias_delete_creator ON public.accion_evidencias
  FOR DELETE TO authenticated
  USING (public.is_accion_creator(accion_id));

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
            AND public.is_accion_creator(((storage.foldername(name))[2])::uuid)
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
            AND public.is_accion_creator(((storage.foldername(name))[2])::uuid)
          )
        )
      );
  END IF;
END $$;
