-- Scheduler para Resumen diario de acciones.
-- Requiere crear previamente en Vault un secreto llamado:
-- daily_action_summary_cron_secret
-- con el mismo valor que DAILY_ACTION_SUMMARY_CRON_SECRET en Edge Functions.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-action-summary-dispatch') THEN
    PERFORM cron.unschedule('daily-action-summary-dispatch');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-action-summary-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xhpasmjzuwifmjhrsumb.supabase.co/functions/v1/daily-action-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'daily_action_summary_cron_secret'
          LIMIT 1
        ),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS
  'Usado para ejecutar daily-action-summary cada 5 minutos; la funcion valida hora/dia y evita duplicados.';
