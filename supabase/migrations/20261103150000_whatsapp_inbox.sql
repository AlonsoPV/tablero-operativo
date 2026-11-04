-- Bandeja Seguimiento WhatsApp: hilo unificado, estados Meta, RLS operadores.

-- ---------------------------------------------------------------------------
-- 1) Tabla unificada de mensajes de conversación
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id text NOT NULL,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  source text NOT NULL CHECK (source IN ('contact', 'operator', 'automation')),
  message_kind text NOT NULL DEFAULT 'text',
  body_text text,
  meta_message_id text,
  client_request_id text,
  delivery_status text NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  operator_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);

COMMENT ON TABLE public.whatsapp_messages IS
  'Hilo unificado WhatsApp (inbound + outbound manual/automatizado). Base de la bandeja Seguimiento.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_messages_meta_message_id
  ON public.whatsapp_messages (meta_message_id)
  WHERE meta_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_messages_client_request_id
  ON public.whatsapp_messages (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_created
  ON public.whatsapp_messages (wa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_usuario_created
  ON public.whatsapp_messages (usuario_id, created_at DESC)
  WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created
  ON public.whatsapp_messages (created_at DESC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_messages_select_inbox ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_select_inbox
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    public.can_manage_catalogs()
    OR usuario_id = public.get_my_usuario_id()
  );

-- Escritura solo vía service role / edge functions (sin INSERT/UPDATE autenticado).

GRANT SELECT ON public.whatsapp_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Realtime para la bandeja
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Helpers de preview / backfill
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_inbound_preview(p jsonb, p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(btrim(p->'message'->'text'->>'body'), ''),
    NULLIF(btrim(p->'message'->'interactive'->'button_reply'->>'title'), ''),
    NULLIF(btrim(p->'message'->'button'->>'text'), ''),
    NULLIF(btrim(p->'message'->'interactive'->'list_reply'->>'title'), ''),
    NULLIF(btrim(p->'message'->'image'->>'caption'), ''),
    NULLIF(btrim(p->'message'->'document'->>'caption'), ''),
    NULLIF(btrim(p->'message'->'document'->>'filename'), ''),
    NULLIF(btrim(p->'message'->'video'->>'caption'), ''),
    CASE
      WHEN COALESCE(p_type, '') = 'image' THEN '[Imagen]'
      WHEN COALESCE(p_type, '') = 'document' THEN '[Documento]'
      WHEN COALESCE(p_type, '') = 'audio' THEN '[Audio]'
      WHEN COALESCE(p_type, '') = 'video' THEN '[Video]'
      WHEN COALESCE(p_type, '') = 'interactive' THEN '[Botón]'
      WHEN COALESCE(p_type, '') = 'button' THEN '[Botón]'
      WHEN COALESCE(p_type, '') = 'template' THEN '[Plantilla]'
      ELSE COALESCE(NULLIF(p_type, ''), '[Mensaje]')
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_outbound_preview(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(btrim(p->'request'->'text'->>'body'), ''),
    NULLIF(btrim(p->'request'->'interactive'->'body'->>'text'), ''),
    CASE
      WHEN p->'request'->>'type' = 'template'
        THEN concat('[Plantilla] ', COALESCE(p->'request'->'template'->>'name', ''))
      ELSE NULL
    END,
    NULLIF(btrim(p->>'message_type'), ''),
    '[WhatsApp]'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) Backfill histórico recuperable
-- ---------------------------------------------------------------------------

INSERT INTO public.whatsapp_messages (
  wa_id,
  usuario_id,
  direction,
  source,
  message_kind,
  body_text,
  meta_message_id,
  delivery_status,
  payload,
  created_at,
  sent_at
)
SELECT
  e.external_user_id,
  e.usuario_id,
  'inbound',
  'contact',
  COALESCE(NULLIF(e.message_type, ''), 'unknown'),
  public.whatsapp_inbound_preview(e.payload, e.message_type),
  e.external_message_id,
  'delivered',
  jsonb_build_object(
    'legacy_table', 'external_inbound_messages',
    'legacy_id', e.id,
    'message', e.payload->'message',
    'value', e.payload->'value'
  ),
  e.created_at,
  e.created_at
FROM public.external_inbound_messages e
WHERE e.channel = 'whatsapp'
  AND e.external_user_id IS NOT NULL
  AND (
    e.external_message_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.whatsapp_messages m
      WHERE m.meta_message_id = e.external_message_id
    )
  )
ON CONFLICT DO NOTHING;

-- Sin meta id: insertar por legacy id en payload para no duplicar en re-runs
INSERT INTO public.whatsapp_messages (
  wa_id,
  usuario_id,
  direction,
  source,
  message_kind,
  body_text,
  meta_message_id,
  delivery_status,
  payload,
  created_at,
  sent_at
)
SELECT
  e.external_user_id,
  e.usuario_id,
  'inbound',
  'contact',
  COALESCE(NULLIF(e.message_type, ''), 'unknown'),
  public.whatsapp_inbound_preview(e.payload, e.message_type),
  NULL,
  'delivered',
  jsonb_build_object(
    'legacy_table', 'external_inbound_messages',
    'legacy_id', e.id,
    'message', e.payload->'message',
    'value', e.payload->'value'
  ),
  e.created_at,
  e.created_at
FROM public.external_inbound_messages e
WHERE e.channel = 'whatsapp'
  AND e.external_user_id IS NOT NULL
  AND e.external_message_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_messages m
    WHERE m.payload->>'legacy_table' = 'external_inbound_messages'
      AND m.payload->>'legacy_id' = e.id::text
  );

INSERT INTO public.whatsapp_messages (
  wa_id,
  usuario_id,
  direction,
  source,
  message_kind,
  body_text,
  meta_message_id,
  delivery_status,
  error_message,
  payload,
  created_at,
  sent_at,
  failed_at
)
SELECT
  COALESCE(d.external_chat_id, d.payload->>'wa_id'),
  d.usuario_id,
  'outbound',
  CASE
    WHEN COALESCE(d.payload->>'source', '') = 'dispatcher' THEN 'automation'
    WHEN COALESCE(d.payload->>'message_type', '') IN ('initial', 'checkpoint_followup', 'commitment_close')
      THEN 'automation'
    ELSE 'automation'
  END,
  COALESCE(NULLIF(d.payload->>'message_type', ''), COALESCE(d.payload->'request'->>'type', 'text')),
  public.whatsapp_outbound_preview(d.payload),
  d.external_message_id,
  CASE
    WHEN d.delivery_status = 'failed' THEN 'failed'
    WHEN d.delivery_status = 'queued' THEN 'queued'
    ELSE 'sent'
  END,
  d.error_message,
  jsonb_build_object(
    'legacy_table', 'action_delivery_log',
    'legacy_id', d.id,
    'request', d.payload->'request',
    'response', d.payload->'response',
    'open_session', d.payload->'open_session',
    'message_type', d.payload->>'message_type',
    'source', COALESCE(d.payload->>'source', 'send-action')
  ),
  d.created_at,
  d.sent_at,
  CASE WHEN d.delivery_status = 'failed' THEN COALESCE(d.sent_at, d.created_at) ELSE NULL END
FROM public.action_delivery_log d
WHERE d.channel = 'whatsapp'
  AND COALESCE(d.external_chat_id, d.payload->>'wa_id') IS NOT NULL
  AND (
    d.external_message_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.whatsapp_messages m
      WHERE m.meta_message_id = d.external_message_id
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_messages m
    WHERE m.payload->>'legacy_table' = 'action_delivery_log'
      AND m.payload->>'legacy_id' = d.id::text
  );

-- ---------------------------------------------------------------------------
-- 5) RPCs de lectura para operadores (ámbito can_manage_catalogs)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_list_conversations(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  wa_id text,
  usuario_id uuid,
  contact_name text,
  phone text,
  last_message_text text,
  last_message_at timestamptz,
  last_direction text,
  last_delivery_status text,
  open_session boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  lim integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  off integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado para la bandeja WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (m.wa_id)
      m.wa_id,
      m.usuario_id,
      m.body_text,
      m.created_at,
      m.direction,
      m.delivery_status
    FROM public.whatsapp_messages m
    ORDER BY m.wa_id, m.created_at DESC
  ),
  identities AS (
    SELECT
      i.external_user_id AS phone,
      i.usuario_id,
      COALESCE(NULLIF(btrim(i.display_name), ''), u.nombre, i.external_user_id) AS contact_name
    FROM public.user_channel_identities i
    LEFT JOIN public.usuarios u ON u.id = i.usuario_id
    WHERE i.channel = 'whatsapp' AND i.status = 'active'
  )
  SELECT
    l.wa_id,
    COALESCE(l.usuario_id, idn.usuario_id) AS usuario_id,
    COALESCE(idn.contact_name, l.wa_id) AS contact_name,
    l.wa_id AS phone,
    l.body_text AS last_message_text,
    l.created_at AS last_message_at,
    l.direction AS last_direction,
    l.delivery_status AS last_delivery_status,
    EXISTS (
      SELECT 1
      FROM public.external_inbound_messages e
      WHERE e.channel = 'whatsapp'
        AND e.external_user_id = l.wa_id
        AND e.created_at >= now() - interval '24 hours'
    ) AS open_session
  FROM latest l
  LEFT JOIN identities idn ON idn.phone = l.wa_id
  WHERE clean_search IS NULL
    OR l.wa_id ILIKE '%' || regexp_replace(clean_search, '\D', '', 'g') || '%'
    OR COALESCE(idn.contact_name, '') ILIKE '%' || clean_search || '%'
  ORDER BY l.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_list_conversations(text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_list_messages(
  p_wa_id text,
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  wa_id text,
  usuario_id uuid,
  direction text,
  source text,
  message_kind text,
  body_text text,
  meta_message_id text,
  delivery_status text,
  operator_usuario_id uuid,
  error_message text,
  payload jsonb,
  created_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone text := regexp_replace(COALESCE(p_wa_id, ''), '\D', '', 'g');
  lim integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
BEGIN
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado para la bandeja WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  IF phone IS NULL OR length(phone) < 10 THEN
    RAISE EXCEPTION 'Telefono WhatsApp invalido.'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.wa_id,
    m.usuario_id,
    m.direction,
    m.source,
    m.message_kind,
    m.body_text,
    m.meta_message_id,
    m.delivery_status,
    m.operator_usuario_id,
    m.error_message,
    m.payload,
    m.created_at,
    m.sent_at,
    m.delivered_at,
    m.read_at,
    m.failed_at
  FROM public.whatsapp_messages m
  WHERE m.wa_id = phone
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_list_messages(text, integer, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_list_contacts(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  usuario_id uuid,
  nombre text,
  phone text,
  display_name text,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  lim integer := GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
BEGIN
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado para la bandeja WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.usuario_id,
    COALESCE(u.nombre, i.display_name, i.external_user_id) AS nombre,
    i.external_user_id AS phone,
    i.display_name,
    i.last_seen_at
  FROM public.user_channel_identities i
  JOIN public.usuarios u ON u.id = i.usuario_id
  WHERE i.channel = 'whatsapp'
    AND i.status = 'active'
    AND u.activo = true
    AND (
      clean_search IS NULL
      OR i.external_user_id ILIKE '%' || regexp_replace(clean_search, '\D', '', 'g') || '%'
      OR COALESCE(u.nombre, '') ILIKE '%' || clean_search || '%'
      OR COALESCE(i.display_name, '') ILIKE '%' || clean_search || '%'
    )
  ORDER BY COALESCE(u.nombre, i.display_name, i.external_user_id)
  LIMIT lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_list_contacts(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_session_open(p_wa_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone text := regexp_replace(COALESCE(p_wa_id, ''), '\D', '', 'g');
BEGIN
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado para la bandeja WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  IF phone IS NULL OR length(phone) < 10 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.external_inbound_messages e
    WHERE e.channel = 'whatsapp'
      AND e.external_user_id = phone
      AND e.created_at >= now() - interval '24 hours'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_session_open(text) TO authenticated;

-- Acceso bandeja desde Edge (service role + auth uid del operador).
-- Réplica de can_manage_catalogs() evaluada para un auth.uid concreto.
CREATE OR REPLACE FUNCTION public.whatsapp_inbox_can_access(p_auth_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid;
  v_rol text;
BEGIN
  IF p_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_auth_uid
      AND lower(ur.app_role::text) IN ('super_admin', 'admin')
  ) THEN
    RETURN true;
  END IF;

  SELECT u.id, u.rol::text
  INTO v_usuario_id, v_rol
  FROM public.usuarios u
  WHERE u.user_id = p_auth_uid
    AND u.activo = true
  LIMIT 1;

  IF v_usuario_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.normalize_business_role(v_rol) IN ('super_admin', 'dg', 'sistemas', 'direccion') THEN
    RETURN true;
  END IF;

  IF to_regclass('public.usuario_catalog_roles') IS NOT NULL
     AND to_regclass('public.catalog_roles') IS NOT NULL
     AND EXISTS (
      SELECT 1
      FROM public.usuario_catalog_roles ucr
      JOIN public.catalog_roles cr ON cr.id = ucr.role_id
      WHERE ucr.user_id = v_usuario_id
        AND cr.activo = true
        AND (
          cr.system_key = 'super_admin'
          OR public.normalize_business_role(cr.nombre) IN ('super_admin', 'dg', 'sistemas', 'direccion')
        )
    ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.whatsapp_inbox_can_access(uuid) IS
  'True si el auth user puede operar la bandeja WhatsApp (equivalente a can_manage_catalogs).';

GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_can_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_can_access(uuid) TO authenticated;
