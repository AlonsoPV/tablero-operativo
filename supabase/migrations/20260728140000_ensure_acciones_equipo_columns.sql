-- La tabla acciones_equipo se creó con CREATE TABLE IF NOT EXISTS, así que en
-- entornos donde ya existía nunca recibió las columnas nuevas del modulo
-- (lider_id, evidencia_*, story_points, tipo_accion, gap_ids...).
-- Este script deja la tabla completa segun el modelo del Kanban por Equipos.

ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS prioridad text NOT NULL DEFAULT 'Media',
  ADD COLUMN IF NOT EXISTS lider_id uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS fecha_limite timestamptz,
  ADD COLUMN IF NOT EXISTS evidencia_requerida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidencia_esperada text,
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS story_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_accion text NOT NULL DEFAULT 'operativa',
  ADD COLUMN IF NOT EXISTS gap_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS catalog_kpi_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS bloqueada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accion_corporativa_id uuid REFERENCES public.acciones_diarias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_prioridad_check'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_prioridad_check
      CHECK (prioridad IN ('Baja','Media','Alta','Critica'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_checklist_array_check'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_checklist_array_check
      CHECK (jsonb_typeof(checklist) = 'array');
  END IF;
END
$do$;

UPDATE public.acciones_equipo
SET lider_id = coalesce(lider_id, creado_por, asignado_a)
WHERE lider_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_acciones_equipo_lider_area
  ON public.acciones_equipo (lider_id, area_id);
CREATE INDEX IF NOT EXISTS idx_acciones_equipo_fecha_limite
  ON public.acciones_equipo (fecha_limite) WHERE completed_at IS NULL;

NOTIFY pgrst, 'reload schema';
