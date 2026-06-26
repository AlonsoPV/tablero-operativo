-- Keep action comments editable for authenticated users using current RLS policy style.

DROP POLICY IF EXISTS accion_comentarios_update_authenticated ON public.accion_comentarios;

CREATE POLICY accion_comentarios_update_authenticated
  ON public.accion_comentarios
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
