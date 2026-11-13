-- Registro de consultas que Retell hizo durante la entrevista.
-- Null en sesiones anteriores: el informe no debe tratarlas como consultas al tablero.

ALTER TABLE public.guide_sessions
  ADD COLUMN IF NOT EXISTS consult_log jsonb;

COMMENT ON COLUMN public.guide_sessions.consult_log IS
  'Consultas del puente Retell (herramienta, estado, resumen). No guarda tokens.';

NOTIFY pgrst, 'reload schema';
