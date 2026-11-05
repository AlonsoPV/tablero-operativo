-- Pegar en SQL Editor de Scrumban PROD (xhpasmjzuwifmjhrsumb).
-- Reemplaza PASTE_ANON_KEY con la anon public del proyecto
-- (Settings → API → anon public, o VITE_SUPABASE_ANON_KEY).
--
-- Sintoma: whatsapp-followup-dispatcher logs → 401 cada minuto.
-- Causa: cron sin Authorization/apikey (Vault vacío).

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
