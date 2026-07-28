-- =============================================================================
-- Alta masiva: analistas de Planeación (nbio / gmail).
-- Ejecutar en Supabase Dashboard → SQL Editor (rol postgres / service role).
--
-- Crea área Planeación si falta, usuarios en auth.users + auth.identities,
-- perfil en public.usuarios (rol Analista) y app_role viewer en public.user_roles.
-- Contraseña inicial (todos): emx@2026
-- Idempotente: si el correo ya existe, actualiza contraseña y perfil.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO public.catalog_roles (nombre, descripcion, activo)
SELECT
  'Analista',
  'Rol analista con acceso acotado a kanban y módulos operativos permitidos.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_roles cr
  WHERE lower(trim(cr.nombre)) = lower('Analista')
);

DO $$
DECLARE
  v_password constant text := 'emx@2026';
  v_business_role constant text := 'Analista';
  v_app_role constant public.app_role := 'viewer';
  v_encrypted_pw text := crypt(v_password, gen_salt('bf'));

  rec record;
  v_user_id uuid;
  v_meta jsonb;
BEGIN
  INSERT INTO public.areas (nombre, descripcion, activo)
  SELECT 'Planeación', 'Área operativa: Planeación', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.areas a
    WHERE lower(trim(a.nombre)) = lower('Planeación')
  );

  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('d.jesus@nbio.mx',       'Daniel De Jesus Hernández',           'Planeación'),
        ('a.sanchez@nbio.mx',     'Alvaro Romero Sánchez',               'Planeación'),
        ('e.ordaz@nbio.mx',       'Erick Ordaz Méndez',                  'Planeación'),
        ('u.galicia@nbio.mx',     'Ulises Galicia Toledo',               'Planeación'),
        ('c.hernandez@nbio.mx',   'Cristopher Andres Hernandez Sanchez', 'Planeación'),
        ('e.salinas@nbio.mx',     'Estefany Lizet Salinas Salgado',      'Planeación'),
        ('j.verde@nbio.mx',       'Juan Daniel Verde Galicia',           'Planeación'),
        ('nan10abi@gmail.com',    'Nancy Abigail Anaya Ramirez',         'Planeación'),
        ('a.romero@nbio.mx',      'Alan Alexis Romero Navarrete',        'Planeación')
    ) AS u(email, nombre, area)
  LOOP
    v_meta := jsonb_build_object(
      'nombre', rec.nombre,
      'rol', v_business_role,
      'area', rec.area,
      'activo', true,
      'onboarding_completed', true,
      'email', lower(trim(rec.email))
    );

    SELECT au.id
    INTO v_user_id
    FROM auth.users au
    WHERE lower(trim(au.email)) = lower(trim(rec.email))
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
        lower(trim(rec.email)),
        v_encrypted_pw,
        NOW(),
        '',
        '',
        '',
        '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        v_meta,
        NOW(),
        NOW()
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
          'email', lower(trim(rec.email)),
          'email_verified', true
        ),
        'email',
        lower(trim(rec.email)),
        NOW(),
        NOW(),
        NOW()
      );

      RAISE NOTICE '[CREADO] % — % (%)', rec.email, rec.nombre, rec.area;
    ELSE
      UPDATE auth.users
      SET
        encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        raw_user_meta_data = v_meta,
        updated_at = NOW()
      WHERE id = v_user_id;

      UPDATE auth.identities
      SET
        provider_id = lower(trim(rec.email)),
        identity_data = COALESCE(identity_data, '{}'::jsonb)
          || jsonb_build_object(
            'email', lower(trim(rec.email)),
            'email_verified', true,
            'sub', v_user_id::text
          ),
        updated_at = NOW()
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
            'email', lower(trim(rec.email)),
            'email_verified', true
          ),
          'email',
          lower(trim(rec.email)),
          NOW(),
          NOW(),
          NOW()
        );
      END IF;

      RAISE NOTICE '[ACTUALIZADO] % — % (%)', rec.email, rec.nombre, rec.area;
    END IF;

    INSERT INTO public.user_roles (user_id, app_role)
    VALUES (v_user_id, v_app_role)
    ON CONFLICT (user_id) DO UPDATE
      SET app_role = EXCLUDED.app_role,
          updated_at = NOW();

    INSERT INTO public.usuarios (user_id, nombre, rol, area, activo, onboarding_completed)
    VALUES (v_user_id, rec.nombre, v_business_role, rec.area, true, true)
    ON CONFLICT (user_id) DO UPDATE
      SET nombre = EXCLUDED.nombre,
          rol = EXCLUDED.rol,
          area = EXCLUDED.area,
          activo = EXCLUDED.activo,
          onboarding_completed = EXCLUDED.onboarding_completed,
          updated_at = NOW();
  END LOOP;

  RAISE NOTICE 'Listo: 9 usuarios Analista (Planeación) con contraseña %', v_password;
END $$;
