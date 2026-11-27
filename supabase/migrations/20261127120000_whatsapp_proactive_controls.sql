-- P1 seguimiento proactivo: consentimiento, dedupe y kill switch.
-- Envíos automáticos permanecen OFF (proactive_enabled DEFAULT false).
-- Rollback: DROP TABLE public.whatsapp_proactive_sent_log, public.whatsapp_proactive_preferences;
--           ALTER TABLE public.whatsapp_followup_settings DROP COLUMN IF EXISTS proactive_enabled;

ALTER TABLE public.whatsapp_followup_settings
  ADD COLUMN IF NOT EXISTS proactive_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.whatsapp_proactive_preferences (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  consent boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  window_start_hour smallint NOT NULL DEFAULT 8 CHECK (window_start_hour >= 0 AND window_start_hour <= 23),
  window_end_hour smallint NOT NULL DEFAULT 19 CHECK (window_end_hour >= 1 AND window_end_hour <= 24),
  allowed_weekdays smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
  enabled_categories text[] NOT NULL DEFAULT ARRAY[
    'overdue_alert',
    'stale_blocker',
    'pending_verification',
    'daily_summary'
  ],
  max_per_day smallint NOT NULL DEFAULT 3 CHECK (max_per_day >= 0 AND max_per_day <= 12),
  min_interval_minutes integer NOT NULL DEFAULT 180 CHECK (min_interval_minutes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_proactive_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_proactive_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_proactive_preferences TO authenticated;
GRANT ALL ON TABLE public.whatsapp_proactive_preferences TO service_role;

DROP POLICY IF EXISTS whatsapp_proactive_preferences_owner_rw ON public.whatsapp_proactive_preferences;
CREATE POLICY whatsapp_proactive_preferences_owner_rw
  ON public.whatsapp_proactive_preferences
  FOR ALL
  TO authenticated
  USING (usuario_id = (SELECT public.get_my_usuario_id()) AND (SELECT public.okr_active_user()))
  WITH CHECK (usuario_id = (SELECT public.get_my_usuario_id()) AND (SELECT public.okr_active_user()));

CREATE TABLE IF NOT EXISTS public.whatsapp_proactive_sent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'dry_run',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_proactive_sent_log_dedupe UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_proactive_sent_log_user_day
  ON public.whatsapp_proactive_sent_log (usuario_id, created_at DESC);

ALTER TABLE public.whatsapp_proactive_sent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_proactive_sent_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_proactive_sent_log TO service_role;
