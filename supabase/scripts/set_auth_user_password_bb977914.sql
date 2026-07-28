-- =============================================================================
-- Cambiar contraseña en Supabase Auth (auth.users) por user_id.
-- auth.users.id: bb977914-8d4d-4aa4-8785-7194d0289f49
-- Contraseña: EMX@2026
--
-- Ejecutar en: Supabase Dashboard → SQL Editor (rol postgres).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verificación previa (opcional)
SELECT
  au.id AS auth_user_id,
  au.email,
  u.id AS usuario_id,
  u.nombre,
  u.rol,
  u.area,
  u.activo
FROM auth.users au
LEFT JOIN public.usuarios u ON u.user_id = au.id
WHERE au.id = 'bb977914-8d4d-4aa4-8785-7194d0289f49';

DO $$
DECLARE
  v_user_id constant uuid := 'bb977914-8d4d-4aa4-8785-7194d0289f49';
  v_plain constant text := $pw$EMX@2026$pw$;
  v_encrypted_pw text;
  v_updated integer;
  v_email text;
BEGIN
  SELECT au.email
  INTO v_email
  FROM auth.users au
  WHERE au.id = v_user_id
  LIMIT 1;

  IF v_email IS NULL THEN
    RAISE EXCEPTION
      'No existe fila en auth.users con id %.',
      v_user_id;
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
WHERE au.id = 'bb977914-8d4d-4aa4-8785-7194d0289f49';
