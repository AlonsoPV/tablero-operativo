ALTER TABLE public.priorities
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.priorities
  DROP CONSTRAINT IF EXISTS chk_priorities_color;

ALTER TABLE public.priorities
  ADD CONSTRAINT chk_priorities_color
  CHECK (color IS NULL OR color IN ('verde', 'amarillo', 'rojo'));

UPDATE public.priorities
SET color = CASE
  WHEN lower(nombre) LIKE '%p1%' OR lower(nombre) LIKE '%crit%' OR lower(nombre) LIKE '%alta%' OR lower(nombre) LIKE '%urgent%' THEN 'rojo'
  WHEN lower(nombre) LIKE '%p2%' OR lower(nombre) LIKE '%media%' OR lower(nombre) LIKE '%normal%' THEN 'amarillo'
  ELSE 'verde'
END
WHERE color IS NULL;
