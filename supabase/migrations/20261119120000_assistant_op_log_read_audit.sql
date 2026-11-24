-- R1 · ID-05: permite registrar consultas del agente (result = 'read') en assistant_op_log.
-- Sólo amplía el CHECK; no cambia RLS (insert/select del propio usuario) ni grants.
-- Preparada localmente; no aplicar en remoto sin autorización del ciclo de integración.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'assistant_op_log'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%result%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.assistant_op_log DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.assistant_op_log
  ADD CONSTRAINT assistant_op_log_result_check
  CHECK (result IN ('proposed', 'executed', 'cancelled', 'denied', 'conflict', 'error', 'expired', 'read'));

COMMENT ON COLUMN public.assistant_op_log.result IS
  'Resultado de la operación. read = consulta del agente (sin contenido; resumen JSON con canal, intención, alcance y estado).';
