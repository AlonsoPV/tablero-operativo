-- =============================================================================
-- Permitir INSERT en notificaciones para que el cliente cree notificaciones
-- (comentarios, asignaciones, etc.).
-- =============================================================================

DROP POLICY IF EXISTS notificaciones_insert_authenticated ON notificaciones;
CREATE POLICY notificaciones_insert_authenticated ON notificaciones
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
