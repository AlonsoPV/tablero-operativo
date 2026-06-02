-- =============================================================================
-- Catálogo priorities: alineado al enum prioridad_nc (acciones_diarias.prioridad)
-- y al orden del Kanban (PRIORITY_SORT_RANK en KanbanBoard.tsx).
-- Conecta la columna prioridad como text = priorities.nombre.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_priorities_nombre_unique
  ON public.priorities (lower(trim(nombre)));

INSERT INTO public.priorities (nombre, descripcion, orden, activo)
SELECT v.nombre, v.descripcion, v.orden, true
FROM (
  VALUES
    (
      'P1_Critica',
      'Prioridad crítica: requiere atención inmediata y desbloqueo prioritario.',
      1
    ),
    (
      'P2_Media',
      'Prioridad media: plazo operativo estándar.',
      2
    ),
    (
      'P3_Baja',
      'Prioridad baja: puede programarse con mayor flexibilidad.',
      3
    )
) AS v(nombre, descripcion, orden)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.priorities p
  WHERE lower(trim(p.nombre)) = lower(trim(v.nombre))
);

ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad DROP DEFAULT;

ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad TYPE text USING prioridad::text;

ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad SET DEFAULT 'P2_Media';

ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad SET NOT NULL;

UPDATE public.acciones_diarias ad
SET
  prioridad = 'P2_Media',
  updated_at = now()
WHERE ad.prioridad IS NULL
   OR NOT EXISTS (
     SELECT 1
     FROM public.priorities p
     WHERE lower(trim(p.nombre)) = lower(trim(ad.prioridad))
       AND p.activo = true
   );

COMMENT ON TABLE public.priorities IS
  'Catálogo de prioridades para acciones; acciones_diarias.prioridad guarda priorities.nombre.';

COMMENT ON COLUMN public.acciones_diarias.prioridad IS
  'Nombre de prioridad; debe coincidir con priorities.nombre (catálogo conectado).';
