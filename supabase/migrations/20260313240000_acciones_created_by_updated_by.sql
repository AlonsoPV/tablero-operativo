-- Añade created_by y updated_by a acciones_diarias.
-- Modelo: quién creó, a quién está asignado (responsable), quién modificó.
-- RLS puede usar estos campos para restricciones por rol.

ALTER TABLE acciones_diarias
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acciones_diarias_created_by ON acciones_diarias(created_by);
CREATE INDEX IF NOT EXISTS idx_acciones_diarias_updated_by ON acciones_diarias(updated_by);

COMMENT ON COLUMN acciones_diarias.created_by IS 'Usuario que creó la acción (usuarios.id)';
COMMENT ON COLUMN acciones_diarias.updated_by IS 'Usuario que realizó la última modificación';
