-- Stable internal key for action statuses. `nombre` remains the editable visible label.
ALTER TABLE public.statuses
  ADD COLUMN IF NOT EXISTS estado_key text;

UPDATE public.statuses
SET estado_key = CASE
  WHEN lower(trim(nombre)) IN ('pendiente') THEN 'Pendiente'
  WHEN lower(trim(nombre)) IN ('hoy') THEN 'Hoy'
  WHEN lower(trim(nombre)) IN ('en_ejecucion', 'en ejecucion', 'en ejecución') THEN 'En_Ejecucion'
  WHEN lower(trim(nombre)) IN ('bloqueado') THEN 'Bloqueado'
  WHEN lower(trim(nombre)) IN ('retraso') THEN 'Retraso'
  WHEN lower(trim(nombre)) IN ('hecho') THEN 'Hecho'
  WHEN lower(trim(nombre)) IN ('verificado') THEN 'Verificado'
  WHEN orden = 6 AND es_cierre IS TRUE THEN 'Hecho'
  WHEN orden = 7 AND es_cierre IS TRUE THEN 'Verificado'
  ELSE estado_key
END
WHERE estado_key IS NULL;

ALTER TABLE public.statuses
  DROP CONSTRAINT IF EXISTS chk_statuses_estado_key;

ALTER TABLE public.statuses
  ADD CONSTRAINT chk_statuses_estado_key
  CHECK (
    estado_key IS NULL OR estado_key IN (
      'Pendiente',
      'Hoy',
      'En_Ejecucion',
      'Bloqueado',
      'Retraso',
      'Hecho',
      'Verificado'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_statuses_estado_key_unique
  ON public.statuses (estado_key)
  WHERE estado_key IS NOT NULL;

COMMENT ON COLUMN public.statuses.estado_key IS
  'Stable internal action status key. UI labels/colors/order come from catalog fields.';
