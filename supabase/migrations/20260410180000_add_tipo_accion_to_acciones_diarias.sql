-- Enum de tipo de acción basado en complejidad O2C
CREATE TYPE tipo_accion_enum AS ENUM (
  'configuracion',   -- 1–3 pts: ajuste de parámetro, configuración
  'reporte',         -- 1–3 pts: reporte nuevo, regla de validación
  'integracion',     -- 5–8 pts: integración parcial o completa
  'dashboard',       -- 5–8 pts: dashboard, vista analítica
  'automatizacion',  -- 13 pts: API end-to-end, automatización core
  'otro'             -- sin sugerencia de puntos
);

ALTER TABLE acciones_diarias
  ADD COLUMN tipo_accion tipo_accion_enum NULL;

COMMENT ON COLUMN acciones_diarias.tipo_accion IS
  'Categoría de complejidad de la acción. Determina la sugerencia de story points.';
