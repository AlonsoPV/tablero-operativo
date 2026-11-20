-- NO EJECUTAR hasta autorización expresa (docs/agent/r0-401-rca.md).
-- Reprograma solo whatsapp-followup-dispatcher con Vault (cuerpo = 20261104140000).
-- Idempotente: unschedule por nombre + schedule. No toca whatsapp-inbound-worker.
-- No uses fix_whatsapp_dispatcher_cron_anon.sql (deja el literal PASTE_ANON_KEY).
-- Rollback: SELECT cron.unschedule('whatsapp-followup-dispatcher');
-- Riesgo: al autenticar, el dispatcher enviará followups pending (hasta 20/min).

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
