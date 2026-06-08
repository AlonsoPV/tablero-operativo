-- =============================================================================
-- Regenerar usuario: E. Alonso PV (super_admin)
--
-- IDs fijos (no cambiar):
--   public.usuarios.id  = dd764c9f-8145-45d4-9111-0a8ec7f687e5
--   auth.users.id       = 83a033bd-e273-4314-8c9a-6a6bd8f4400e
--
-- Si auth.users ya no existe, edita v_email_fallback antes de ejecutar.
-- Contraseña solo al CREAR auth (no pisa si ya existía): emx@2026
--
-- Ejecutar en Supabase Dashboard → SQL Editor (rol postgres).
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_usuarios_id constant uuid := 'dd764c9f-8145-45d4-9111-0a8ec7f687e5';
  v_auth_id constant uuid := '83a033bd-e273-4314-8c9a-6a6bd8f4400e';
  v_nombre constant text := 'E. Alonso PV';
  v_rol constant text := 'super_admin';
  v_area constant text := 'Proyectos';
  v_app_role constant public.app_role := 'super_admin';

  -- Solo si auth.users fue borrado: pon el correo real de acceso
  v_email_fallback constant text := 'CAMBIAR_EMAIL@dominio.com';

  v_password constant text := 'emx@2026';
  v_encrypted_pw text := crypt(v_password, gen_salt('bf'));
  v_email text;
  v_meta jsonb;
  v_auth_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_auth_id)
  INTO v_auth_exists;

  SELECT lower(trim(au.email))
  INTO v_email
  FROM auth.users au
  WHERE au.id = v_auth_id;

  IF v_email IS NULL THEN
    IF lower(trim(v_email_fallback)) = 'cambiar_email@dominio.com' THEN
      RAISE EXCEPTION
        'auth.users no existe. Edita v_email_fallback en el script con el correo real antes de ejecutar.';
    END IF;
    v_email := lower(trim(v_email_fallback));
  END IF;

  v_meta := jsonb_build_object(
    'nombre', v_nombre,
    'rol', v_rol,
    'area', v_area,
    'activo', true,
    'onboarding_completed', true,
    'email', v_email
  );

  INSERT INTO public.catalog_roles (nombre, descripcion, activo)
  SELECT
    'super_admin',
    'Super administrador: gestión de roles de aplicación y catálogos.',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_roles cr WHERE lower(trim(cr.nombre)) = 'super_admin'
  );

  IF NOT v_auth_exists THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      v_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      v_encrypted_pw,
      now(),
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      v_meta,
      now(),
      now()
    );

    RAISE NOTICE '[CREADO] auth.users id=% email=%', v_auth_id, v_email;
  ELSE
    UPDATE auth.users
    SET
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || v_meta,
      updated_at = now()
    WHERE id = v_auth_id;

    RAISE NOTICE '[OK] auth.users existente id=% email=% (contraseña no modificada)', v_auth_id, v_email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.identities ai
    WHERE ai.user_id = v_auth_id AND ai.provider = 'email'
  ) THEN
    UPDATE auth.identities
    SET
      provider_id = v_email,
      identity_data = COALESCE(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', v_email, 'email_verified', true, 'sub', v_auth_id::text),
      updated_at = now()
    WHERE user_id = v_auth_id
      AND provider = 'email';
  ELSE
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', v_email, 'email_verified', true),
      'email',
      v_email,
      now(),
      now(),
      now()
    );
  END IF;

  INSERT INTO public.user_roles (user_id, app_role)
  VALUES (v_auth_id, v_app_role)
  ON CONFLICT (user_id) DO UPDATE
    SET app_role = EXCLUDED.app_role,
        updated_at = now();

  IF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_usuarios_id) THEN
    UPDATE public.usuarios
    SET
      user_id = v_auth_id,
      nombre = v_nombre,
      rol = v_rol,
      area = v_area,
      activo = true,
      onboarding_completed = true,
      updated_at = now()
    WHERE id = v_usuarios_id;
  ELSIF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.user_id = v_auth_id) THEN
    UPDATE public.usuarios
    SET
      nombre = v_nombre,
      rol = v_rol,
      area = v_area,
      activo = true,
      onboarding_completed = true,
      updated_at = now()
    WHERE user_id = v_auth_id;
  ELSE
    INSERT INTO public.usuarios (id, user_id, nombre, rol, area, activo, onboarding_completed)
    VALUES (v_usuarios_id, v_auth_id, v_nombre, v_rol, v_area, true, true);
  END IF;

  RAISE NOTICE 'Usuario regenerado: % (super_admin). Perfil id=% auth=%', v_nombre, v_usuarios_id, v_auth_id;
  IF NOT v_auth_exists THEN
    RAISE NOTICE 'Contraseña inicial: %', v_password;
  END IF;
END $$;

SELECT
  u.id AS usuarios_id,
  u.user_id AS auth_user_id,
  u.nombre,
  u.rol,
  u.area,
  u.activo,
  u.onboarding_completed,
  ur.app_role,
  au.email AS auth_email
FROM public.usuarios u
JOIN auth.users au ON au.id = u.user_id
LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
WHERE u.id = 'dd764c9f-8145-45d4-9111-0a8ec7f687e5';

COMMIT;
