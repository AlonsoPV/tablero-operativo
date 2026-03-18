-- Título de la acción (máx. 70 caracteres). Se muestra cuando la acción está colapsada.
ALTER TABLE acciones_diarias
  ADD COLUMN IF NOT EXISTS titulo_accion text NOT NULL DEFAULT '';

ALTER TABLE acciones_diarias
  DROP CONSTRAINT IF EXISTS chk_titulo_accion_length;

ALTER TABLE acciones_diarias
  ADD CONSTRAINT chk_titulo_accion_length CHECK (char_length(titulo_accion) <= 70);

COMMENT ON COLUMN acciones_diarias.titulo_accion IS 'Título breve de la acción (máx. 70 caracteres); se muestra en vista colapsada.';
