-- Cierre R0 · auditoría PROD de solo lectura (401, P0001, RD-06)
-- Proyecto: xhpasmjzuwifmjhrsumb (SQL Editor, rol postgres o equivalente).
-- Revisar este archivo ANTES de ejecutarlo. No corre solo. No modifica datos.
-- Prohibido: INSERT/UPDATE/DELETE, POST al dispatcher, replay de jobs, db push, Vault.
-- No exportar: cron.command, Vault, tokens, payload, content HTTP, teléfonos, correos, cuerpos.
-- El script extendido (políticas/ACL) sigue en audit_agent_r0_readonly.sql; no hace falta para este cierre.

begin read only;

-- A1 · Dispatcher 401: metadatos de cron (sin el comando)
select jobid, jobname, active, schedule,
       position('x-dispatcher-secret' in command) > 0 as has_dispatcher_header,
       position('Authorization' in command) > 0 as has_authorization_header,
       position('apikey' in command) > 0 as has_apikey_header,
       position('whatsapp_dispatcher_secret' in command) > 0 as uses_lowercase_vault_name,
       position('WHATSAPP_DISPATCHER_SECRET' in command) > 0 as uses_uppercase_vault_name,
       position('PASTE_ANON_KEY' in command) > 0 as has_unreplaced_placeholder
from cron.job
where jobname in ('whatsapp-followup-dispatcher', 'whatsapp-inbound-worker');

-- A2 · Últimas 30 ejecuciones de esos jobs (estado, no cuerpo)
select r.jobid, j.jobname, r.runid, r.status, r.start_time, r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname in ('whatsapp-followup-dispatcher', 'whatsapp-inbound-worker')
order by r.start_time desc
limit 30;

-- A3 · HTTP 401/403/503 retenidos en pg_net (booleanos; no content)
-- Puede estar vacío si expiró la retención. No inferir el caller solo por la hora.
select id as http_request_id, status_code, timed_out, created,
       headers ->> 'x-deno-execution-id' as edge_execution_id,
       headers ->> 'sb-error-code' as gateway_error_code,
       headers ->> 'x-whatsapp-auth-layer' as declared_auth_layer,
       coalesce(content ~ '"error"[[:space:]]*:[[:space:]]*"unauthorized"', false)
         as has_function_unauthorized_body,
       coalesce(content ~* 'invalid jwt|missing authorization|jwt expired', false)
         as has_gateway_jwt_message
from net._http_response
where status_code in (401, 403, 503)
order by created desc
limit 30;

-- B1 · Los dos P0001: estado de cola y recibos (sin payload)
select j.id, j.status, j.stage, j.error_code, j.attempts, j.effect_started,
       exists (
         select 1 from public.whatsapp_action_receipts r
         where r.event_key = j.id::text
       ) as has_action_receipt,
       exists (
         select 1 from public.whatsapp_team_receipts r
         where r.event_key = j.id::text
       ) as has_team_receipt
from public.whatsapp_inbound_jobs j
where j.id in (
  '2e1aa063-aad8-42cc-8b74-b79cb3147afd',
  'b5188f3f-020e-4f6e-b21f-df3fd053993e'
);

-- C1 · RD-06: historial registrado
select
  (select count(*)::int from supabase_migrations.schema_migrations) as n,
  (select max(version) from supabase_migrations.schema_migrations) as last_version,
  (select count(*)::int from supabase_migrations.schema_migrations
    where version like '202611%') as november_n,
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20261117180000'
  ) as has_repo_17180000,
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20261117181000'
  ) as has_repair_17181000,
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20261120120000'
  ) as has_r2_20120000;

-- C2 · Versiones de noviembre + topes de agosto documentados
select version
from supabase_migrations.schema_migrations
where version like '202611%'
   or version in ('20260819234939', '20260821055806')
order by 1;

-- C3 · Objetos R2 (deben estar ausentes en PROD)
select
  (to_regclass('public.agent_execution_gate') is not null) as has_agent_execution_gate,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assistant_pending_ops'
      and column_name = 'claimed_at'
  ) as has_claimed_at;

commit;
