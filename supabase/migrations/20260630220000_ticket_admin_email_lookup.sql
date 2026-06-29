-- Resuelve usuarios.id por correo de auth (notificaciones de tickets).
CREATE OR REPLACE FUNCTION public.usuario_id_by_auth_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.usuarios u
  JOIN auth.users au ON au.id = u.user_id
  WHERE lower(trim(au.email)) = lower(trim(p_email))
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.usuario_id_by_auth_email(text) IS
  'Devuelve public.usuarios.id para un correo de auth.users. Uso interno: admin de tickets.';

GRANT EXECUTE ON FUNCTION public.usuario_id_by_auth_email(text) TO authenticated;
