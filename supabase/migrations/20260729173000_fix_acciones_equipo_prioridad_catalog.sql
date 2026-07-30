-- acciones_equipo.prioridad debe aceptar nombres del catálogo corporativo (`priorities.nombre`).
-- La restricción legacy acciones_equipo_prioridad_check solo permitía Baja/Media/Alta/Critica.

ALTER TABLE public.acciones_equipo
  DROP CONSTRAINT IF EXISTS acciones_equipo_prioridad_check;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_prioridad_not_empty'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_prioridad_not_empty
      CHECK (char_length(trim(prioridad)) > 0);
  END IF;
END
$do$;

-- Normalizar valores legacy al catálogo corporativo cuando exista coincidencia.
UPDATE public.acciones_equipo ae
SET prioridad = mapped.target
FROM (
  SELECT
    ae2.id,
    coalesce(
      exact.nombre,
      legacy.nombre,
      (SELECT p.nombre FROM public.priorities p WHERE p.activo ORDER BY p.orden, p.nombre LIMIT 1),
      'P2_Media'
    ) AS target
  FROM public.acciones_equipo ae2
  LEFT JOIN public.priorities exact
    ON lower(trim(exact.nombre)) = lower(trim(ae2.prioridad))
  LEFT JOIN public.priorities legacy
    ON lower(trim(legacy.nombre)) = CASE lower(trim(ae2.prioridad))
      WHEN 'baja' THEN 'p3_baja'
      WHEN 'media' THEN 'p2_media'
      WHEN 'alta' THEN 'p1_critica'
      WHEN 'critica' THEN 'p1_critica'
      ELSE NULL
    END
  WHERE exact.id IS NULL
     OR ae2.prioridad IN ('Baja', 'Media', 'Alta', 'Critica')
) mapped
WHERE ae.id = mapped.id
  AND ae.prioridad IS DISTINCT FROM mapped.target;

ALTER TABLE public.acciones_equipo
  ALTER COLUMN prioridad SET DEFAULT 'P2_Media';

NOTIFY pgrst, 'reload schema';
