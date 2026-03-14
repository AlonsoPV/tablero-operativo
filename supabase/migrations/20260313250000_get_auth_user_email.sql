-- Función para obtener el email de auth.users.
-- Solo el propio usuario o admins pueden consultar.

CREATE OR REPLACE FUNCTION get_auth_user_email(p_user_id uuid)
RETURNS text AS $$
DECLARE
  v_email text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  -- Solo el propio usuario o admins pueden ver el email
  IF auth.uid() != p_user_id AND NOT is_app_admin() THEN
    RETURN NULL;
  END IF;
  SELECT au.email INTO v_email
  FROM auth.users au
  WHERE au.id = p_user_id
  LIMIT 1;
  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = '';

COMMENT ON FUNCTION get_auth_user_email(uuid) IS
  'Devuelve el email de auth.users para user_id. Solo propio usuario o admins.';
