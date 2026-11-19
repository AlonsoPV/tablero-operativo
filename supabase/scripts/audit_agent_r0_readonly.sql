-- R0 diagnostics. Run by an authorized operator. Returns metadata, never headers or secrets.
begin read only;

select jobid, jobname, active, schedule,
       position('x-dispatcher-secret' in command) > 0 as has_dispatcher_header,
       position('whatsapp_dispatcher_secret' in command) > 0 as uses_lowercase_vault_name,
       position('WHATSAPP_DISPATCHER_SECRET' in command) > 0 as uses_uppercase_name,
       position('PASTE_ANON_KEY' in command) > 0 as has_unreplaced_placeholder
from cron.job
where jobname in ('whatsapp-followup-dispatcher', 'whatsapp-inbound-worker');

select r.jobid, r.runid, r.status, r.start_time, r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname in ('whatsapp-followup-dispatcher', 'whatsapp-inbound-worker')
order by r.start_time desc
limit 30;

-- These HTTP rows require a matching request ID/log to attribute them to a function.
-- Historical rows may no longer be retained. Do not infer a caller from time alone.
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

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'usuarios', 'user_roles', 'acciones_diarias', 'accion_comentarios',
    'okrs', 'okr_key_results', 'okr_initiatives',
    'assistant_pending_ops', 'assistant_op_log',
    'whatsapp_messages', 'whatsapp_inbound_jobs',
    'gaps','catalog_kpis','academy_modules','statuses','priorities','areas',
    'catalog_roles','dropdown_catalogs','dropdown_options','app_modules',
    'catalog_role_modules','usuario_catalog_roles','manual_gamification_rules'
  )
order by tablename, policyname;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_userbyid(p.proowner) as owner_name,
       p.prosecdef as security_definer, p.proconfig, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
       md5(pg_get_functiondef(p.oid)) as definition_hash,
       pg_get_functiondef(p.oid) as permission_function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'can_manage_catalogs', 'is_business_admin',
    'is_action_privileged_usuario', 'can_manage_accion_full_as',
    'okr_can_view', 'okr_manage_scope', 'can_use_ai_whatsapp',
    'can_use_ai_whatsapp_for_usuario', 'whatsapp_mark_effect'
    ,'can_manage_org_hierarchy','can_manage_challenges','can_edit_manual_gamification',
    'team_kanban_is_admin','team_kanban_is_super_admin','team_kanban_can_view',
    'can_query_ai_whatsapp_for_usuario','is_current_user_direction',
    'guard_direction_profile_privileges','can_edit_accion_general_as',
    'get_my_usuario_id','normalize_business_role','has_business_role',
    'is_current_user_super_admin','is_app_admin','is_super_admin',
    'user_belongs_to_area_name','okr_active_user','team_kanban_is_leader',
    'can_edit_accion_general','has_kanban_action_editor_role'
  )
order by p.proname, arguments;

-- Snapshot metadata needed to compare the candidate against the effective schema.
-- Do not export user rows, Vault, cron commands, messages or provider credentials.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls,
       pg_get_userbyid(c.relowner) as owner_name, c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
  and c.relname in ('usuarios','user_roles','usuario_catalog_roles','catalog_roles',
    'usuario_areas','areas','acciones_diarias','okrs','okr_key_results','okr_initiatives',
    'assistant_pending_ops','whatsapp_messages','whatsapp_inbound_jobs')
order by c.relname;

select event_object_schema, event_object_table, trigger_name, action_timing,
       event_manipulation, action_statement
from information_schema.triggers
where event_object_schema='public' and event_object_table in (
  'usuarios','acciones_diarias','accion_checkpoints','whatsapp_action_receipts',
  'whatsapp_followup_jobs','whatsapp_result_requests','whatsapp_flow_sessions'
)
order by event_object_table, trigger_name;

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='storage' and tablename='objects'
order by policyname;

select has_schema_privilege('anon','public','CREATE') as anon_can_create,
       has_schema_privilege('authenticated','public','CREATE') as authenticated_can_create,
       has_schema_privilege('anon','auth','CREATE') as anon_can_create_in_auth,
       has_schema_privilege('authenticated','auth','CREATE') as authenticated_can_create_in_auth;

select j.id, j.status, j.stage, j.error_code, j.attempts, j.effect_started,
       exists(select 1 from public.whatsapp_action_receipts r
              where r.event_key = j.id::text) as has_action_receipt,
       exists(select 1 from public.whatsapp_team_receipts r
              where r.event_key = j.id::text) as has_team_receipt
from public.whatsapp_inbound_jobs j
where j.id in (
  '2e1aa063-aad8-42cc-8b74-b79cb3147afd',
  'b5188f3f-020e-4f6e-b21f-df3fd053993e'
);

commit;
