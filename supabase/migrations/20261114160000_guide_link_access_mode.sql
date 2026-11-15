-- Invitaciones de voz: solo lectura por defecto; la sesion hereda el modo.

ALTER TABLE public.guide_user_links
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'read';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guide_user_links_access_mode_chk'
  ) THEN
    ALTER TABLE public.guide_user_links
      ADD CONSTRAINT guide_user_links_access_mode_chk
      CHECK (access_mode IN ('read', 'propose'));
  END IF;
END $$;

COMMENT ON COLUMN public.guide_user_links.access_mode IS
  'read = consultar tablero; propose = tambien encolar propuestas (no escritura directa). Default read.';

ALTER TABLE public.guide_sessions
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'propose';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guide_sessions_access_mode_chk'
  ) THEN
    ALTER TABLE public.guide_sessions
      ADD CONSTRAINT guide_sessions_access_mode_chk
      CHECK (access_mode IN ('read', 'propose'));
  END IF;
END $$;

COMMENT ON COLUMN public.guide_sessions.access_mode IS
  'Modo efectivo de la entrevista. Ligas personales suelen ser read; voz autenticada propose.';

-- Ligas ya existentes: solo lectura (mas estricto). Sesiones activas con liga → read.
UPDATE public.guide_sessions gs
SET access_mode = 'read'
WHERE gs.guide_link_id IS NOT NULL
  AND gs.access_mode IS DISTINCT FROM 'read';

NOTIFY pgrst, 'reload schema';
