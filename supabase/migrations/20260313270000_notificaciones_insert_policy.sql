-- Asegurar que cualquier usuario autenticado pueda crear notificaciones para otros
-- (ej. al asignar responsable en una acción). Sin esta política, INSERT devuelve 403.
DROP POLICY IF EXISTS notificaciones_insert_authenticated ON notificaciones;
CREATE POLICY notificaciones_insert_authenticated ON notificaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
