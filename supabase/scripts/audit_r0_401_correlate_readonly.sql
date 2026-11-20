-- R0 · correlación 401. Inspección previa a PROD. BEGIN READ ONLY. Solo SELECT.
-- Lee cron.command solo para booleanos; no lo exporta. No content HTTP ni payloads.
-- No cambia el dispatcher. El conteo de followups es el volumen de riesgo si se reautentica.
begin read only;

select jobid, jobname, active, schedule,
       command ~* 'whatsapp-followup-dispatcher' as posts_to_dispatcher,
       command ~* 'whatsapp-webhook' as posts_to_webhook,
       command ~* 'worker=1' as webhook_worker_query,
       command ~* 'paste_anon_key' as has_unreplaced_placeholder,
       command ~* 'x-dispatcher-secret' as has_dispatcher_header
from cron.job
where jobname in ('whatsapp-followup-dispatcher', 'whatsapp-inbound-worker');

select id as http_request_id, status_code, created,
       headers ->> 'x-deno-execution-id' as edge_execution_id,
       headers ->> 'sb-error-code' as gateway_error_code,
       headers ->> 'x-whatsapp-auth-layer' as declared_auth_layer
from net._http_response
where status_code in (401, 403, 503)
order by created desc
limit 20;

select status, count(*)::int as n
from public.whatsapp_followup_jobs
group by status
order by status;

select status, count(*)::int as n
from public.whatsapp_inbound_jobs
group by status
order by status;

commit;
