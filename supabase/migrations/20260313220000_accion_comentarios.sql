-- =============================================================================
-- Comentarios en acciones: contenido, responsable asignado, etiquetas.
-- created_at automático (default now()).
-- =============================================================================

CREATE TABLE accion_comentarios (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accion_id uuid NOT NULL REFERENCES acciones_diarias(id) ON DELETE CASCADE,
  contenido text NOT NULL,
  created_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  asignado uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  etiquetas text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accion_comentarios_accion_id ON accion_comentarios(accion_id);
CREATE INDEX idx_accion_comentarios_created_at ON accion_comentarios(created_at);

ALTER TABLE accion_comentarios ENABLE ROW LEVEL SECURITY;

-- Visible si la acción es visible (todos los autenticados tras 20260313200000)
CREATE POLICY accion_comentarios_select_authenticated ON accion_comentarios
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY accion_comentarios_insert_authenticated ON accion_comentarios
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY accion_comentarios_update_authenticated ON accion_comentarios
  FOR UPDATE USING (auth.role() = 'authenticated');
