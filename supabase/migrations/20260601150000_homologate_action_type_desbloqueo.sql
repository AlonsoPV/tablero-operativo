-- Homologa decisiones requeridas y dependencias entre areas en una sola categoria operativa: desbloqueo.

UPDATE public.acciones_diarias
SET tipo_accion = 'desbloqueo'
WHERE tipo_accion IN ('decision', 'dependencia');

ALTER TABLE public.acciones_diarias
  DROP CONSTRAINT IF EXISTS chk_acciones_tipo_accion_run_change,
  ADD CONSTRAINT chk_acciones_tipo_accion_run_change
    CHECK (tipo_accion IN ('operativa', 'sprint', 'estrategica', 'desbloqueo'));

DROP INDEX IF EXISTS public.idx_acciones_tipo_accion_decision_dependencia;

CREATE INDEX IF NOT EXISTS idx_acciones_tipo_accion_desbloqueo
  ON public.acciones_diarias(tipo_accion)
  WHERE tipo_accion = 'desbloqueo';

COMMENT ON COLUMN public.acciones_diarias.tipo_accion IS
  'Clasificacion operativa: operativa RUN, sprint/estrategica CHANGE o desbloqueo para decisiones, aprobaciones, validaciones y dependencias entre areas.';

COMMENT ON COLUMN public.acciones_diarias.responsable_bloqueo IS
  'Responsable de desbloqueo cuando una accion esta bloqueada o marcada como desbloqueo.';
