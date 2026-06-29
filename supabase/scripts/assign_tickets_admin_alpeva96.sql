-- Admin de tickets + super_admin para alpeva96@gmail.com
-- Ejecutar en el SQL Editor del proyecto correcto (xhpasmjzuwifmjhrsumb).

DO $$
DECLARE
  v_email constant text := 'alpeva96@gmail.com';
  v_auth_id uuid;
BEGIN
  SELECT au.id
  INTO v_auth_id
  FROM auth.users au
  WHERE lower(trim(au.email)) = v_email
  LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION
      'No existe auth.users con email %. Crea el usuario en Authentication → Users e invitalo antes de ejecutar este script.',
      v_email;
  END IF;

  INSERT INTO public.catalog_roles (nombre, descripcion, activo)
  SELECT
    'super_admin',
    'Super administrador: gestion de tickets, roles y catalogos.',
    true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.catalog_roles cr
    WHERE lower(trim(cr.nombre)) = 'super_admin'
  );

  INSERT INTO public.usuarios (user_id, nombre, rol, activo)
  SELECT
    v_auth_id,
    COALESCE(
      NULLIF(trim(au.raw_user_meta_data->>'nombre'), ''),
      NULLIF(split_part(au.email, '@', 1), ''),
      'Administrador tickets'
    ),
    'super_admin',
    true
  FROM auth.users au
  WHERE au.id = v_auth_id
  ON CONFLICT (user_id) DO UPDATE
  SET
    rol = 'super_admin',
    activo = true,
    updated_at = now();

  PERFORM public.set_first_super_admin(v_auth_id);

  RAISE NOTICE 'OK: % (auth.users.id=%) es super_admin y admin de tickets.', v_email, v_auth_id;
END $$;

SELECT
  u.id AS usuarios_id,
  u.nombre,
  u.rol,
  u.activo,
  au.email,
  ur.app_role
FROM public.usuarios u
JOIN auth.users au ON au.id = u.user_id
LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
WHERE lower(trim(au.email)) = 'alpeva96@gmail.com';
