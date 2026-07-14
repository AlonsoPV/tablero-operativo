-- Reparación Kanban por Equipos: asegurar columna lider_id y dependencias.
-- Causa típica: acciones_equipo ya existía sin lider_id y CREATE TABLE IF NOT EXISTS
-- no agregó la columna, luego fallan funciones/índices que la referencian.

-- 1) Columna lider_id
ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS lider_id uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT;

-- 2) Backfill: lider = creado_por cuando falte (antes de NOT NULL)
UPDATE public.acciones_equipo
SET lider_id = creado_por
WHERE lider_id IS NULL
  AND creado_por IS NOT NULL;

-- Si aún hay nulos (sin creado_por), intentar con asignado_a
UPDATE public.acciones_equipo
SET lider_id = asignado_a
WHERE lider_id IS NULL
  AND asignado_a IS NOT NULL;

-- 3) NOT NULL solo si ya no quedan nulos
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.acciones_equipo
    WHERE lider_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'No se pudo backfillear lider_id en acciones_equipo; hay filas sin lider_id/creado_por/asignado_a';
  END IF;

  -- Enforce NOT NULL si la columna aún es nullable
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acciones_equipo'
      AND column_name = 'lider_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ALTER COLUMN lider_id SET NOT NULL;
  END IF;
END $$;

-- 4) Índice
CREATE INDEX IF NOT EXISTS idx_acciones_equipo_lider_area
  ON public.acciones_equipo (lider_id, area_id);

-- 5) Recrear helper que falla si falta la columna (idempotente)
CREATE OR REPLACE FUNCTION public.team_kanban_can_view(
  p_action public.acciones_equipo,
  p_auth_user uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.team_kanban_is_admin(p_auth_user)
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.user_id = p_auth_user AND u.id = p_action.lider_id
    )
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.user_id = p_auth_user
        AND (u.id = p_action.asignado_a OR u.id = p_action.creado_por)
    );
$$;

COMMENT ON COLUMN public.acciones_equipo.lider_id IS
  'Líder propietario de la acción (equipo). Separación multi-lider por área.';
