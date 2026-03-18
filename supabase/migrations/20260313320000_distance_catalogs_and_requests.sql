-- =============================================================================
-- Módulo distancias reestructurado: catálogos de orígenes, destinos, distancias
-- calculadas y tablero de solicitudes. No elimina distance_queries ni distance_cache.
-- =============================================================================

-- distance_origins: catálogo de orígenes para rutas
CREATE TABLE IF NOT EXISTS distance_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  ubicacion text NOT NULL,
  latitud numeric,
  longitud numeric,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_distance_origins_nombre CHECK (char_length(trim(nombre)) >= 1),
  CONSTRAINT chk_distance_origins_ubicacion CHECK (char_length(trim(ubicacion)) >= 1)
);

CREATE INDEX idx_distance_origins_activo ON distance_origins(activo);

-- distance_destinations: catálogo de destinos para rutas
CREATE TABLE IF NOT EXISTS distance_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  ubicacion text NOT NULL,
  latitud numeric,
  longitud numeric,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_distance_destinations_nombre CHECK (char_length(trim(nombre)) >= 1),
  CONSTRAINT chk_distance_destinations_ubicacion CHECK (char_length(trim(ubicacion)) >= 1)
);

CREATE INDEX idx_distance_destinations_activo ON distance_destinations(activo);

-- distance_catalog: caché maestro de rutas calculadas (origen_id, destino_id) → km_ida, km_vuelta, km_total
CREATE TABLE IF NOT EXISTS distance_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_id uuid NOT NULL REFERENCES distance_origins(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES distance_destinations(id) ON DELETE CASCADE,
  origen_nombre_snapshot text,
  destino_nombre_snapshot text,
  origen_ubicacion_snapshot text,
  destino_ubicacion_snapshot text,
  km_ida numeric NOT NULL,
  km_vuelta numeric NOT NULL,
  km_total numeric NOT NULL,
  meters_ida integer,
  meters_vuelta integer,
  duracion_ida_segundos integer,
  duracion_vuelta_segundos integer,
  route_mode text NOT NULL DEFAULT 'DRIVE',
  api_source text NOT NULL DEFAULT 'google_routes',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_distance_catalog_origin_dest_mode UNIQUE (origin_id, destination_id, route_mode)
);

CREATE INDEX idx_distance_catalog_origin_dest ON distance_catalog(origin_id, destination_id);
CREATE INDEX idx_distance_catalog_activo ON distance_catalog(activo);

-- distance_requests: solicitudes del tablero (cada consulta guardada por el usuario)
CREATE TABLE IF NOT EXISTS distance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta text,
  fecha date NOT NULL,
  hora_alta time NOT NULL,
  origin_id uuid NOT NULL REFERENCES distance_origins(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL REFERENCES distance_destinations(id) ON DELETE RESTRICT,
  distance_catalog_id uuid REFERENCES distance_catalog(id) ON DELETE SET NULL,
  km_ida numeric,
  km_vuelta numeric,
  km_total numeric,
  created_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_distance_requests_created_by ON distance_requests(created_by);
CREATE INDEX idx_distance_requests_created_at ON distance_requests(created_at DESC);
CREATE INDEX idx_distance_requests_fecha ON distance_requests(fecha DESC);

-- Triggers updated_at
CREATE TRIGGER set_distance_origins_updated_at
  BEFORE UPDATE ON distance_origins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_distance_destinations_updated_at
  BEFORE UPDATE ON distance_destinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_distance_catalog_updated_at
  BEFORE UPDATE ON distance_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_distance_requests_updated_at
  BEFORE UPDATE ON distance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE distance_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE distance_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE distance_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE distance_requests ENABLE ROW LEVEL SECURITY;

-- Orígenes y destinos: usuarios autenticados pueden leer; admins pueden escribir (alineado con catálogos)
CREATE POLICY distance_origins_select ON distance_origins FOR SELECT USING (true);
CREATE POLICY distance_origins_insert ON distance_origins FOR INSERT WITH CHECK (is_app_admin());
CREATE POLICY distance_origins_update ON distance_origins FOR UPDATE USING (is_app_admin());

CREATE POLICY distance_destinations_select ON distance_destinations FOR SELECT USING (true);
CREATE POLICY distance_destinations_insert ON distance_destinations FOR INSERT WITH CHECK (is_app_admin());
CREATE POLICY distance_destinations_update ON distance_destinations FOR UPDATE USING (is_app_admin());

-- Catálogo de distancias: todos pueden leer (para dropdown/preview); insert/update solo vía Edge Function (service role)
CREATE POLICY distance_catalog_select ON distance_catalog FOR SELECT USING (true);

-- Solicitudes: cada usuario ve/inserta las propias
CREATE POLICY distance_requests_select_own ON distance_requests
  FOR SELECT USING (created_by = get_my_usuario_id());

CREATE POLICY distance_requests_insert_own ON distance_requests
  FOR INSERT WITH CHECK (created_by = get_my_usuario_id());

CREATE POLICY distance_requests_update_own ON distance_requests
  FOR UPDATE USING (created_by = get_my_usuario_id());

COMMENT ON TABLE distance_origins IS 'Catálogo de orígenes para cálculo de rutas; lat/long opcional para geocoding futuro';
COMMENT ON TABLE distance_destinations IS 'Catálogo de destinos para cálculo de rutas; lat/long opcional para geocoding futuro';
COMMENT ON TABLE distance_catalog IS 'Caché de distancias calculadas por par origen-destino; evita llamadas repetidas a Google';
COMMENT ON TABLE distance_requests IS 'Solicitudes del tablero de distancias; cada registro es una consulta guardada por el usuario';
