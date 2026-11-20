-- R0 · P0001: ¿hubo efecto externo? Solo lectura. Sin payload, wa_id, body, teléfonos, correos.
-- No UPDATE, no replay, no cambio de status. Los dos jobs permanecen en review.
begin read only;

select j.id, j.status, j.stage, j.error_code, j.attempts, j.effect_started,
       j.created_at, j.updated_at, j.kind
from public.whatsapp_inbound_jobs j
where j.id in (
  '2e1aa063-aad8-42cc-8b74-b79cb3147afd',
  'b5188f3f-020e-4f6e-b21f-df3fd053993e'
);

-- Hilo: correlation_id / worker_job_id en jsonb (el worker actual guarda job.id ahí).
-- No selecciona el jsonb. Conteos, no textos.
select j.id as job_id,
       count(*) filter (
         where m.direction = 'inbound'
       )::int as inbox_inbound,
       count(*) filter (
         where m.direction = 'outbound'
       )::int as inbox_outbound,
       count(*) filter (
         where m.direction = 'outbound' and m.delivery_status in ('sent', 'delivered', 'read')
       )::int as outbound_accepted,
       count(*) filter (
         where m.direction = 'outbound' and m.delivery_status = 'failed'
       )::int as outbound_failed
from public.whatsapp_inbound_jobs j
left join public.whatsapp_messages m
  on m.payload ->> 'correlation_id' = j.id::text
  or m.payload ->> 'worker_job_id' = j.id::text
where j.id in (
  '2e1aa063-aad8-42cc-8b74-b79cb3147afd',
  'b5188f3f-020e-4f6e-b21f-df3fd053993e'
)
group by j.id;

select j.id as job_id,
       count(*)::int as external_inbound_rows
from public.whatsapp_inbound_jobs j
left join public.external_inbound_messages e
  on e.channel = 'whatsapp'
 and e.payload ->> 'worker_job_id' = j.id::text
where j.id in (
  '2e1aa063-aad8-42cc-8b74-b79cb3147afd',
  'b5188f3f-020e-4f6e-b21f-df3fd053993e'
)
group by j.id;

commit;
