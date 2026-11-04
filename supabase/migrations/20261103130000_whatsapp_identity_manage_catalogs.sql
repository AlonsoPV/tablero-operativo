-- Quien administra usuarios/catalogos (admin app, DG/Sistemas/super_admin, Direccion)
-- puede vincular telefono WhatsApp a cualquier usuario activo.

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
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'Solo administradores o Direccion pueden vincular WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');

  -- MX: 10 digitos locales → prefijar 52
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
  'Vincula telefono WhatsApp (digitos E.164) a un usuario. Requiere can_manage_catalogs().';

CREATE OR REPLACE FUNCTION public.admin_clear_whatsapp_identity(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'Solo administradores o Direccion pueden desvincular WhatsApp.'
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
  'Revoca el vinculo WhatsApp de un usuario. Requiere can_manage_catalogs().';

GRANT EXECUTE ON FUNCTION public.admin_clear_whatsapp_identity(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
