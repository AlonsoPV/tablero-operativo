-- Separa el estado tecnico del scheduler del ultimo envio real del resumen diario.

ALTER TABLE public.daily_action_summary_settings
  ADD COLUMN IF NOT EXISTS scheduler_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduler_last_status text,
  ADD COLUMN IF NOT EXISTS scheduler_last_message text;

ALTER TABLE public.daily_action_summary_settings
  DROP CONSTRAINT IF EXISTS daily_action_summary_settings_scheduler_last_status_check;

ALTER TABLE public.daily_action_summary_settings
  ADD CONSTRAINT daily_action_summary_settings_scheduler_last_status_check
  CHECK (
    scheduler_last_status IS NULL OR scheduler_last_status IN (
      'ok',
      'skipped_disabled',
      'skipped_schedule',
      'config_error',
      'error'
    )
  );

UPDATE public.daily_action_summary_settings
SET
  scheduler_last_checked_at = COALESCE(scheduler_last_checked_at, last_run_at, now()),
  scheduler_last_status = COALESCE(scheduler_last_status, last_status),
  scheduler_last_message = COALESCE(scheduler_last_message, last_message),
  last_run_at = NULL,
  last_status = NULL,
  last_message = NULL,
  last_counts = '{}'::jsonb
WHERE last_status IN ('skipped_disabled', 'skipped_schedule');

COMMENT ON COLUMN public.daily_action_summary_settings.scheduler_last_checked_at IS
  'Ultima vez que el scheduler reviso la configuracion, aunque no haya enviado correos.';

COMMENT ON COLUMN public.daily_action_summary_settings.scheduler_last_status IS
  'Estado tecnico de la ultima revision del scheduler; no reemplaza el ultimo envio real.';

COMMENT ON COLUMN public.daily_action_summary_settings.scheduler_last_message IS
  'Mensaje tecnico de la ultima revision del scheduler.';

NOTIFY pgrst, 'reload schema';
