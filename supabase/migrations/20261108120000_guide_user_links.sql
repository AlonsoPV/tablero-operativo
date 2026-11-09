-- Ligas personales de Guía (token plano solo en URL; en DB solo SHA-256).

CREATE TABLE IF NOT EXISTS public.guide_user_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  replaced_by uuid REFERENCES public.guide_user_links(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guide_user_links_status_chk CHECK (
    status IN ('active', 'revoked', 'replaced', 'expired')
  ),
  CONSTRAINT guide_user_links_token_hash_uq UNIQUE (token_hash),
  CONSTRAINT guide_user_links_use_count_chk CHECK (use_count >= 0)
);

CREATE INDEX IF NOT EXISTS guide_user_links_usuario_created
  ON public.guide_user_links (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guide_user_links_active_expires
  ON public.guide_user_links (status, expires_at)
  WHERE status = 'active';

ALTER TABLE public.guide_user_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guide_user_links FROM PUBLIC, anon, authenticated;
-- Solo service role (Edge / API admin) lee y escribe.

COMMENT ON TABLE public.guide_user_links IS
  'Ligas personales Guía: token_hash SHA-256; el token plano nunca se persiste.';
