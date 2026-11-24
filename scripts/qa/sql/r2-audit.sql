-- Auditoría R2 (solo lectura): RPC del agente, puerta, rutas de escritura y políticas.
-- Filas: section, name, ok (null = inventario informativo), detail.
with agent_fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.proowner, pg_get_userbyid(p.proowner) as owner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('agent_execution_allowed', 'agent_execution_environment',
    'agent_claim_pending_op', 'agent_apply_action_status', 'agent_action_block_history')
),
writer_fn as (
  select p.oid, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(acciones_diarias|assistant_pending_ops|accion_comentarios|agent_action_receipts|qa_outbox)\y'
    and has_function_privilege('authenticated', p.oid, 'execute')
)
select 'rpc' as section, f.proname as name,
  (f.prosecdef
    and exists (select 1 from unnest(coalesce(f.proconfig, '{}')) c where c like 'search_path=%')
    and not has_function_privilege('anon', f.oid, 'execute')
    and not pg_has_role('authenticated', f.proowner, 'MEMBER')
    and not pg_has_role('anon', f.proowner, 'MEMBER')) as ok,
  concat_ws(' ', 'definer=' || f.prosecdef, 'config=' || array_to_string(f.proconfig, ','), 'owner=' || f.owner,
    'anon=' || has_function_privilege('anon', f.oid, 'execute'),
    'authenticated=' || has_function_privilege('authenticated', f.oid, 'execute')) as detail
from agent_fn f
union all
select 'rpc', 'count', (select count(*) from agent_fn) = 5, (select count(*)::text from agent_fn)
union all
select 'rpc_qa', p.proname,
  p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
    and not has_function_privilege('anon', p.oid, 'execute'),
  concat_ws(' ', 'definer=' || p.prosecdef, 'config=' || array_to_string(p.proconfig, ','),
    'owner=' || pg_get_userbyid(p.proowner), 'anon=' || has_function_privilege('anon', p.oid, 'execute'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'qa_whatsapp_linked'
union all
select 'gate', 'agent_execution_gate',
  c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'agent_execution_gate')
    and not has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
    and not has_table_privilege('anon', c.oid, 'select,insert,update,delete'),
  concat_ws(' ', 'rls=' || c.relrowsecurity,
    'policies=' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'agent_execution_gate'),
    'authenticated_any=' || has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'),
    'anon_any=' || has_table_privilege('anon', c.oid, 'select,insert,update,delete'))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'agent_execution_gate'
union all
select 'gate', 'rows', null, coalesce((select string_agg(concat_ws(':', enabled, project_ref), ',') from public.agent_execution_gate), 'none')
union all
select 'guard', 'assistant_pending_ops_guard_agent_claim',
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where c.relname = 'assistant_pending_ops' and t.tgname = 'assistant_pending_ops_guard_agent_claim' and t.tgenabled = 'O'),
  'trigger BEFORE UPDATE habilitado'
union all
select 'receipts', 'agent_action_receipts',
  c.relrowsecurity
    and not has_table_privilege('authenticated', c.oid, 'insert,update,delete')
    and not has_table_privilege('anon', c.oid, 'select,insert,update,delete'),
  concat_ws(' ', 'rls=' || c.relrowsecurity,
    'authenticated_select=' || has_table_privilege('authenticated', c.oid, 'select'),
    'authenticated_write=' || has_table_privilege('authenticated', c.oid, 'insert,update,delete'))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'agent_action_receipts'
union all
select 'policy', p.tablename || '.' || p.policyname,
  case when p.tablename = 'qa_outbox' and p.cmd in ('INSERT', 'ALL') then coalesce(p.with_check, p.qual) ~ 'agent_execution_allowed' end,
  concat_ws(' | ', p.cmd, p.permissive, array_to_string(p.roles, ','), 'using=' || coalesce(p.qual, '-'), 'check=' || coalesce(p.with_check, '-'))
from pg_policies p
where p.schemaname = 'public' and p.tablename in ('assistant_pending_ops', 'agent_action_receipts', 'qa_outbox', 'qa_whatsapp_linked', 'agent_execution_gate')
union all
select 'qa_table', c.relname, c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select,insert,update,delete'),
  concat_ws(' ', 'rls=' || c.relrowsecurity, 'anon_any=' || has_table_privilege('anon', c.oid, 'select,insert,update,delete'))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'qa_outbox'
union all
select 'writer', w.name, null, 'definer=' || w.prosecdef
from writer_fn w
union all
select 'direct_write', c.relname, null,
  concat_ws(' ', 'insert=' || has_table_privilege('authenticated', c.oid, 'insert'),
    'update=' || has_table_privilege('authenticated', c.oid, 'update'),
    'delete=' || has_table_privilege('authenticated', c.oid, 'delete'),
    'policies_write=' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and p.roles && array['authenticated', 'public']::name[]))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('acciones_diarias', 'assistant_pending_ops', 'accion_comentarios', 'agent_action_receipts', 'qa_outbox')
order by 1, 2
