-- Avoid blocking action creation from older cached clients or long operational notes.
-- Keep only the minimum meaningful description length.

ALTER TABLE public.acciones_diarias
  DROP CONSTRAINT IF EXISTS chk_accion_descripcion_length;

ALTER TABLE public.acciones_diarias
  ADD CONSTRAINT chk_accion_descripcion_length
  CHECK (char_length(descripcion_accion) >= 10);

NOTIFY pgrst, 'reload schema';
