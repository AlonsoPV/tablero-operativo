-- R0 · P0001 efectos (inspección previa a PROD). BEGIN READ ONLY. Solo SELECT.
-- No UPDATE, replay ni cambio de status. No selecciona payload, wa_id, body, teléfonos ni correos.
-- Cero filas/conteos: no se encontró correlación en estas tablas; NO demuestra ausencia
-- de mutación ni de efecto Graph. Sigue haciendo falta log/proveedor.
-- El JOIN interno lee claves jsonb correlation_id / worker_job_id; no las exporta.
begin read only;

select j.id, j.status, j.stage, j.error_code, j.attempts, j.effect_started,
       j.created_at, j.updated_at, j.kind
from public.whatsapp_inbound_jobs j
where j.id in (
  '2e1aa063-aad8-42cc-8b74-b79cb3147afd',
  'b5188f3f-020e-4f6e-b21f-df3fd053993e'
);

select j.id as job_id,
       (
         select count(*)::int from public.whatsapp_messages m
         where m.direction = 'inbound'
           and (
             m.payload ->> 'correlation_id' = j.id::text
             or m.payload ->> 'worker_job_id' = j.id::text
           )
       ) as inbox_inbound,
       (
         select count(*)::int from public.whatsapp_messages m
         where m.direction = 'outbound'
           and (
             m.payload ->> 'correlation_id' = j.id::text
             or m.payload ->> 'worker_job_id' = j.id::text
           )
       ) as inbox_outbound,
       (
         select count(*)::int from public.whatsapp_messages m
         where m.direction = 'outbound'
           and m.delivery_status in ('sent', 'delivered', 'read')
           and (
             m.payload ->> 'correlation_id' = j.id::text
             or m.payload ->> 'worker_job_id' = j.id::text
           )
       ) as outbound_accepted,
       (
         select count(*)::int from public.whatsapp_messages m
         where m.direction = 'outbound'
           and m.delivery_status = 'failed'
           and (
             m.payload ->> 'correlation_id' = j.id::text
             or m.payload ->> 'worker_job_id' = j.id::text
           )
       ) as outbound_failed,
       (
         select count(*)::int from public.external_inbound_messages e
         where e.channel = 'whatsapp'
           and e.payload ->> 'worker_job_id' = j.id::text
       ) as external_inbound_rows
from public.whatsapp_inbound_jobs j
where j.id in (
  '2e1aa063-aad8-42cc-8b74-b79cb3147afd',
  'b5188f3f-020e-4f6e-b21f-df3fd053993e'
);

commit;
