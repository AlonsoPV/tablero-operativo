-- Diario de Guía: reporte ejecutivo y trabajo creado en la sesión.

ALTER TABLE public.guide_journal_entries
  ADD COLUMN IF NOT EXISTS executive_report text,
  ADD COLUMN IF NOT EXISTS created_work jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.guide_journal_entries.executive_report IS
  'Reporte ejecutivo generado al cerrar la sesion de Guia.';
COMMENT ON COLUMN public.guide_journal_entries.created_work IS
  'Acciones e iniciativas creadas durante o al cerrar la sesion.';
