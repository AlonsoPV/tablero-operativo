-- Permite que la API guarde la nota del correo Kanban en un borrador pendiente.
CREATE OR REPLACE FUNCTION public.assistant_pending_ops_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allow_edit boolean := false;
  v_workspace boolean := false;
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.tool IS DISTINCT FROM OLD.tool
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'No se pueden modificar usuario/tool de una operacion pendiente.'
      USING ERRCODE = '42501';
  END IF;

  v_workspace := OLD.tool IN (
    'gmail_prepare_send',
    'gmail_prepare_reply',
    'calendar_prepare_event',
    'calendar_prepare_update',
    'calendar_prepare_cancel',
    'whatsapp_prepare_send'
  );

  BEGIN
    v_allow_edit := current_setting('app.allow_pending_payload_edit', true) = 'on';
  EXCEPTION WHEN OTHERS THEN
    v_allow_edit := false;
  END;

  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     AND OLD.status = 'pending'
     AND (v_workspace OR (OLD.tool = 'notify_action_email' AND NEW.status = 'pending'))
  THEN
    RETURN NEW;
  END IF;

  IF v_allow_edit
     AND v_workspace
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
