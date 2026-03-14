-- =============================================================================
-- Añadir estado Retraso: acción vencida (fecha límite pasada) sin completar.
-- =============================================================================

ALTER TYPE action_status ADD VALUE IF NOT EXISTS 'Retraso';
