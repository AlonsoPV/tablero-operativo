-- WhatsApp Cloud API: canal, identidad, settings, jobs, result requests.
-- Extiende las tablas de canal Telegram para permitir channel = 'whatsapp'.

-- ---------------------------------------------------------------------------
-- 1) Ampliar CHECKs de canal
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_channel_identities
  DROP CONSTRAINT IF EXISTS user_channel_identities_channel_chk;
ALTER TABLE public.user_channel_identities
  ADD CONSTRAINT user_channel_identities_channel_chk
  CHECK (channel IN ('telegram', 'whatsapp'));

ALTER TABLE public.action_delivery_log
  DROP CONSTRAINT IF EXISTS action_delivery_log_channel_chk;
ALTER TABLE public.action_delivery_log
  ADD CONSTRAINT action_delivery_log_channel_chk
  CHECK (channel IN ('telegram', 'whatsapp'));

ALTER TABLE public.external_inbound_messages
  DROP CONSTRAINT IF EXISTS external_inbound_messages_channel_chk;
ALTER TABLE public.external_inbound_messages
  ADD CONSTRAINT external_inbound_messages_channel_chk
  CHECK (channel IN ('telegram', 'whatsapp'));

-- Delivery log: corporativo y/o equipos
ALTER TABLE public.action_delivery_log
  ALTER COLUMN accion_id DROP NOT NULL;

ALTER TABLE public.action_delivery_log
  ADD COLUMN IF NOT EXISTS team_action_id uuid REFERENCES public.acciones_equipo(id) ON DELETE CASCADE;

ALTER TABLE public.action_delivery_log
  DROP CONSTRAINT IF EXISTS action_delivery_log_target_chk;
ALTER TABLE public.action_delivery_log
  ADD CONSTRAINT action_delivery_log_target_chk
  CHECK (accion_id IS NOT NULL OR team_action_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_action_delivery_log_team_action
  ON public.action_delivery_log(team_action_id)
  WHERE team_action_id IS NOT NULL;

ALTER TABLE public.external_inbound_messages
  ADD COLUMN IF NOT EXISTS team_action_id uuid REFERENCES public.acciones_equipo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_external_inbound_messages_team_action
  ON public.external_inbound_messages(team_action_id, created_at DESC)
  WHERE team_action_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) RPC identity WhatsApp
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_upsert_whatsapp_identity(
  p_usuario_id uuid,
  p_phone text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  clean_phone text;
BEGIN
  IF NOT (
    public.has_business_role('super_admin')
    OR public.is_app_admin()
    OR public.is_business_admin()
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden vincular WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');

  IF p_usuario_id IS NULL OR clean_phone IS NULL OR length(clean_phone) < 10 OR length(clean_phone) > 15 THEN
    RAISE EXCEPTION 'Usuario y telefono E.164 (10-15 digitos, sin +) son requeridos.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = p_usuario_id AND u.activo = true
  ) THEN
    RAISE EXCEPTION 'Usuario destino no encontrado o inactivo.'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.user_channel_identities (
    usuario_id,
    channel,
    external_user_id,
    external_chat_id,
    display_name,
    status,
    verified_at,
    last_seen_at,
    metadata
  )
  VALUES (
    p_usuario_id,
    'whatsapp',
    clean_phone,
    clean_phone,
    NULLIF(btrim(COALESCE(p_display_name, '')), ''),
    'active',
    now(),
    now(),
    jsonb_build_object('linked_by', public.get_my_usuario_id(), 'source', 'admin_manual')
  )
  ON CONFLICT (channel, usuario_id)
  DO UPDATE SET
    external_user_id = EXCLUDED.external_user_id,
    external_chat_id = EXCLUDED.external_chat_id,
    display_name = EXCLUDED.display_name,
    status = 'active',
    verified_at = COALESCE(public.user_channel_identities.verified_at, now()),
    last_seen_at = now(),
    metadata = public.user_channel_identities.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION public.admin_upsert_whatsapp_identity(uuid, text, text) IS
  'Vincula telefono WhatsApp (solo digitos) a un usuario. Solo admins.';

GRANT EXECUTE ON FUNCTION public.admin_upsert_whatsapp_identity(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Settings de follow-up / plantillas de texto
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_followup_settings (
  id text PRIMARY KEY DEFAULT 'default',
  followup_delay_minutes integer NOT NULL DEFAULT 5,
  followups_per_day integer NOT NULL DEFAULT 1,
  initial_text_template text NOT NULL DEFAULT
    'Hola {{responsable_nombre}}. Nueva actividad: {{titulo_accion}}. Compromiso: {{fecha_compromiso}}.{{checklist_bloque}}',
  checkpoint_followup_template text NOT NULL DEFAULT
    'Seguimiento: {{titulo_accion}}. Checkpoint: {{checkpoint_texto}}. Responde con el boton correspondiente.',
  commitment_close_template text NOT NULL DEFAULT
    'Cierre de compromiso: {{titulo_accion}}. Fecha: {{fecha_compromiso}}. Gracias.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_followup_settings_singleton CHECK (id = 'default'),
  CONSTRAINT whatsapp_followup_settings_delay_chk CHECK (followup_delay_minutes BETWEEN 1 AND 240),
  CONSTRAINT whatsapp_followup_settings_per_day_chk CHECK (followups_per_day BETWEEN 0 AND 12)
);

INSERT INTO public.whatsapp_followup_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_whatsapp_followup_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_whatsapp_followup_settings_updated_at ON public.whatsapp_followup_settings;
CREATE TRIGGER set_whatsapp_followup_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_followup_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_followup_settings_updated_at();

ALTER TABLE public.whatsapp_followup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_followup_settings_select_managers ON public.whatsapp_followup_settings;
CREATE POLICY whatsapp_followup_settings_select_managers
  ON public.whatsapp_followup_settings
  FOR SELECT TO authenticated
  USING (public.is_app_admin() OR public.is_business_admin());

DROP POLICY IF EXISTS whatsapp_followup_settings_update_managers ON public.whatsapp_followup_settings;
CREATE POLICY whatsapp_followup_settings_update_managers
  ON public.whatsapp_followup_settings
  FOR UPDATE TO authenticated
  USING (public.is_app_admin() OR public.is_business_admin())
  WITH CHECK (public.is_app_admin() OR public.is_business_admin());

GRANT SELECT, UPDATE ON public.whatsapp_followup_settings TO authenticated;
GRANT ALL ON public.whatsapp_followup_settings TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Result requests (evidencia tras "Realizada")
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_result_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  wa_id text NOT NULL,
  scope text NOT NULL DEFAULT 'corporate',
  accion_id uuid REFERENCES public.acciones_diarias(id) ON DELETE CASCADE,
  team_action_id uuid REFERENCES public.acciones_equipo(id) ON DELETE CASCADE,
  checkpoint_id uuid REFERENCES public.accion_checkpoints(id) ON DELETE SET NULL,
  checklist_index integer,
  status text NOT NULL DEFAULT 'waiting',
  delivery_log_id uuid REFERENCES public.action_delivery_log(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  CONSTRAINT whatsapp_result_requests_scope_chk CHECK (scope IN ('corporate', 'team')),
  CONSTRAINT whatsapp_result_requests_status_chk CHECK (status IN ('waiting', 'received', 'expired')),
  CONSTRAINT whatsapp_result_requests_target_chk CHECK (
    (scope = 'corporate' AND accion_id IS NOT NULL)
    OR (scope = 'team' AND team_action_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_result_requests_waiting
  ON public.whatsapp_result_requests(wa_id, status, created_at DESC)
  WHERE status = 'waiting';

ALTER TABLE public.whatsapp_result_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_result_requests_select_own_or_admin ON public.whatsapp_result_requests;
CREATE POLICY whatsapp_result_requests_select_own_or_admin
  ON public.whatsapp_result_requests
  FOR SELECT TO authenticated
  USING (
    usuario_id = public.get_my_usuario_id()
    OR public.is_app_admin()
    OR public.is_business_admin()
  );

GRANT SELECT ON public.whatsapp_result_requests TO authenticated;
GRANT ALL ON public.whatsapp_result_requests TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Follow-up jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_followup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'corporate',
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  wa_id text NOT NULL,
  accion_id uuid REFERENCES public.acciones_diarias(id) ON DELETE CASCADE,
  checkpoint_id uuid REFERENCES public.accion_checkpoints(id) ON DELETE CASCADE,
  team_action_id uuid REFERENCES public.acciones_equipo(id) ON DELETE CASCADE,
  checklist_index integer,
  status text NOT NULL DEFAULT 'pending',
  scheduled_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_followup_jobs_scope_chk CHECK (scope IN ('corporate', 'team')),
  CONSTRAINT whatsapp_followup_jobs_status_chk CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'canceled')
  ),
  CONSTRAINT whatsapp_followup_jobs_target_chk CHECK (
    (scope = 'corporate' AND accion_id IS NOT NULL AND checkpoint_id IS NOT NULL)
    OR (scope = 'team' AND team_action_id IS NOT NULL AND checklist_index IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_followup_jobs_due
  ON public.whatsapp_followup_jobs(status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_whatsapp_followup_jobs_accion
  ON public.whatsapp_followup_jobs(accion_id)
  WHERE accion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_followup_jobs_team
  ON public.whatsapp_followup_jobs(team_action_id)
  WHERE team_action_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_whatsapp_followup_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_whatsapp_followup_jobs_updated_at ON public.whatsapp_followup_jobs;
CREATE TRIGGER set_whatsapp_followup_jobs_updated_at
  BEFORE UPDATE ON public.whatsapp_followup_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_followup_jobs_updated_at();

ALTER TABLE public.whatsapp_followup_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_followup_jobs_select_own_or_admin ON public.whatsapp_followup_jobs;
CREATE POLICY whatsapp_followup_jobs_select_own_or_admin
  ON public.whatsapp_followup_jobs
  FOR SELECT TO authenticated
  USING (
    usuario_id = public.get_my_usuario_id()
    OR public.is_app_admin()
    OR public.is_business_admin()
  );

GRANT SELECT ON public.whatsapp_followup_jobs TO authenticated;
GRANT ALL ON public.whatsapp_followup_jobs TO service_role;

NOTIFY pgrst, 'reload schema';
