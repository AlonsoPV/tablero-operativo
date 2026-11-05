-- El gateway de Edge exige Authorization/apikey aunque verify_jwt=false.
-- Vault:
--   whatsapp_dispatcher_secret  = WHATSAPP_DISPATCHER_SECRET (Edge)
--   supabase_anon_key           = anon public del proyecto (opcional pero recomendado)

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
    url := 'https://xhpasmjzuwifmjhrsumb.supabase.co/functions/v1/whatsapp-followup-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name IN ('supabase_anon_key', 'anon_key')
          LIMIT 1
        ),
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'whatsapp_dispatcher_secret'
          LIMIT 1
        ),
        ''
      ),
      'apikey', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name IN ('supabase_anon_key', 'anon_key')
          LIMIT 1
        ),
        ''
      ),
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
