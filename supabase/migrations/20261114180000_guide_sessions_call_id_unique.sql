-- Un call_id de Retell identifica una sola sesion de entrevista.

CREATE UNIQUE INDEX IF NOT EXISTS guide_sessions_provider_session_id_uq
  ON public.guide_sessions (provider_session_id)
  WHERE provider_session_id IS NOT NULL;

COMMENT ON INDEX public.guide_sessions_provider_session_id_uq IS
  'Impide sesiones duplicadas para el mismo call_id de Retell.';

NOTIFY pgrst, 'reload schema';
