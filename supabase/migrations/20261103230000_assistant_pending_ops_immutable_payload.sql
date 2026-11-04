-- Evita tampering de propuestas del copiloto: payload/tool/preview inmutables tras INSERT.
-- El cliente autenticado solo puede actualizar campos de ciclo de vida (status, result, etc.).
-- Requiere tabla creada en 20261103210000_assistant_ops.sql.

CREATE OR REPLACE FUNCTION public.assistant_pending_ops_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.tool IS DISTINCT FROM OLD.tool
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.expected_updated_at IS DISTINCT FROM OLD.expected_updated_at
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.preview IS DISTINCT FROM OLD.preview
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'No se pueden modificar payload/tool/preview de una operacion pendiente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.assistant_pending_ops') IS NULL THEN
    RAISE NOTICE
      'assistant_pending_ops no existe: aplica antes 20261103210000_assistant_ops.sql; trigger omitido.';
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_assistant_pending_ops_guard_update ON public.assistant_pending_ops;
  CREATE TRIGGER trg_assistant_pending_ops_guard_update
    BEFORE UPDATE ON public.assistant_pending_ops
    FOR EACH ROW
    EXECUTE FUNCTION public.assistant_pending_ops_guard_update();
END;
$$;

COMMENT ON FUNCTION public.assistant_pending_ops_guard_update() IS
  'Bloquea cambios a payload/tool/preview/usuario de assistant_pending_ops (anti-tampering).';
