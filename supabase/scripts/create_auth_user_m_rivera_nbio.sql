-- =============================================================================
-- DEV: crear m.rivera@nbio.mx con contraseña emx@2026.
--
-- Crea auth.users + auth.identities, perfil en public.usuarios y
-- app_role viewer en public.user_roles.
--
-- Datos de negocio (cámbialos aquí si no aplican):
--   nombre: M. Rivera
--   rol:    Operativo
--   área:   (sin área)
--
-- Idempotente: si el correo ya existe, actualiza la contraseña y asegura
-- perfil y rol de aplicación.
--
-- Ejecutar en: Supabase DEV → SQL Editor (rol postgres / service).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.catalog_roles (nombre, descripcion, activo)
SELECT
  'Operativo',
  'Rol operativo con acceso a kanban, academia, disciplina, calendario, notificaciones, manual y mi perfil.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_roles cr
  WHERE lower(trim(cr.nombre)) = lower('Operativo')
);

DO $$
DECLARE
  v_email constant text := 'm.rivera@nbio.mx';
  v_nombre constant text := 'M. Rivera';
  v_business_role constant text := 'Operativo';
  v_area constant text := NULL;
  v_password constant text := $pw$emx@2026$pw$;
  v_app_role constant public.app_role := 'viewer';
  v_encrypted_pw text := crypt(v_password, gen_salt('bf'));
  v_user_id uuid;
  v_meta jsonb;
BEGIN
  v_meta := jsonb_build_object(
    'nombre', v_nombre,
    'rol', v_business_role,
    'activo', true,
    'onboarding_completed', true,
    'email', lower(trim(v_email))
  );

  IF v_area IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('area', v_area);
  END IF;

  SELECT au.id
  INTO v_user_id
  FROM auth.users au
  WHERE lower(trim(au.email)) = lower(trim(v_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

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
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      lower(trim(v_email)),
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

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', lower(trim(v_email)),
        'email_verified', true
      ),
      'email',
      lower(trim(v_email)),
      now(),
      now(),
      now()
    );

    RAISE NOTICE '[CREADO] % (auth.users.id = %)', v_email, v_user_id;
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      updated_at = now()
    WHERE id = v_user_id;

    UPDATE auth.identities
    SET
      provider_id = lower(trim(v_email)),
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object(
          'email', lower(trim(v_email)),
          'email_verified', true,
          'sub', v_user_id::text
        ),
      updated_at = now()
    WHERE user_id = v_user_id
      AND provider = 'email';

    IF NOT FOUND THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        v_user_id,
        jsonb_build_object(
          'sub', v_user_id::text,
          'email', lower(trim(v_email)),
          'email_verified', true
        ),
        'email',
        lower(trim(v_email)),
        now(),
        now(),
        now()
      );
    END IF;

    RAISE NOTICE '[YA EXISTIA] contraseña actualizada para % (auth.users.id = %)', v_email, v_user_id;
  END IF;

  INSERT INTO public.user_roles (user_id, app_role)
  VALUES (v_user_id, v_app_role)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.usuarios (user_id, nombre, rol, area, activo, onboarding_completed)
  VALUES (v_user_id, v_nombre, v_business_role, v_area, true, true)
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- Verificación
SELECT
  au.id AS auth_user_id,
  au.email,
  u.id AS usuario_id,
  u.nombre,
  u.rol,
  u.area,
  u.activo,
  ur.app_role,
  au.email_confirmed_at IS NOT NULL AS email_confirmado
FROM auth.users au
LEFT JOIN public.usuarios u ON u.user_id = au.id
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE lower(trim(au.email)) = 'm.rivera@nbio.mx';
