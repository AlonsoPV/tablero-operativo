-- Conexion Google Workspace por usuario (OAuth propio).
-- Tokens cifrados: authenticated solo ve metadatos. Escritura solo service_role.

CREATE TABLE IF NOT EXISTS public.user_google_connections (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  google_email text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'needs_reauth')),
  refresh_token_enc text,
  token_expires_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_google_connections IS
  'OAuth de Gmail/Calendar por usuario (Shaman). El refresh token va cifrado; no usar el GOOGLE_REFRESH_TOKEN de organizacion.';

ALTER TABLE public.user_google_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_google_connections_select_own ON public.user_google_connections;
CREATE POLICY user_google_connections_select_own
  ON public.user_google_connections
  FOR SELECT
  TO authenticated
  USING (usuario_id = public.get_my_usuario_id());

REVOKE ALL ON TABLE public.user_google_connections FROM PUBLIC;
REVOKE ALL ON TABLE public.user_google_connections FROM anon;
REVOKE ALL ON TABLE public.user_google_connections FROM authenticated;

GRANT SELECT (
  usuario_id,
  google_email,
  scopes,
  status,
  connected_at,
  updated_at
) ON public.user_google_connections TO authenticated;

GRANT ALL ON TABLE public.user_google_connections TO service_role;
GRANT ALL ON TABLE public.user_google_connections TO postgres;

-- Email de directorio para redactar correos (no inventar direcciones).
CREATE OR REPLACE FUNCTION public.assistant_person_email(p_usuario_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND public.get_my_usuario_id() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT au.email::text
    INTO v_email
  FROM public.usuarios u
  JOIN auth.users au ON au.id = u.user_id
  WHERE u.id = p_usuario_id
    AND u.activo IS TRUE
  LIMIT 1;

  RETURN NULLIF(btrim(v_email), '');
END;
$$;

COMMENT ON FUNCTION public.assistant_person_email(uuid) IS
  'Email de auth.users para un usuario activo. Usado por Shaman al redactar correo/evento. No expone tokens.';

GRANT EXECUTE ON FUNCTION public.assistant_person_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_person_email(uuid) TO service_role;

-- Sesion/canal en propuestas (historial de Guia + WhatsApp/Retell).
ALTER TABLE public.assistant_pending_ops
  ADD COLUMN IF NOT EXISTS session_id uuid;

ALTER TABLE public.assistant_pending_ops
  ADD COLUMN IF NOT EXISTS channel text;

CREATE INDEX IF NOT EXISTS idx_assistant_pending_ops_session
  ON public.assistant_pending_ops (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

-- Permite editar payload/preview de propuestas Google pendientes (o service_role al rellenar borradores).
CREATE OR REPLACE FUNCTION public.assistant_pending_ops_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allow_edit boolean := false;
  v_google boolean := false;
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.tool IS DISTINCT FROM OLD.tool
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'No se pueden modificar usuario/tool de una operacion pendiente.'
      USING ERRCODE = '42501';
  END IF;

  v_google := OLD.tool IN (
    'gmail_prepare_send',
    'gmail_prepare_reply',
    'calendar_prepare_event',
    'calendar_prepare_update',
    'calendar_prepare_cancel'
  );

  BEGIN
    v_allow_edit := current_setting('app.allow_pending_payload_edit', true) = 'on';
  EXCEPTION WHEN OTHERS THEN
    v_allow_edit := false;
  END;

  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     AND OLD.status = 'pending'
     AND v_google
  THEN
    RETURN NEW;
  END IF;

  IF v_allow_edit
     AND v_google
     AND OLD.status = 'pending'
     AND NEW.status = 'pending'
  THEN
    IF NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.expected_updated_at IS DISTINCT FROM OLD.expected_updated_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    THEN
      RAISE EXCEPTION 'No se pueden modificar resource/expiry al editar el borrador.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.expected_updated_at IS DISTINCT FROM OLD.expected_updated_at
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.preview IS DISTINCT FROM OLD.preview
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'No se pueden modificar payload/tool/preview de una operacion pendiente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_assistant_pending_op(
  p_id uuid,
  p_payload jsonb,
  p_preview jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_tool text;
  v_status text;
BEGIN
  v_me := public.get_my_usuario_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  SELECT tool, status
    INTO v_tool, v_status
  FROM public.assistant_pending_ops
  WHERE id = p_id
    AND usuario_id = v_me
  FOR UPDATE;

  IF v_tool IS NULL THEN
    RAISE EXCEPTION 'No encontré esa operación pendiente.';
  END IF;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Solo se puede editar una propuesta pendiente.';
  END IF;

  IF v_tool NOT IN (
    'gmail_prepare_send',
    'gmail_prepare_reply',
    'calendar_prepare_event',
    'calendar_prepare_update',
    'calendar_prepare_cancel'
  ) THEN
    RAISE EXCEPTION 'Esta operación no se puede editar.';
  END IF;

  PERFORM set_config('app.allow_pending_payload_edit', 'on', true);

  UPDATE public.assistant_pending_ops
  SET payload = p_payload,
      preview = p_preview
  WHERE id = p_id
    AND usuario_id = v_me
    AND status = 'pending';

  RETURN p_preview;
END;
$$;

COMMENT ON FUNCTION public.edit_assistant_pending_op(uuid, jsonb, jsonb) IS
  'Edita asunto/cuerpo o titulo/horario de una propuesta Google pendiente y regenera el preview. Requiere nueva confirmacion.';

GRANT EXECUTE ON FUNCTION public.edit_assistant_pending_op(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_assistant_pending_op(uuid, jsonb, jsonb) TO service_role;
