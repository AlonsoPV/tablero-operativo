-- Visibilidad operativa: decisiones requeridas y dependencias entre areas.
-- Se implementan como tipos de accion para evitar crear columnas extra en el Kanban.

ALTER TABLE public.acciones_diarias
  DROP CONSTRAINT IF EXISTS chk_acciones_tipo_accion_run_change,
  ADD CONSTRAINT chk_acciones_tipo_accion_run_change
    CHECK (tipo_accion IN ('operativa', 'sprint', 'estrategica', 'decision', 'dependencia'));

CREATE INDEX IF NOT EXISTS idx_acciones_tipo_accion_decision_dependencia
  ON public.acciones_diarias(tipo_accion)
  WHERE tipo_accion IN ('decision', 'dependencia');

COMMENT ON COLUMN public.acciones_diarias.tipo_accion IS
  'Clasificacion operativa: operativa RUN, sprint/estrategica CHANGE, decision requerida o dependencia entre areas.';

COMMENT ON COLUMN public.acciones_diarias.responsable_bloqueo IS
  'Responsable de desbloqueo cuando una accion esta bloqueada o marcada como dependencia entre areas.';
