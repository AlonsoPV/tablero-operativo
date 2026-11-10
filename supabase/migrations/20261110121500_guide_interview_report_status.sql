-- Estado del informe de una entrevista Retell y liga que la abrio.
-- No modifica filas historicas: report_status queda null en sesiones anteriores.

ALTER TABLE public.guide_sessions
  ADD COLUMN IF NOT EXISTS guide_link_id uuid REFERENCES public.guide_user_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS report_status text,
  ADD COLUMN IF NOT EXISTS report_error text;

ALTER TABLE public.guide_sessions
  DROP CONSTRAINT IF EXISTS guide_sessions_report_status_chk;

ALTER TABLE public.guide_sessions
  ADD CONSTRAINT guide_sessions_report_status_chk
  CHECK (
    report_status IS NULL
    OR report_status IN ('pending', 'processing', 'ready', 'failed', 'insufficient')
  );

CREATE INDEX IF NOT EXISTS guide_sessions_provider_call
  ON public.guide_sessions (provider_session_id)
  WHERE provider_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guide_sessions_link
  ON public.guide_sessions (guide_link_id)
  WHERE guide_link_id IS NOT NULL;

COMMENT ON COLUMN public.guide_sessions.report_status IS
  'pending, processing, ready, failed o insufficient. Null en sesiones anteriores a este flujo.';

NOTIFY pgrst, 'reload schema';
