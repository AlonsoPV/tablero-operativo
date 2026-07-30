DROP POLICY IF EXISTS accion_fecha_compromiso_cambios_insert_authenticated
  ON public.accion_fecha_compromiso_cambios;

CREATE POLICY accion_fecha_compromiso_cambios_insert_authenticated
ON public.accion_fecha_compromiso_cambios
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = changed_by
      AND u.user_id = (SELECT auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
