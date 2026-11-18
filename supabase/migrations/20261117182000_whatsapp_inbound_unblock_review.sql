-- Keep uncertain jobs in review without blocking new messages from their sender.
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
 and not exists(select 1 from whatsapp_inbound_jobs active where active.sender=q.sender and active.phone_id=q.phone_id and active.status='processing')
 and not exists(select 1 from whatsapp_inbound_jobs older where older.sender=q.sender and older.phone_id=q.phone_id and older.status='pending' and (older.created_at,older.id)<(q.created_at,q.id))
 order by q.created_at,q.id for update skip locked limit 1)
 returning j.*;
end;$$;

-- A definite rate-limit response has no outbound effect. Only the worker can
-- release a live provider-request lease before any other effect was attempted.
create or replace function public.whatsapp_release_rejected_inbound_reply(p_id uuid, p_lease uuid)
returns void
language plpgsql security definer set search_path=public as $$
begin
 update whatsapp_inbound_jobs
 set effect_started=false,stage='provider_rate_limited',updated_at=now()
 where id=p_id and lease_token=p_lease and status='processing'
   and stage='provider_request' and lease_until>now();
 if not found then raise exception 'lease_lost'; end if;
end;$$;
revoke all on function public.whatsapp_release_rejected_inbound_reply(uuid,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_release_rejected_inbound_reply(uuid,uuid) to service_role;
