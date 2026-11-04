-- Cron cada minuto → whatsapp-followup-dispatcher (project-ref DEV).
-- Prod: cambiar URL a https://xhpasmjzuwifmjhrsumb.supabase.co/functions/v1/whatsapp-followup-dispatcher
-- Secreto Vault opcional: whatsapp_dispatcher_secret (= WHATSAPP_DISPATCHER_SECRET).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-followup-dispatcher') THEN
    PERFORM cron.unschedule('whatsapp-followup-dispatcher');
  END IF;
END $$;

SELECT cron.schedule(
  'whatsapp-followup-dispatcher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgiuevzlyptzlfgxsfhj.supabase.co/functions/v1/whatsapp-followup-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatcher-secret', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'whatsapp_dispatcher_secret'
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
  'Usado tambien para whatsapp-followup-dispatcher cada minuto.';
