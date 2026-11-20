-- R0 · C2 + contraste 20261117180000 vs catálogo. Solo SELECT.
-- No prueba que la migración se ejecutara íntegra; solo qué objetos hay ahora.
-- No exportar prosrc, command, Vault ni filas de usuario.
begin read only;

-- C2
select version
from supabase_migrations.schema_migrations
where version like '202611%'
   or version in ('20260819234939', '20260821055806')
order by 1;

-- Objetos que 20261117180000 crearía (presencia, no equivalencia de cuerpo)
select
  to_regclass('public.whatsapp_inbound_jobs') is not null as has_inbound_jobs,
  to_regclass('public.whatsapp_action_receipts') is not null as has_action_receipts,
  to_regclass('public.whatsapp_team_receipts') is not null as has_team_receipts,
  to_regprocedure('public.whatsapp_enqueue_inbound(jsonb)') is not null as has_enqueue,
  to_regprocedure('public.whatsapp_claim_inbound()') is not null as has_claim,
  to_regprocedure('public.whatsapp_mark_effect(uuid,uuid,text)') is not null as has_mark_effect,
  to_regprocedure('public.whatsapp_finish_inbound(uuid,uuid,boolean,text)') is not null as has_finish,
  to_regprocedure('public.whatsapp_apply_action(text,uuid,uuid,text,text,text,uuid)') is not null as has_apply_action,
  to_regprocedure('public.whatsapp_apply_team(text,uuid,uuid,integer,text,text,text)') is not null as has_apply_team,
  to_regprocedure('public.whatsapp_release_rejected_inbound_reply(uuid,uuid)') is not null as has_release_429,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usuarios' and column_name = 'correo'
  ) as has_usuarios_correo;

select c.column_name, c.data_type, c.is_nullable
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'whatsapp_inbound_jobs'
order by c.ordinal_position;

select c.relname as table_name, c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('whatsapp_inbound_jobs', 'whatsapp_action_receipts', 'whatsapp_team_receipts');

select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'whatsapp_enqueue_inbound', 'whatsapp_claim_inbound', 'whatsapp_mark_effect',
    'whatsapp_finish_inbound', 'whatsapp_apply_action', 'whatsapp_apply_team',
    'whatsapp_release_rejected_inbound_reply'
  )
order by 1, 2;

commit;
