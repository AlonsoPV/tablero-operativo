-- Acceso al chatbot WhatsApp/Gemini sin JWT: el webhook solo tiene usuario_id.

CREATE OR REPLACE FUNCTION public.can_use_ai_whatsapp_for_usuario(p_usuario_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_activo boolean;
  v_rol text;
  v_area text;
BEGIN
  IF p_usuario_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.user_id, u.activo, u.rol::text, u.area
    INTO v_uid, v_activo, v_rol, v_area
  FROM public.usuarios u
  WHERE u.id = p_usuario_id;

  IF NOT FOUND OR v_uid IS NULL OR v_activo IS NOT TRUE THEN
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

  IF public.normalize_business_role(v_rol) = 'super_admin' THEN
    RETURN true;
  END IF;

  IF to_regclass('public.usuario_catalog_roles') IS NOT NULL
     AND to_regclass('public.catalog_roles') IS NOT NULL
     AND EXISTS (
      SELECT 1
      FROM public.usuario_catalog_roles ucr
      JOIN public.catalog_roles cr ON cr.id = ucr.role_id
      WHERE ucr.user_id = p_usuario_id
        AND cr.activo = true
        AND (
          cr.system_key = 'super_admin'
          OR public.normalize_business_role(cr.nombre) = 'super_admin'
        )
    ) THEN
    RETURN true;
  END IF;

  IF public.normalize_business_role(v_area) = public.normalize_business_role('OKRS') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuario_areas ua
    INNER JOIN public.areas a ON a.id = ua.area_id
    WHERE ua.user_id = p_usuario_id
      AND public.normalize_business_role(a.nombre) = public.normalize_business_role('OKRS')
  );
END;
$$;

COMMENT ON FUNCTION public.can_use_ai_whatsapp_for_usuario(uuid) IS
  'Chatbot WhatsApp: Super Admin o area OKRS, resuelto por usuarios.id (service_role).';

REVOKE ALL ON FUNCTION public.can_use_ai_whatsapp_for_usuario(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_ai_whatsapp_for_usuario(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_use_ai_whatsapp_for_usuario(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_ai_whatsapp_for_usuario(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
