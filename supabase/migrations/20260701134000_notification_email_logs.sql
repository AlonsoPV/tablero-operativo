CREATE TABLE IF NOT EXISTS public.notification_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  notification_id uuid NULL REFERENCES public.notificaciones(id) ON DELETE SET NULL,
  usuario_id uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo text NULL,
  prioridad text NULL,
  email text NULL,
  provider text NULL,
  provider_account text NULL,
  email_id text NULL,
  status text NOT NULL,
  reason text NULL,
  error_message text NULL,
  payload jsonb NULL,
  CONSTRAINT notification_email_logs_status_check CHECK (
    status IN (
      'sent',
      'skipped_inactive',
      'skipped_no_email',
      'recipient_lookup_error',
      'provider_error',
      'invalid_request',
      'server_config_error'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_email_logs_created_at
  ON public.notification_email_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_email_logs_usuario_created
  ON public.notification_email_logs (usuario_id, created_at DESC);

ALTER TABLE public.notification_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_email_logs_select_managers ON public.notification_email_logs;
CREATE POLICY notification_email_logs_select_managers
  ON public.notification_email_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.user_id = auth.uid()
        AND lower(trim(u.rol)) IN ('super_admin', 'direccion', 'dirección', 'dg', 'sistemas')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.app_role = 'super_admin'
    )
  );

GRANT SELECT ON public.notification_email_logs TO authenticated;
