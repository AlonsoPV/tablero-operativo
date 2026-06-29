-- =============================================================================
-- Cambiar contraseña en Supabase Auth (auth.users) por correo.
-- Usuario: e.mendez@nbio.mx
-- Contraseña: envialo_mx
--
-- Ejecutar en: Supabase Dashboard → SQL Editor (rol postgres / service).
--
-- Alternativa (sin SQL), desde la raíz del repo con .env cargado:
--   npm run auth:password -- e.mendez@nbio.mx "envialo_mx"
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verificación previa (opcional): correo y perfil en public.usuarios
SELECT
  au.id AS auth_user_id,
  au.email,
  u.id AS usuario_id,
  u.nombre,
  u.rol,
  u.activo
FROM auth.users au
LEFT JOIN public.usuarios u ON u.user_id = au.id
WHERE lower(trim(au.email)) = lower(trim('e.mendez@nbio.mx'));

DO $$
DECLARE
  v_email constant text := 'e.mendez@nbio.mx';
  v_plain constant text := $pw$envialo_mx$pw$;
  v_user_id uuid;
  v_encrypted_pw text;
  v_updated integer;
BEGIN
  SELECT au.id
  INTO v_user_id
  FROM auth.users au
  WHERE lower(trim(au.email)) = lower(trim(v_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe fila en auth.users con email %', v_email;
  END IF;

  v_encrypted_pw := crypt(v_plain, gen_salt('bf'));

  UPDATE auth.users
  SET
    encrypted_password = v_encrypted_pw,
    updated_at = now(),
    email_confirmed_at = coalesce(email_confirmed_at, now())
  WHERE id = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No se pudo actualizar auth.users.id %', v_user_id;
  END IF;

  RAISE NOTICE 'Contraseña actualizada para % (auth.users.id = %)', v_email, v_user_id;
END $$;

-- Verificación posterior
SELECT
  au.id AS auth_user_id,
  au.email,
  au.email_confirmed_at IS NOT NULL AS email_confirmado,
  au.updated_at
FROM auth.users au
WHERE lower(trim(au.email)) = lower(trim('e.mendez@nbio.mx'));
