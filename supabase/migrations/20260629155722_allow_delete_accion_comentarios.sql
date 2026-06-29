-- Allow authenticated users to delete action comments.

DROP POLICY IF EXISTS accion_comentarios_delete_authenticated ON public.accion_comentarios;

CREATE POLICY accion_comentarios_delete_authenticated
  ON public.accion_comentarios
  FOR DELETE
  TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
