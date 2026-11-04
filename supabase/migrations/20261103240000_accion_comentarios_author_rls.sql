-- Comentarios de acción: UPDATE/DELETE solo autor o administradores de catálogo.

DROP POLICY IF EXISTS accion_comentarios_update_authenticated ON public.accion_comentarios;
CREATE POLICY accion_comentarios_update_authenticated
  ON public.accion_comentarios
  FOR UPDATE
  TO authenticated
  USING (
    created_by = public.get_my_usuario_id()
    OR public.can_manage_catalogs()
  )
  WITH CHECK (
    created_by = public.get_my_usuario_id()
    OR public.can_manage_catalogs()
  );

DROP POLICY IF EXISTS accion_comentarios_delete_authenticated ON public.accion_comentarios;
CREATE POLICY accion_comentarios_delete_authenticated
  ON public.accion_comentarios
  FOR DELETE
  TO authenticated
  USING (
    created_by = public.get_my_usuario_id()
    OR public.can_manage_catalogs()
  );

NOTIFY pgrst, 'reload schema';
