-- =============================================================================
-- Fix inmediato: column "lider_id" does not exist (acciones_equipo)
-- Ejecutar en SQL Editor del proyecto afectado (DEV/PROD).
-- =============================================================================

ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS lider_id uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT;

UPDATE public.acciones_equipo
SET lider_id = COALESCE(lider_id, creado_por, asignado_a)
WHERE lider_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.acciones_equipo WHERE lider_id IS NULL) THEN
    RAISE EXCEPTION 'Quedan filas sin lider_id; no se puede poner NOT NULL.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acciones_equipo'
      AND column_name = 'lider_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.acciones_equipo ALTER COLUMN lider_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acciones_equipo_lider_area
  ON public.acciones_equipo (lider_id, area_id);

-- Verificación
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'acciones_equipo'
  AND column_name = 'lider_id';
