-- Auditoría rápida del loop bidireccional (modo acción act: + legacy chk:).
-- Ejecutar en SQL Editor del proyecto Supabase correspondiente.

-- 1) Outbound reciente
select created_at, delivery_status, external_chat_id,
       payload->>'message_type' as message_type,
       payload->>'checkpoint_id' as checkpoint_id,
       payload->>'target_type' as target_type,
       payload->>'source' as source,
       payload->>'followup_job_id' as job_id,
       error_message
from public.action_delivery_log
where channel = 'whatsapp'
order by created_at desc
limit 30;

-- 2) Jobs (action-level deben tener checkpoint_id null + target_type=action)
select id, status, scheduled_at, attempts, checkpoint_id,
       payload->>'target_type' as target_type,
       payload->>'reminder_stage' as stage,
       error_message
from public.whatsapp_followup_jobs
order by created_at desc
limit 30;

-- 3) Inbound
select created_at, message_type, external_user_id,
       payload->>'kind' as kind,
       payload->>'response' as response,
       payload->>'button_id' as button_id,
       accion_id, checkpoint_id
from public.external_inbound_messages
where channel = 'whatsapp'
order by created_at desc
limit 30;

-- 4) Evidencia pendiente (no expirada)
select id, status, wa_id, accion_id, checkpoint_id, created_at, expires_at
from public.whatsapp_result_requests
where status = 'waiting'
  and expires_at > now()
order by created_at desc;

-- 5) Respuestas de apoyo (flag en hilo)
select created_at, wa_id, body_text, payload->>'support_contact_sent' as support_contact_sent
from public.whatsapp_messages
where direction = 'outbound'
  and coalesce(payload->>'support_contact_sent', '') = 'true'
order by created_at desc
limit 20;
