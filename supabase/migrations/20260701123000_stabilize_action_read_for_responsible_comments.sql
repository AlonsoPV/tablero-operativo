-- Estabiliza lectura de acciones para flujos de comentarios/evidencias.
-- Analista: ve acciones donde es responsable, creador o fue mencionado/asignado en comentario.
-- Otros roles autenticados: conservan lectura amplia del tablero.

DROP POLICY IF EXISTS acciones_select_authenticated ON public.acciones_diarias;
DROP POLICY IF EXISTS acciones_select_own_or_admin ON public.acciones_diarias;
DROP POLICY IF EXISTS acciones_select_responsable_creator_or_admin ON public.acciones_diarias;
DROP POLICY IF EXISTS acciones_select_role_scoped ON public.acciones_diarias;

CREATE POLICY acciones_select_role_scoped ON public.acciones_diarias
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_business_analyst()
    OR responsable = public.get_my_usuario_id()
    OR (created_by IS NOT NULL AND created_by = public.get_my_usuario_id())
    OR EXISTS (
      SELECT 1
      FROM public.accion_comentarios c
      WHERE c.accion_id = acciones_diarias.id
        AND (
          c.asignado = public.get_my_usuario_id()
          OR public.get_my_usuario_id()::text = ANY(COALESCE(c.etiquetas, ARRAY[]::text[]))
        )
    )
  );

NOTIFY pgrst, 'reload schema';
