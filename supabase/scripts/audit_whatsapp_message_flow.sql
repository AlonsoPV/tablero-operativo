-- Auditoria rapida del flujo WhatsApp (outbound / inbound / jobs / evidencia).

-- inbound
SELECT created_at, message_type, external_user_id, accion_id, team_action_id, error_message
FROM public.external_inbound_messages
WHERE channel = 'whatsapp'
ORDER BY created_at DESC
LIMIT 20;

-- outbound
SELECT created_at, delivery_status, external_chat_id, accion_id, team_action_id, error_message, payload
FROM public.action_delivery_log
WHERE channel = 'whatsapp'
ORDER BY created_at DESC
LIMIT 20;

-- jobs
SELECT status, scheduled_at, attempts, error_message, scope, checkpoint_id, team_action_id, checklist_index
FROM public.whatsapp_followup_jobs
ORDER BY created_at DESC
LIMIT 20;

-- evidencia pendiente
SELECT *
FROM public.whatsapp_result_requests
ORDER BY created_at DESC
LIMIT 20;

-- identidades
SELECT usuario_id, external_user_id, status, verified_at, last_seen_at
FROM public.user_channel_identities
WHERE channel = 'whatsapp'
ORDER BY updated_at DESC
LIMIT 50;
