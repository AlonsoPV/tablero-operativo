-- Aplicar en SQL Editor del proyecto que usa la app (PROD o DEV).
-- Crea sesion, mensajes y diario de Guia.

-- Guía: acompañante reflexivo (chat texto 15 min + diario).
-- Voz Retell / pilares / ligas se agregan en migraciones posteriores.

CREATE TABLE IF NOT EXISTS public.guide_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'text',
  provider_session_id text,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guide_sessions_provider_chk CHECK (provider IN ('text', 'retell')),
  CONSTRAINT guide_sessions_status_chk CHECK (
    status IN ('active', 'closing', 'completed', 'abandoned', 'safety_ended')
  ),
  CONSTRAINT guide_sessions_clock_chk CHECK (expires_at <= started_at + interval '15 minutes')
);

CREATE UNIQUE INDEX IF NOT EXISTS guide_sessions_one_open_per_user
  ON public.guide_sessions (usuario_id)
  WHERE status IN ('active', 'closing');

CREATE INDEX IF NOT EXISTS guide_sessions_usuario_started
  ON public.guide_sessions (usuario_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.guide_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.guide_sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guide_messages_role_chk CHECK (role IN ('user', 'assistant')),
  CONSTRAINT guide_messages_content_chk CHECK (char_length(btrim(content)) BETWEEN 1 AND 8000),
  CONSTRAINT guide_messages_session_sequence_uq UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS guide_messages_session_seq
  ON public.guide_messages (session_id, sequence);

CREATE TABLE IF NOT EXISTS public.guide_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.guide_sessions(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  topic text,
  summary text,
  learning text,
  intention text,
  reflection_question text,
  user_words text,
  agent_inferences text,
  executive_report text,
  created_work jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_journal_usuario_created
  ON public.guide_journal_entries (usuario_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guide_protect_session_clock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'El reloj de la sesion Guia es inmutable';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guide_sessions_protect_clock ON public.guide_sessions;
CREATE TRIGGER guide_sessions_protect_clock
  BEFORE UPDATE ON public.guide_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guide_protect_session_clock();

ALTER TABLE public.guide_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guide_sessions_owner_all ON public.guide_sessions;
CREATE POLICY guide_sessions_owner_all ON public.guide_sessions
  FOR ALL TO authenticated
  USING (usuario_id = public.get_my_usuario_id())
  WITH CHECK (usuario_id = public.get_my_usuario_id());

DROP POLICY IF EXISTS guide_messages_owner_all ON public.guide_messages;
CREATE POLICY guide_messages_owner_all ON public.guide_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.guide_sessions s
      WHERE s.id = session_id AND s.usuario_id = public.get_my_usuario_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.guide_sessions s
      WHERE s.id = session_id AND s.usuario_id = public.get_my_usuario_id()
    )
  );

DROP POLICY IF EXISTS guide_journal_owner_all ON public.guide_journal_entries;
CREATE POLICY guide_journal_owner_all ON public.guide_journal_entries
  FOR ALL TO authenticated
  USING (usuario_id = public.get_my_usuario_id())
  WITH CHECK (usuario_id = public.get_my_usuario_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_journal_entries TO authenticated;

NOTIFY pgrst, 'reload schema';
