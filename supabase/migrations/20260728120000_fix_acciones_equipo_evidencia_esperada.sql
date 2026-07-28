-- Fix: acciones_equipo pudo existir antes sin evidencia_esperada / evidencia_requerida
-- (CREATE TABLE IF NOT EXISTS no añade columnas). El RPC team_kanban_create_action las inserta.

ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS evidencia_requerida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidencia_esperada text;

COMMENT ON COLUMN public.acciones_equipo.evidencia_requerida IS
  'Indica si la accion de equipo exige evidencia al cerrar.';
COMMENT ON COLUMN public.acciones_equipo.evidencia_esperada IS
  'Texto libre del tipo de evidencia esperada (alineado a acciones_diarias).';

NOTIFY pgrst, 'reload schema';
