-- =============================================================================
-- Acciones visibles para todos los usuarios autenticados.
-- Antes: solo responsable o admin. Ahora: cualquier usuario autenticado.
-- =============================================================================

DROP POLICY IF EXISTS acciones_select_own_or_admin ON acciones_diarias;
DROP POLICY IF EXISTS acciones_select_authenticated ON acciones_diarias;
CREATE POLICY acciones_select_authenticated ON acciones_diarias
  FOR SELECT USING (auth.role() = 'authenticated');

-- accion_evidencias: si todos ven todas las acciones, todos ven sus evidencias
DROP POLICY IF EXISTS accion_evidencias_select ON accion_evidencias;
DROP POLICY IF EXISTS accion_evidencias_select_authenticated ON accion_evidencias;
CREATE POLICY accion_evidencias_select_authenticated ON accion_evidencias
  FOR SELECT USING (auth.role() = 'authenticated');
