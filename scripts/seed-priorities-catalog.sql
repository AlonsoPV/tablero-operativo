-- =============================================================================
-- Prioridades vía catálogo (tabla priorities).
-- Ejecutar en Supabase Dashboard → SQL Editor.
--
-- 1. Siembra P1_Critica, P2_Media, P3_Baja con colores (idempotente).
-- 2. Normaliza acciones huérfanas a P2_Media.
--
-- NOTA: El esquema (prioridad text, prioridad_id, triggers) lo aplican las
-- migraciones de supabase/. NO vuelvas a ejecutar ALTER TYPE aquí: falla si
-- existe el trigger acciones_diarias_sync_prioridad_id.
-- =============================================================================

-- Índice único por nombre (como areas), si aún no existe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_priorities_nombre_unique
  ON public.priorities (lower(trim(nombre)));

INSERT INTO public.priorities (nombre, descripcion, orden, activo, color)
SELECT v.nombre, v.descripcion, v.orden, true, v.color
FROM (
  VALUES
    (
      'P1_Critica',
      'Prioridad crítica: requiere atención inmediata y desbloqueo prioritario.',
      1,
      'rojo'
    ),
    (
      'P2_Media',
      'Prioridad media: plazo operativo estándar.',
      2,
      'amarillo'
    ),
    (
      'P3_Baja',
      'Prioridad baja: puede programarse con mayor flexibilidad.',
      3,
      'verde'
    )
) AS v(nombre, descripcion, orden, color)
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
  color = v.color,
  activo = true,
  updated_at = now()
FROM (
  VALUES
    ('P1_Critica', 'Prioridad crítica: requiere atención inmediata y desbloqueo prioritario.', 1, 'rojo'),
    ('P2_Media', 'Prioridad media: plazo operativo estándar.', 2, 'amarillo'),
    ('P3_Baja', 'Prioridad baja: puede programarse con mayor flexibilidad.', 3, 'verde')
) AS v(nombre, descripcion, orden, color)
WHERE lower(trim(p.nombre)) = lower(trim(v.nombre))
  AND (
    p.descripcion IS DISTINCT FROM v.descripcion
    OR p.orden IS DISTINCT FROM v.orden
    OR p.color IS DISTINCT FROM v.color
    OR p.activo IS DISTINCT FROM true
  );

-- Valores fuera del catálogo → P2_Media (texto + FK si existe prioridad_id).
UPDATE public.acciones_diarias ad
SET
  prioridad = p_default.nombre,
  prioridad_id = p_default.id,
  updated_at = now()
FROM public.priorities p_default
WHERE lower(trim(p_default.nombre)) = 'p2_media'
  AND (
    ad.prioridad IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.priorities p
      WHERE lower(trim(p.nombre)) = lower(trim(ad.prioridad))
        AND p.activo = true
    )
  );

COMMENT ON TABLE public.priorities IS
  'Catálogo de prioridades para acciones; acciones_diarias.prioridad guarda priorities.nombre.';

COMMENT ON COLUMN public.acciones_diarias.prioridad IS
  'Nombre de prioridad; debe coincidir con priorities.nombre (catálogo conectado).';

-- Verificación rápida (opcional: revisar resultset en SQL Editor).
SELECT
  p.orden,
  p.nombre,
  p.color,
  p.descripcion,
  p.activo,
  count(ad.id) AS acciones
FROM public.priorities p
LEFT JOIN public.acciones_diarias ad
  ON lower(trim(ad.prioridad)) = lower(trim(p.nombre))
GROUP BY p.id, p.orden, p.nombre, p.color, p.descripcion, p.activo
ORDER BY p.orden, p.nombre;
