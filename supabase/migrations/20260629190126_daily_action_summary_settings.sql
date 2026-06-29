-- Resumen diario de acciones: configuracion y trazabilidad de envios.

CREATE TABLE IF NOT EXISTS public.daily_action_summary_settings (
  id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT false,
  send_time time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  send_days text NOT NULL DEFAULT 'weekdays',
  recipient_mode text NOT NULL DEFAULT 'all_active',
  selected_usuario_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  send_if_no_pending boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  last_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT daily_action_summary_settings_singleton CHECK (id = 'default'),
  CONSTRAINT daily_action_summary_settings_send_days CHECK (
    send_days IN ('weekdays', 'mon_sat', 'every_day')
  ),
  CONSTRAINT daily_action_summary_settings_recipient_mode CHECK (
    recipient_mode IN ('all_active', 'leaders', 'selected')
  ),
  CONSTRAINT daily_action_summary_settings_last_status CHECK (
    last_status IS NULL OR last_status IN (
      'ok',
      'sent',
      'partial_error',
      'skipped_disabled',
      'skipped_schedule',
      'config_error',
      'error'
    )
  )
);

INSERT INTO public.daily_action_summary_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.daily_action_summary_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  settings_id text NOT NULL DEFAULT 'default' REFERENCES public.daily_action_summary_settings(id) ON DELETE CASCADE,
  execution_started_at timestamptz NOT NULL DEFAULT now(),
  target_date date NOT NULL,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  email text,
  status text NOT NULL,
  error_message text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  email_id text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_action_summary_logs_status CHECK (
    status IN (
      'sent',
      'omitted_no_pending',
      'skipped_no_email',
      'skipped_inactive',
      'skipped_not_recipient',
      'skipped_duplicate',
      'config_error',
      'error'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_daily_action_summary_logs_created_at
  ON public.daily_action_summary_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_action_summary_logs_usuario_date
  ON public.daily_action_summary_logs (usuario_id, target_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_action_summary_logs_no_duplicate_daily
  ON public.daily_action_summary_logs (settings_id, usuario_id, target_date)
  WHERE is_test = false
    AND usuario_id IS NOT NULL
    AND status IN ('sent', 'omitted_no_pending', 'skipped_no_email', 'skipped_inactive');

ALTER TABLE public.daily_action_summary_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_action_summary_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_action_summary_settings_select_managers ON public.daily_action_summary_settings;
CREATE POLICY daily_action_summary_settings_select_managers
  ON public.daily_action_summary_settings
  FOR SELECT TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS daily_action_summary_settings_insert_managers ON public.daily_action_summary_settings;
CREATE POLICY daily_action_summary_settings_insert_managers
  ON public.daily_action_summary_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS daily_action_summary_settings_update_managers ON public.daily_action_summary_settings;
CREATE POLICY daily_action_summary_settings_update_managers
  ON public.daily_action_summary_settings
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS daily_action_summary_logs_select_managers ON public.daily_action_summary_logs;
CREATE POLICY daily_action_summary_logs_select_managers
  ON public.daily_action_summary_logs
  FOR SELECT TO authenticated
  USING (public.can_manage_catalogs());

GRANT SELECT, INSERT, UPDATE ON public.daily_action_summary_settings TO authenticated;
GRANT SELECT ON public.daily_action_summary_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.set_daily_action_summary_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.id := 'default';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_daily_action_summary_settings_updated_at ON public.daily_action_summary_settings;
CREATE TRIGGER set_daily_action_summary_settings_updated_at
  BEFORE INSERT OR UPDATE ON public.daily_action_summary_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_daily_action_summary_settings_updated_at();

COMMENT ON TABLE public.daily_action_summary_settings IS
  'Configuracion singleton del Resumen diario de acciones.';

COMMENT ON TABLE public.daily_action_summary_logs IS
  'Bitacora de ejecuciones y envios del Resumen diario de acciones.';

NOTIFY pgrst, 'reload schema';
