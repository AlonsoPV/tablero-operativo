-- =============================================================================
-- Prioridades vía catálogo (tabla priorities).
-- Ejecutar en Supabase Dashboard → SQL Editor.
--
-- 1. Siembra P1_Critica, P2_Media, P3_Baja en public.priorities (idempotente).
-- 2. Conecta acciones_diarias.prioridad al catálogo (text = priorities.nombre).
-- 3. Normaliza filas huérfanas a P2_Media.
--
-- Los nombres del catálogo coinciden con el enum prioridad_nc para no romper
-- datos existentes ni la UI actual (Kanban, filtros, formularios).
-- =============================================================================

-- Índice único por nombre (como areas), si aún no existe.
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

-- Asegurar descripción y orden en filas ya existentes (re-ejecución segura).
UPDATE public.priorities p
SET
  descripcion = v.descripcion,
  orden = v.orden,
  activo = true,
  updated_at = now()
FROM (
  VALUES
    ('P1_Critica', 'Prioridad crítica: requiere atención inmediata y desbloqueo prioritario.', 1),
    ('P2_Media', 'Prioridad media: plazo operativo estándar.', 2),
    ('P3_Baja', 'Prioridad baja: puede programarse con mayor flexibilidad.', 3)
) AS v(nombre, descripcion, orden)
WHERE lower(trim(p.nombre)) = lower(trim(v.nombre))
  AND (
    p.descripcion IS DISTINCT FROM v.descripcion
    OR p.orden IS DISTINCT FROM v.orden
    OR p.activo IS DISTINCT FROM true
  );

-- Enum prioridad_nc → text enlazado al catálogo (mismo patrón que usuarios.rol).
ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad DROP DEFAULT;

ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad TYPE text USING prioridad::text;

ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad SET DEFAULT 'P2_Media';

ALTER TABLE public.acciones_diarias
  ALTER COLUMN prioridad SET NOT NULL;

-- Valores fuera del catálogo → media por defecto.
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

-- Verificación rápida (opcional: revisar resultset en SQL Editor).
SELECT
  p.orden,
  p.nombre,
  p.descripcion,
  p.activo,
  count(ad.id) AS acciones
FROM public.priorities p
LEFT JOIN public.acciones_diarias ad
  ON lower(trim(ad.prioridad)) = lower(trim(p.nombre))
GROUP BY p.id, p.orden, p.nombre, p.descripcion, p.activo
ORDER BY p.orden, p.nombre;
