-- Asistente IA + WhatsApp: solo área OKRS o Super Admin.

CREATE OR REPLACE FUNCTION public.can_use_ai_whatsapp()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND lower(ur.app_role::text) = 'super_admin'
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.user_id = v_uid
      AND u.activo = true
      AND public.normalize_business_role(u.rol::text) = 'super_admin'
  ) THEN
    RETURN true;
  END IF;

  IF to_regclass('public.usuario_catalog_roles') IS NOT NULL
     AND to_regclass('public.catalog_roles') IS NOT NULL
     AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.usuario_catalog_roles ucr ON ucr.user_id = u.id
      JOIN public.catalog_roles cr ON cr.id = ucr.role_id
      WHERE u.user_id = v_uid
        AND u.activo = true
        AND cr.activo = true
        AND (
          cr.system_key = 'super_admin'
          OR public.normalize_business_role(cr.nombre) = 'super_admin'
        )
    ) THEN
    RETURN true;
  END IF;

  RETURN public.user_belongs_to_area_name('OKRS');
END;
$$;

COMMENT ON FUNCTION public.can_use_ai_whatsapp() IS
  'Asistente IA y WhatsApp: solo Super Admin o usuarios del area OKRS.';

GRANT EXECUTE ON FUNCTION public.can_use_ai_whatsapp() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_ai_whatsapp() TO service_role;

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
      AND lower(ur.app_role::text) = 'super_admin'
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

  IF public.normalize_business_role(v_rol) = 'super_admin' THEN
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
          OR public.normalize_business_role(cr.nombre) = 'super_admin'
        )
    ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = v_usuario_id
      AND (
        public.normalize_business_role(u.area) = public.normalize_business_role('OKRS')
        OR EXISTS (
          SELECT 1
          FROM public.usuario_areas ua
          INNER JOIN public.areas a ON a.id = ua.area_id
          WHERE ua.user_id = u.id
            AND public.normalize_business_role(a.nombre) = public.normalize_business_role('OKRS')
        )
      )
  );
END;
$$;

COMMENT ON FUNCTION public.whatsapp_inbox_can_access(uuid) IS
  'True si el auth user puede operar WhatsApp/IA (Super Admin o area OKRS).';

-- Solo cambia el gate de autorización; firmas y cuerpos se mantienen.
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
  IF NOT public.can_use_ai_whatsapp() THEN
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
  IF NOT public.can_use_ai_whatsapp() THEN
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
  IF NOT public.can_use_ai_whatsapp() THEN
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

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_session_open(p_wa_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone text := regexp_replace(COALESCE(p_wa_id, ''), '\D', '', 'g');
BEGIN
  IF NOT public.can_use_ai_whatsapp() THEN
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

CREATE OR REPLACE FUNCTION public.admin_upsert_whatsapp_identity(
  p_usuario_id uuid,
  p_phone text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  clean_phone text;
BEGIN
  IF NOT public.can_use_ai_whatsapp() THEN
    RAISE EXCEPTION 'Solo area OKRS o Super Admin pueden vincular WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');

  IF length(clean_phone) = 10 THEN
    clean_phone := '52' || clean_phone;
  END IF;

  IF p_usuario_id IS NULL OR clean_phone IS NULL OR length(clean_phone) < 10 OR length(clean_phone) > 15 THEN
    RAISE EXCEPTION 'Usuario y telefono E.164 (10-15 digitos, sin +) son requeridos.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = p_usuario_id AND u.activo = true
  ) THEN
    RAISE EXCEPTION 'Usuario destino no encontrado o inactivo.'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.user_channel_identities (
    usuario_id,
    channel,
    external_user_id,
    external_chat_id,
    display_name,
    status,
    verified_at,
    last_seen_at,
    metadata
  )
  VALUES (
    p_usuario_id,
    'whatsapp',
    clean_phone,
    clean_phone,
    NULLIF(btrim(COALESCE(p_display_name, '')), ''),
    'active',
    now(),
    now(),
    jsonb_build_object('linked_by', public.get_my_usuario_id(), 'source', 'admin_manual')
  )
  ON CONFLICT (channel, usuario_id)
  DO UPDATE SET
    external_user_id = EXCLUDED.external_user_id,
    external_chat_id = EXCLUDED.external_chat_id,
    display_name = EXCLUDED.display_name,
    status = 'active',
    verified_at = COALESCE(public.user_channel_identities.verified_at, now()),
    last_seen_at = now(),
    metadata = public.user_channel_identities.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION public.admin_upsert_whatsapp_identity(uuid, text, text) IS
  'Vincula telefono WhatsApp. Requiere can_use_ai_whatsapp() (OKRS o Super Admin).';

CREATE OR REPLACE FUNCTION public.admin_clear_whatsapp_identity(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_use_ai_whatsapp() THEN
    RAISE EXCEPTION 'Solo area OKRS o Super Admin pueden desvincular WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  IF p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario requerido.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.user_channel_identities
  SET
    status = 'revoked',
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'revoked_by', public.get_my_usuario_id(),
      'revoked_at', now()
    )
  WHERE channel = 'whatsapp'
    AND usuario_id = p_usuario_id
    AND status = 'active';
END;
$$;

COMMENT ON FUNCTION public.admin_clear_whatsapp_identity(uuid) IS
  'Revoca el vinculo WhatsApp. Requiere can_use_ai_whatsapp() (OKRS o Super Admin).';

DROP POLICY IF EXISTS whatsapp_messages_select_inbox ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_select_inbox
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    public.can_use_ai_whatsapp()
    OR usuario_id = public.get_my_usuario_id()
  );

DROP POLICY IF EXISTS whatsapp_followup_settings_select_managers ON public.whatsapp_followup_settings;
CREATE POLICY whatsapp_followup_settings_select_managers
  ON public.whatsapp_followup_settings
  FOR SELECT TO authenticated
  USING (public.can_use_ai_whatsapp());

DROP POLICY IF EXISTS whatsapp_followup_settings_update_managers ON public.whatsapp_followup_settings;
CREATE POLICY whatsapp_followup_settings_update_managers
  ON public.whatsapp_followup_settings
  FOR UPDATE TO authenticated
  USING (public.can_use_ai_whatsapp())
  WITH CHECK (public.can_use_ai_whatsapp());

NOTIFY pgrst, 'reload schema';
