-- Piloto: modo interview_full_read (lectura organizacional, sin escritura).

ALTER TABLE public.guide_user_links
  DROP CONSTRAINT IF EXISTS guide_user_links_access_mode_chk;

ALTER TABLE public.guide_user_links
  ADD CONSTRAINT guide_user_links_access_mode_chk
  CHECK (access_mode IN ('read', 'propose', 'interview_full_read'));

ALTER TABLE public.guide_sessions
  DROP CONSTRAINT IF EXISTS guide_sessions_access_mode_chk;

ALTER TABLE public.guide_sessions
  ADD CONSTRAINT guide_sessions_access_mode_chk
  CHECK (access_mode IN ('read', 'propose', 'interview_full_read'));

COMMENT ON COLUMN public.guide_user_links.access_mode IS
  'read = consulta segun rol; interview_full_read = lectura org (piloto); propose = tambien propuestas.';

COMMENT ON COLUMN public.guide_sessions.access_mode IS
  'Modo efectivo de la entrevista. interview_full_read = lectura organizacional sin escritura.';

-- Ligas personales activas: elevacion de piloto (reversible cambiando la columna o el env).
UPDATE public.guide_user_links
SET access_mode = 'interview_full_read', updated_at = now()
WHERE status = 'active'
  AND access_mode = 'read';

NOTIFY pgrst, 'reload schema';
