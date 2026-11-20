-- NO USAR. En PROD se pegó sin sustituir PASTE_ANON_KEY y el literal
-- queda en cron.command (401 cada minuto). Corrección: fix_whatsapp_dispatcher_cron_vault.sql
-- tras autorización (docs/agent/r0-401-rca.md).
--
-- Histórico: se pedía reemplazar PASTE_ANON_KEY por la anon public.
-- Sintoma: whatsapp-followup-dispatcher logs → 401 cada minuto.

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
      'Authorization', 'Bearer PASTE_ANON_KEY',
      'apikey', 'PASTE_ANON_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
