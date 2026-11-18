-- Durable inbound queue. Same Supabase/pg_cron infrastructure as followups; no outbound-template changes.
begin;
create table if not exists public.whatsapp_inbound_jobs (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 phone_id text not null, sender text not null, kind text not null check(kind in ('message','status')),
 payload jsonb not null, status text not null default 'pending' check(status in ('pending','processing','done','review','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, effect_started boolean not null default false,
 stage text not null default 'persisted', error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists whatsapp_inbound_ready on public.whatsapp_inbound_jobs(status,available_at,created_at);
alter table public.whatsapp_inbound_jobs enable row level security;
revoke all on public.whatsapp_inbound_jobs from anon,authenticated;
grant all on public.whatsapp_inbound_jobs to service_role;

create or replace function public.whatsapp_enqueue_inbound(p_events jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 insert into whatsapp_inbound_jobs(event_key,phone_id,sender,kind,payload)
 select e->>'key',e->>'phone',e->>'sender',e->>'kind',e->'payload' from jsonb_array_elements(p_events) e
 on conflict(event_key) do nothing;
end;$$;

create or replace function public.whatsapp_claim_inbound() returns setof public.whatsapp_inbound_jobs
language plpgsql security definer set search_path=public as $$
begin
 -- An expired invocation may have sent a response. Never blindly replay uncertain effects.
 update whatsapp_inbound_jobs set status=case when effect_started then 'review' when attempts>=4 then 'failed' else 'pending' end,
 stage='lease_expired',error_code='lease_expired',lease_token=null,lease_until=null,updated_at=now()
 where status='processing' and lease_until<now();
 return query
 update whatsapp_inbound_jobs j set status='processing',attempts=j.attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',stage='claimed',updated_at=now()
 where j.id=(select q.id from whatsapp_inbound_jobs q
 where q.status='pending' and q.available_at<=now() and q.attempts<4
 and not exists(select 1 from whatsapp_inbound_jobs active where active.sender=q.sender and active.phone_id=q.phone_id and active.status in ('processing','review'))
 and not exists(select 1 from whatsapp_inbound_jobs older where older.sender=q.sender and older.phone_id=q.phone_id and older.status='pending' and (older.created_at,older.id)<(q.created_at,q.id))
 order by q.created_at,q.id for update skip locked limit 1)
 returning j.*;
end;$$;

create or replace function public.whatsapp_mark_effect(p_id uuid,p_lease uuid,p_stage text) returns void
language plpgsql security definer set search_path=public as $$
begin
 update whatsapp_inbound_jobs set effect_started=true,stage=left(p_stage,80),updated_at=now()
 where id=p_id and lease_token=p_lease and status='processing' and lease_until>now();
 if not found then raise exception 'lease_lost'; end if;
end;$$;
create or replace function public.whatsapp_finish_inbound(p_id uuid,p_lease uuid,p_ok boolean,p_error text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 update whatsapp_inbound_jobs set status=case when p_ok then 'done' when effect_started then 'review' when attempts>=4 then 'failed' else 'pending' end,
 stage=case when p_ok then 'completed' else stage end,error_code=left(p_error,100),
 available_at=now()+interval '30 seconds'*power(2,least(attempts,6)), lease_token=null,lease_until=null,updated_at=now()
 where id=p_id and lease_token=p_lease and status='processing';
 if not found then raise exception 'lease_lost'; end if;
end;$$;
revoke all on function public.whatsapp_enqueue_inbound(jsonb),public.whatsapp_claim_inbound(),public.whatsapp_mark_effect(uuid,uuid,text),public.whatsapp_finish_inbound(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.whatsapp_enqueue_inbound(jsonb),public.whatsapp_claim_inbound(),public.whatsapp_mark_effect(uuid,uuid,text),public.whatsapp_finish_inbound(uuid,uuid,boolean,text) to service_role;

-- Authorized, atomic mutation. Technical service-role access never grants business access.
create table if not exists public.whatsapp_action_receipts (
 event_key text primary key, usuario_id uuid not null references public.usuarios(id), accion_id uuid not null references public.acciones_diarias(id), result jsonb not null, created_at timestamptz not null default now()
);
alter table public.whatsapp_action_receipts enable row level security;
revoke all on public.whatsapp_action_receipts from anon,authenticated;
create or replace function public.whatsapp_apply_action(p_event text,p_usuario uuid,p_accion uuid,p_action text,p_wa text,p_reason text default null,p_checkpoint uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.acciones_diarias%rowtype; result jsonb;
begin
 if not exists(select 1 from usuarios where id=p_usuario and activo) then raise exception 'not_authorized'; end if;
 select * into a from acciones_diarias where id=p_accion for update;
 if not found or a.responsable is distinct from p_usuario then raise exception 'not_authorized'; end if;
 select r.result into result from whatsapp_action_receipts r where event_key=p_event and usuario_id=p_usuario and accion_id=p_accion;
 if found then return result; end if;
 if a.estado::text='Verificado' then raise exception 'already_verified'; end if;
 if p_checkpoint is not null and not exists(select 1 from accion_checkpoints where id=p_checkpoint and accion_id=p_accion and activo) then raise exception 'not_authorized'; end if;
 if p_action='support' then
   if length(trim(coalesce(p_reason,'')))<3 then raise exception 'block_reason_required'; end if;
   update acciones_diarias set estado='Bloqueado',causa_raiz=left(p_reason,2000) where id=p_accion;
   insert into accion_comentarios(accion_id,contenido,created_by,tipo_comentario) values(p_accion,'Bloqueo reportado por WhatsApp: '||left(p_reason,2000),p_usuario,'comentario');
 elsif p_action='progress' then
   update acciones_diarias set estado='En_Ejecucion' where id=p_accion;
 elsif p_action='done' then
   update accion_checkpoints set completado=true,checked_at=now(),checked_by=p_usuario where accion_id=p_accion and activo and not completado and (p_checkpoint is null or id=p_checkpoint);
   if not exists(select 1 from accion_checkpoints where accion_id=p_accion and activo and not completado) then
     update acciones_diarias set estado='Hecho',completed_at=now(),completed_by=p_usuario where id=p_accion;
   end if;
   update whatsapp_followup_jobs set status='canceled',updated_at=now(),error_message='completed_via_whatsapp'
   where accion_id=p_accion and usuario_id=p_usuario and status='pending'
     and (p_checkpoint is null or checkpoint_id=p_checkpoint or exists(select 1 from acciones_diarias where id=p_accion and estado='Hecho'));
 else raise exception 'invalid_action'; end if;
 result=jsonb_build_object('ok',true,'accionId',p_accion,'titulo',a.titulo_accion,'askResult',p_action<>'support','askSupport',false,'resultLabel',case when p_action='progress' then 'En proceso' else 'Realizada' end);
 if p_action<>'support' then
   insert into whatsapp_result_requests(scope,accion_id,checkpoint_id,usuario_id,wa_id,status,expires_at)
   values('corporate',p_accion,p_checkpoint,p_usuario,p_wa,'waiting',now()+interval '30 minutes');
 end if;
 insert into whatsapp_action_receipts(event_key,usuario_id,accion_id,result) values(p_event,p_usuario,p_accion,result);
 return result;
end;$$;
revoke all on function public.whatsapp_apply_action(text,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_apply_action(text,uuid,uuid,text,text,text,uuid) to service_role;
create unique index if not exists whatsapp_inbound_sender_processing on public.whatsapp_inbound_jobs(phone_id,sender) where status='processing';
create table if not exists public.whatsapp_team_receipts(event_key text primary key,usuario_id uuid not null,team_action_id uuid not null,result jsonb not null);
alter table public.whatsapp_team_receipts enable row level security;
revoke all on public.whatsapp_team_receipts from anon,authenticated;
create or replace function public.whatsapp_apply_team(p_event text,p_usuario uuid,p_team uuid,p_index integer,p_action text,p_wa text,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.acciones_equipo%rowtype; result jsonb; next_state uuid; items jsonb; complete boolean;
begin
 if not exists(select 1 from usuarios where id=p_usuario and activo) then raise exception 'not_authorized'; end if;
 select * into a from acciones_equipo where id=p_team for update;
 if not found or a.asignado_a is distinct from p_usuario then raise exception 'not_authorized'; end if;
 select r.result into result from whatsapp_team_receipts r where event_key=p_event and usuario_id=p_usuario and team_action_id=p_team;
 if found then return result; end if;
 if exists(select 1 from statuses where id=a.estado_id and lower(nombre) like '%verific%') then raise exception 'already_verified'; end if;
 items=coalesce(a.checklist,'[]'::jsonb);
 if p_action='support' then
   if length(trim(coalesce(p_reason,'')))<3 then raise exception 'block_reason_required'; end if;
   update acciones_equipo set bloqueada=true,updated_at=now() where id=p_team;
   insert into equipo_accion_comentarios(accion_id,contenido,created_by,tipo_comentario) values(p_team,'Bloqueo reportado por WhatsApp: '||left(p_reason,2000),p_usuario,'comentario');
 elsif p_action in ('progress','done') then
   if p_action='done' then
     if p_index is null or p_index<0 or p_index>=jsonb_array_length(items) then raise exception 'invalid_checklist'; end if;
     items=jsonb_set(items,array[p_index::text],(items->p_index)||jsonb_build_object('done',true,'checked_at',now(),'checked_by',p_usuario));
   end if;
   complete=p_action='done' and not exists(select 1 from jsonb_array_elements(items) item where coalesce((item->>'done')::boolean,false)=false);
   select id into next_state from statuses where activo and
     (case when complete then lower(nombre)='hecho' else lower(replace(nombre,'_',' ')) in ('en ejecucion','en ejecución','en proceso') end) order by orden limit 1;
   if next_state is null then raise exception 'missing_status_mapping'; end if;
   update acciones_equipo set checklist=items,estado_id=next_state,bloqueada=false,completed_at=case when complete then now() else completed_at end,updated_at=now() where id=p_team;
   if p_action='done' then
     update whatsapp_followup_jobs set status='canceled',updated_at=now(),error_message='completed_via_whatsapp'
     where team_action_id=p_team and usuario_id=p_usuario and status='pending' and (complete or checklist_index=p_index);
   end if;
   insert into whatsapp_result_requests(scope,team_action_id,checklist_index,usuario_id,wa_id,status,expires_at) values('team',p_team,p_index,p_usuario,p_wa,'waiting',now()+interval '30 minutes');
 else raise exception 'invalid_action'; end if;
 result=jsonb_build_object('ok',true,'teamActionId',p_team,'askResult',p_action<>'support');
 insert into whatsapp_team_receipts(event_key,usuario_id,team_action_id,result) values(p_event,p_usuario,p_team,result);
 return result;
end;$$;
revoke all on function public.whatsapp_apply_team(text,uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_apply_team(text,uuid,uuid,integer,text,text,text) to service_role;

commit;
