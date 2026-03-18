-- =============================================================================
-- Seed: orígenes y destinos de ejemplo para el módulo de distancias
-- latitud/longitud NULL; en fase posterior se pueden rellenar por geocoding
-- =============================================================================

INSERT INTO distance_origins (nombre, ubicacion, latitud, longitud, activo)
VALUES
  ('DHL Macrocentro', 'Macrocentro, Ciudad de México', NULL, NULL, true),
  ('Palmar', 'Palmar, ubicación principal', NULL, NULL, true),
  ('Medix', 'Medix, sede central', NULL, NULL, true);

INSERT INTO distance_destinations (nombre, ubicacion, latitud, longitud, activo)
VALUES
  ('DHL Macrocentro', 'Macrocentro, Ciudad de México', NULL, NULL, true),
  ('Palmar', 'Palmar, ubicación principal', NULL, NULL, true),
  ('Medix', 'Medix, sede central', NULL, NULL, true);
