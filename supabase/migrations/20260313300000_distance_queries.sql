-- Tabla para guardar consultas de distancia (Google Routes API).
-- RLS: cada usuario ve/inserta solo sus propias filas (created_by → usuarios.id).

CREATE TABLE IF NOT EXISTS distance_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen_nombre text NOT NULL,
  origen_ubicacion text NOT NULL,
  destino_nombre text NOT NULL,
  destino_ubicacion text NOT NULL,
  distancia_km numeric NOT NULL,
  google_distance_meters integer,
  route_mode text NOT NULL DEFAULT 'DRIVE',
  status text NOT NULL DEFAULT 'ok',
  error_message text,
  created_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distance_queries_created_by ON distance_queries(created_by);
CREATE INDEX IF NOT EXISTS idx_distance_queries_created_at ON distance_queries(created_at DESC);

COMMENT ON TABLE distance_queries IS 'Historial de consultas de distancia (Routes API)';
COMMENT ON COLUMN distance_queries.route_mode IS 'Modo de viaje: DRIVE, WALK, etc.';
COMMENT ON COLUMN distance_queries.status IS 'ok | error';
COMMENT ON COLUMN distance_queries.error_message IS 'Mensaje de error si status = error';

ALTER TABLE distance_queries ENABLE ROW LEVEL SECURITY;

-- Ver solo propias consultas; insertar con created_by = propio usuario.
CREATE POLICY distance_queries_select_own ON distance_queries
  FOR SELECT
  USING (created_by = get_my_usuario_id());

CREATE POLICY distance_queries_insert_own ON distance_queries
  FOR INSERT
  WITH CHECK (created_by = get_my_usuario_id());
