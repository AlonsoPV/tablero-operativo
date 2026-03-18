-- 1) Tabla distance_queries más completa: metros y duración para reportes y lógica operativa.
-- 2) Caché simple para reutilizar resultados y ahorrar consumo de API.

-- Añadir duración en segundos (Google Routes devuelve duration; útil para reportes).
ALTER TABLE distance_queries
  ADD COLUMN IF NOT EXISTS duracion_segundos integer;

-- Renombrar columna de metros para consistencia con la tabla sugerida (solo si existe aún).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'distance_queries' AND column_name = 'google_distance_meters'
  ) THEN
    ALTER TABLE distance_queries RENAME COLUMN google_distance_meters TO distancia_metros;
  END IF;
END $$;

COMMENT ON COLUMN distance_queries.duracion_segundos IS 'Duración estimada de la ruta en segundos (Google Routes)';
COMMENT ON COLUMN distance_queries.distancia_metros IS 'Distancia en metros (mismo valor que distancia_km * 1000)';

-- Tabla de caché: misma ruta (origen, destino, modo) reutilizable por un tiempo.
-- Solo la Edge Function (service role) lee/escribe; no exponer al cliente.
CREATE TABLE IF NOT EXISTS distance_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen_ubicacion text NOT NULL,
  destino_ubicacion text NOT NULL,
  route_mode text NOT NULL DEFAULT 'DRIVE',
  distancia_km numeric NOT NULL,
  distancia_metros integer NOT NULL,
  duracion_segundos integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distance_cache_lookup ON distance_cache (
  trim(lower(origen_ubicacion)),
  trim(lower(destino_ubicacion)),
  route_mode
);
CREATE INDEX IF NOT EXISTS idx_distance_cache_created_at ON distance_cache(created_at DESC);

COMMENT ON TABLE distance_cache IS 'Caché de consultas Routes API; TTL implícito por created_at (ej. 24 h en la Edge Function)';
