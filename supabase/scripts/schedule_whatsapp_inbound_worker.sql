-- Run after setting Vault whatsapp_inbound_url, whatsapp_dispatcher_secret and supabase_anon_key.
-- whatsapp_inbound_url = https://<your-project>.supabase.co/functions/v1/whatsapp-webhook?worker=1
-- No hard-coded project: never schedule another environment's worker.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
do $$ begin
 if exists(select 1 from cron.job where jobname='whatsapp-inbound-worker') then perform cron.unschedule('whatsapp-inbound-worker'); end if;
end $$;
select cron.schedule('whatsapp-inbound-worker','* * * * *',$cron$
 select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='whatsapp_inbound_url' limit 1),
 headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key' limit 1),'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key' limit 1),'x-dispatcher-secret',(select decrypted_secret from vault.decrypted_secrets where name='whatsapp_dispatcher_secret' limit 1)), body := '{}'::jsonb,timeout_milliseconds:=120000)
 where exists(select 1 from public.whatsapp_inbound_jobs where status='pending' and available_at<=now() or status='processing' and lease_until<now());
$cron$);
