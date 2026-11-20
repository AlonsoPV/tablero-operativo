-- Cierre R0 · auditoría PROD de solo lectura (401, P0001, RD-06)
-- Proyecto: xhpasmjzuwifmjhrsumb (SQL Editor, rol postgres). Revisar antes de pegar.
-- BEGIN READ ONLY. Solo SELECT. Sin INSERT/UPDATE/DELETE, POST, replay, db push ni Vault.
-- No exportar: cron.command, Vault, tokens, payload, content HTTP, teléfonos, correos, cuerpos.
-- Recibos: whatsapp_apply_* escribe p_event en receipts.event_key. El worker actual pasa job.id
-- (whatsapp-webhook: workerContexts.id). jobs.event_key es la clave Meta, otro campo.
-- Por eso B1 reporta ambos cruces; un solo true/false no prueba mutación histórica.

begin read only;

-- 0 · Catálogo: objetos necesarios (to_regclass / information_schema, sin efectos)
select
  to_regclass('cron.job') is not null as has_cron_job,
  to_regclass('cron.job_run_details') is not null as has_cron_job_run_details,
  to_regclass('net._http_response') is not null as has_net_http_response,
  to_regclass('public.whatsapp_inbound_jobs') is not null as has_inbound_jobs,
  to_regclass('public.whatsapp_action_receipts') is not null as has_action_receipts,
  to_regclass('public.whatsapp_team_receipts') is not null as has_team_receipts,
  to_regclass('supabase_migrations.schema_migrations') is not null as has_schema_migrations,
  to_regclass('public.assistant_pending_ops') is not null as has_pending_ops,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_inbound_jobs'
      and column_name in ('id', 'event_key', 'status', 'stage', 'error_code', 'attempts', 'effect_started')
    having count(*) = 7
  ) as inbound_job_columns_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_action_receipts'
      and column_name = 'event_key'
  ) as action_receipts_event_key_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_team_receipts'
      and column_name = 'event_key'
  ) as team_receipts_event_key_ok;

-- A1 · Dispatcher 401: metadatos de cron (sin el comando). Cabeceras con ~* (sin falso negativo por mayúsculas).
-- Los dos flags de Vault siguen distinguiendo el nombre exacto (minúsculas vs MAYÚSCULAS).
select jobid, jobname, active, schedule,
       command ~* 'x-dispatcher-secret' as has_dispatcher_header,
       command ~* 'authorization' as has_authorization_header,
       command ~* 'apikey' as has_apikey_header,
       position('whatsapp_dispatcher_secret' in command) > 0 as uses_lowercase_vault_name,
       position('WHATSAPP_DISPATCHER_SECRET' in command) > 0 as uses_uppercase_vault_name,
       command ~* 'paste_anon_key' as has_unreplaced_placeholder
from cron.job
where jobname in ('whatsapp-followup-dispatcher', 'whatsapp-inbound-worker');

-- A2 · Últimas 30 ejecuciones (estado, no cuerpo)
select r.jobid, j.jobname, r.runid, r.status, r.start_time, r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname in ('whatsapp-followup-dispatcher', 'whatsapp-inbound-worker')
order by r.start_time desc
limit 30;

-- A3 · HTTP 401/403/503 retenidos: metadatos y sb-error-code. Sin content.
select id as http_request_id, status_code, timed_out, created,
       headers ->> 'x-deno-execution-id' as edge_execution_id,
       headers ->> 'sb-error-code' as gateway_error_code
from net._http_response
where status_code in (401, 403, 503)
order by created desc
limit 30;

-- B1 · Los dos P0001: estado de cola y recibos (sin payload, sin event_key).
-- *_by_job_id: receipts.event_key = jobs.id::text (contrato del worker actual).
-- *_by_inbound_key: receipts.event_key = jobs.event_key (clave Meta). No concluyente por sí solo.
select j.id, j.status, j.stage, j.error_code, j.attempts, j.effect_started,
       exists (
         select 1 from public.whatsapp_action_receipts r
         where r.event_key = j.id::text
       ) as has_action_receipt_by_job_id,
       exists (
         select 1 from public.whatsapp_action_receipts r
         where r.event_key = j.event_key
       ) as has_action_receipt_by_inbound_key,
       exists (
         select 1 from public.whatsapp_team_receipts r
         where r.event_key = j.id::text
       ) as has_team_receipt_by_job_id,
       exists (
         select 1 from public.whatsapp_team_receipts r
         where r.event_key = j.event_key
       ) as has_team_receipt_by_inbound_key
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
    select 1 from supabase_migrations.schema_migrations where version = '20261117180000'
  ) as has_repo_17180000,
  exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261117181000'
  ) as has_repair_17181000,
  exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261120120000'
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
