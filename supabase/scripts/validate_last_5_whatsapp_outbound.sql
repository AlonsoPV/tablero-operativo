-- =============================================================================
-- Validar las últimas 5 detonaciones WhatsApp (outbound) + veredicto de entrega
-- Ejecutar en SQL Editor de Supabase.
--
-- Veredictos:
--   OK_ENTREGADO     → Meta confirmó delivered/read
--   OK_ACEPTADO      → Graph aceptó (sent) pero aún sin confirmación de entrega
--   ERROR_GRAPH      → Falló al llamar Graph (HTTP / request)
--   ERROR_META       → Graph aceptó wamid, pero webhook status=failed (p.ej. 131049)
--   PENDIENTE_COLA   → queued
--
-- Filtro opcional por teléfono:
--   select set_config('app.wa_filter', '525548118175', true);
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Últimas 5 detonaciones en hilo unificado (fuente de verdad bandeja)
-- ---------------------------------------------------------------------------
WITH last5 AS (
  SELECT
    m.id,
    m.created_at,
    m.wa_id,
    m.usuario_id,
    m.source,
    m.message_kind,
    m.body_text,
    m.meta_message_id,
    m.delivery_status,
    m.error_message,
    m.sent_at,
    m.delivered_at,
    m.read_at,
    m.failed_at,
    m.payload,
    COALESCE(m.payload->>'message_type', m.message_kind) AS delivery_kind,
    COALESCE(
      m.payload->>'flow',
      CASE
        WHEN m.source = 'ai' THEN 'agent'
        WHEN m.source IN ('automation', 'operator') THEN 'ops'
        ELSE null
      END
    ) AS flow,
    m.payload->'request'->'template'->>'name' AS template_name,
    CASE
      WHEN m.payload ? 'open_session' THEN (m.payload->>'open_session') IN ('true', 't', '1')
      ELSE NULL
    END AS open_session,
    NULLIF((regexp_match(COALESCE(m.error_message, ''), '"code"\s*:\s*(\d+)'))[1], '')::int AS meta_error_code,
    COALESCE(
      NULLIF((regexp_match(COALESCE(m.error_message, ''), '"title"\s*:\s*"([^"]+)"'))[1], ''),
      NULLIF((regexp_match(COALESCE(m.error_message, ''), '"message"\s*:\s*"([^"]+)"'))[1], ''),
      left(m.error_message, 180)
    ) AS meta_error_title
  FROM public.whatsapp_messages m
  WHERE m.direction = 'outbound'
    AND m.source IN ('automation', 'operator', 'ai')
    AND (
      nullif(current_setting('app.wa_filter', true), '') IS NULL
      OR m.wa_id = current_setting('app.wa_filter', true)
      OR right(regexp_replace(m.wa_id, '\D', '', 'g'), 10)
         = right(regexp_replace(current_setting('app.wa_filter', true), '\D', '', 'g'), 10)
    )
  ORDER BY m.created_at DESC
  LIMIT 5
)
SELECT
  row_number() OVER (ORDER BY created_at DESC) AS n,
  created_at AT TIME ZONE 'America/Mexico_City' AS created_cdmx,
  wa_id,
  source,
  flow,
  delivery_kind,
  template_name,
  open_session,
  left(COALESCE(body_text, ''), 120) AS preview,
  delivery_status,
  meta_message_id AS wamid,
  meta_error_code,
  left(COALESCE(meta_error_title, ''), 120) AS error_preview,
  CASE
    WHEN delivery_status IN ('delivered', 'read') THEN 'OK_ENTREGADO'
    WHEN delivery_status = 'sent' AND meta_message_id IS NOT NULL THEN 'OK_ACEPTADO'
    WHEN delivery_status = 'queued' THEN 'PENDIENTE_COLA'
    WHEN delivery_status = 'failed' AND meta_message_id IS NOT NULL THEN 'ERROR_META'
    WHEN delivery_status = 'failed' THEN 'ERROR_GRAPH'
    ELSE 'DESCONOCIDO'
  END AS veredicto,
  CASE
    WHEN delivery_status IN ('delivered', 'read') THEN
      'Meta confirmó entrega al dispositivo del usuario.'
    WHEN delivery_status = 'sent' AND meta_message_id IS NOT NULL THEN
      'Graph aceptó el mensaje (wamid). Aún no hay webhook delivered/read/failed.'
    WHEN delivery_status = 'queued' THEN
      'Mensaje en cola local; Graph aún no confirmó aceptación.'
    WHEN delivery_status = 'failed' AND meta_error_code = 131049 THEN
      'Meta bloqueó entrega (131049 healthy ecosystem / tope marketing del destinatario). No reintentar <24h. Revisar categoría Utility vs Marketing de la plantilla.'
    WHEN delivery_status = 'failed' AND meta_error_code = 131026 THEN
      'Número no está en WhatsApp o no puede recibir (131026).'
    WHEN delivery_status = 'failed' AND meta_error_code = 131047 THEN
      'Ventana 24h cerrada / re-engagement requerido (131047).'
    WHEN delivery_status = 'failed' AND meta_error_code = 131051 THEN
      'Soporte de tipo de mensaje no disponible (131051).'
    WHEN delivery_status = 'failed' AND meta_message_id IS NOT NULL THEN
      'Graph aceptó wamid pero Meta reportó failed por webhook de statuses.'
    WHEN delivery_status = 'failed' THEN
      'Falló la llamada a Graph (HTTP/error inmediato). Revisar token, plantilla o payload.'
    ELSE 'Estado no clasificado.'
  END AS recomendacion,
  sent_at,
  delivered_at,
  failed_at
FROM last5
ORDER BY created_at DESC;

-- ---------------------------------------------------------------------------
-- 2) Cruce con action_delivery_log (mismos 5 wamid / wa_id recientes)
-- ---------------------------------------------------------------------------
WITH last5 AS (
  SELECT id, created_at, wa_id, meta_message_id, delivery_status, error_message
  FROM public.whatsapp_messages
  WHERE direction = 'outbound'
    AND source IN ('automation', 'operator', 'ai')
  ORDER BY created_at DESC
  LIMIT 5
)
SELECT
  l.created_at AT TIME ZONE 'America/Mexico_City' AS msg_created_cdmx,
  l.wa_id,
  l.meta_message_id AS wamid,
  l.delivery_status AS thread_status,
  d.delivery_status AS log_status,
  d.payload->>'message_type' AS log_kind,
  d.payload->>'source' AS log_source,
  d.accion_id,
  d.team_action_id,
  left(COALESCE(d.error_message, l.error_message, ''), 160) AS error_message,
  CASE
    WHEN d.id IS NULL THEN 'SIN_LOG'
    WHEN l.delivery_status = d.delivery_status THEN 'SYNC_OK'
    WHEN l.delivery_status = 'failed' AND d.delivery_status <> 'failed' THEN 'LOG_DESACTUALIZADO'
    ELSE 'DIVERGE'
  END AS sync_check
FROM last5 l
LEFT JOIN LATERAL (
  SELECT *
  FROM public.action_delivery_log d
  WHERE d.channel = 'whatsapp'
    AND (
      (l.meta_message_id IS NOT NULL AND d.external_message_id = l.meta_message_id)
      OR (
        d.external_chat_id = l.wa_id
        AND d.created_at BETWEEN l.created_at - interval '2 minutes'
                            AND l.created_at + interval '2 minutes'
      )
    )
  ORDER BY
    CASE WHEN l.meta_message_id IS NOT NULL AND d.external_message_id = l.meta_message_id THEN 0 ELSE 1 END,
    abs(extract(epoch FROM (d.created_at - l.created_at)))
  LIMIT 1
) d ON true
ORDER BY l.created_at DESC;

-- ---------------------------------------------------------------------------
-- 3) Identidad del destino de esos 5 envíos
-- ---------------------------------------------------------------------------
WITH last5 AS (
  SELECT DISTINCT ON (wa_id) wa_id, usuario_id
  FROM (
    SELECT wa_id, usuario_id
    FROM public.whatsapp_messages
    WHERE direction = 'outbound'
      AND source IN ('automation', 'operator', 'ai')
    ORDER BY created_at DESC
    LIMIT 5
  ) x
)
SELECT
  l.wa_id,
  l.usuario_id,
  u.email,
  u.nombre,
  i.external_user_id AS identity_phone,
  i.status AS identity_status,
  i.verified_at,
  i.last_seen_at,
  CASE
    WHEN i.id IS NULL THEN 'SIN_IDENTIDAD'
    WHEN i.status <> 'active' THEN 'IDENTIDAD_INACTIVA'
    WHEN regexp_replace(COALESCE(i.external_user_id, ''), '\D', '', 'g')
       <> regexp_replace(l.wa_id, '\D', '', 'g')
      THEN 'PHONE_MISMATCH'
    ELSE 'IDENTIDAD_OK'
  END AS identity_check
FROM last5 l
LEFT JOIN public.usuarios u ON u.id = l.usuario_id
LEFT JOIN public.user_channel_identities i
  ON i.usuario_id = l.usuario_id
 AND i.channel = 'whatsapp';

-- ---------------------------------------------------------------------------
-- 4) Resumen de fallos Meta recientes (7 días) por código
-- ---------------------------------------------------------------------------
SELECT
  COALESCE(
    (regexp_match(COALESCE(error_message, ''), '"code"\s*:\s*(\d+)'))[1],
    'sin_codigo'
  ) AS meta_code,
  count(*) AS n,
  max(created_at) AT TIME ZONE 'America/Mexico_City' AS last_cdmx,
  left(max(error_message), 160) AS sample_error
FROM public.whatsapp_messages
WHERE direction = 'outbound'
  AND delivery_status = 'failed'
  AND created_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY n DESC, last_cdmx DESC;

-- ---------------------------------------------------------------------------
-- 5) Atajo: historial reciente del número del incidente 131049
-- ---------------------------------------------------------------------------
SELECT
  created_at AT TIME ZONE 'America/Mexico_City' AS created_cdmx,
  wa_id,
  left(COALESCE(body_text, ''), 100) AS preview,
  delivery_status,
  meta_message_id,
  left(COALESCE(error_message, ''), 200) AS error_message
FROM public.whatsapp_messages
WHERE direction = 'outbound'
  AND (
    wa_id = '525548118175'
    OR right(regexp_replace(wa_id, '\D', '', 'g'), 10) = '5548118175'
  )
ORDER BY created_at DESC
LIMIT 10;

-- ---------------------------------------------------------------------------
-- 6) Distribución 24h por flow / route_kind (Ops vs Agent)
-- ---------------------------------------------------------------------------
SELECT
  direction,
  COALESCE(payload->>'flow', '(null)') AS flow,
  COALESCE(payload->>'route_kind', '(null)') AS route_kind,
  count(*) AS n
FROM public.whatsapp_messages
WHERE created_at >= now() - interval '24 hours'
GROUP BY 1, 2, 3
ORDER BY direction, n DESC;

-- ---------------------------------------------------------------------------
-- 7) Inbound recientes + reply outbound asociado (mismo wa_id, ±2 min)
-- ---------------------------------------------------------------------------
SELECT
  i.created_at AT TIME ZONE 'America/Mexico_City' AS inbound_cdmx,
  i.wa_id,
  COALESCE(i.payload->>'route_kind', '(null)') AS route_kind,
  left(COALESCE(i.body_text, ''), 80) AS inbound_preview,
  o.created_at AT TIME ZONE 'America/Mexico_City' AS outbound_cdmx,
  COALESCE(o.payload->>'flow', '(null)') AS reply_flow,
  COALESCE(o.payload->>'source', '(null)') AS reply_source,
  left(COALESCE(o.body_text, ''), 80) AS outbound_preview
FROM public.whatsapp_messages i
LEFT JOIN LATERAL (
  SELECT *
  FROM public.whatsapp_messages o
  WHERE o.direction = 'outbound'
    AND o.wa_id = i.wa_id
    AND o.created_at BETWEEN i.created_at - interval '10 seconds'
                         AND i.created_at + interval '2 minutes'
  ORDER BY o.created_at ASC
  LIMIT 1
) o ON true
WHERE i.direction = 'inbound'
  AND i.created_at >= now() - interval '24 hours'
ORDER BY i.created_at DESC
LIMIT 40;

-- ---------------------------------------------------------------------------
-- 8) Anomalía: agent_aiop sin reply source=ai en ventana corta
-- ---------------------------------------------------------------------------
SELECT
  i.created_at AT TIME ZONE 'America/Mexico_City' AS inbound_cdmx,
  i.wa_id,
  left(COALESCE(i.body_text, ''), 80) AS inbound_preview,
  COALESCE(i.payload->>'route_kind', '(null)') AS route_kind,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.whatsapp_messages o
      WHERE o.direction = 'outbound'
        AND o.wa_id = i.wa_id
        AND o.created_at BETWEEN i.created_at AND i.created_at + interval '2 minutes'
        AND COALESCE(o.payload->>'source', '') = 'ai'
    ) THEN false
    ELSE true
  END AS anomaly_aiop_sin_ai_reply
FROM public.whatsapp_messages i
WHERE i.direction = 'inbound'
  AND i.created_at >= now() - interval '24 hours'
  AND COALESCE(i.payload->>'route_kind', '') = 'agent_aiop'
ORDER BY i.created_at DESC
LIMIT 50;
