-- Run after setting Vault whatsapp_inbound_url and whatsapp_dispatcher_secret.
-- Reuses supabase_anon_key or anon_key when present.
-- whatsapp_inbound_url = https://<your-project>.supabase.co/functions/v1/whatsapp-webhook?worker=1
-- No hard-coded project: never schedule another environment's worker.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
do $$
declare
 missing text;
begin
 if to_regprocedure('public.whatsapp_claim_inbound()') is null then
   raise exception 'Apply the durable WhatsApp inbound migration before scheduling its worker';
 end if;
 select string_agg(required.name, ', ' order by required.name) into missing
   from unnest(array['whatsapp_inbound_url', 'whatsapp_dispatcher_secret']) required(name)
   where not exists (
     select 1 from vault.decrypted_secrets secret
     where secret.name = required.name and nullif(btrim(secret.decrypted_secret), '') is not null
   );
 if missing is not null then
   raise exception 'Missing Vault configuration: %', missing;
 end if;
 if exists(select 1 from cron.job where jobname='whatsapp-inbound-worker') then perform cron.unschedule('whatsapp-inbound-worker'); end if;
end $$;
select cron.schedule('whatsapp-inbound-worker','* * * * *',$cron$
 with settings as (
   select
     (select btrim(decrypted_secret) from vault.decrypted_secrets
       where name='whatsapp_inbound_url' limit 1) as url,
     (select decrypted_secret from vault.decrypted_secrets
       where name='whatsapp_dispatcher_secret' limit 1) as dispatcher_secret,
     (select nullif(btrim(decrypted_secret), '') from vault.decrypted_secrets
       where name in ('supabase_anon_key','anon_key') and nullif(btrim(decrypted_secret), '') is not null
       order by case when name='supabase_anon_key' then 0 else 1 end limit 1) as anon_key
 )
 select net.http_post(
   url := settings.url,
   headers := jsonb_strip_nulls(jsonb_build_object(
     'Content-Type', 'application/json',
     'x-dispatcher-secret', settings.dispatcher_secret,
     'apikey', settings.anon_key,
     'Authorization', 'Bearer ' || settings.anon_key
   )),
   body := '{}'::jsonb,
   timeout_milliseconds := 120000
 )
 from settings
 where exists (
   select 1 from public.whatsapp_inbound_jobs
   where (status='pending' and available_at<=now()) or (status='processing' and lease_until<now())
 );
$cron$);
