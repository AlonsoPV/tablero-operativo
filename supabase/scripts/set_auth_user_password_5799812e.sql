-- =============================================================================
-- Cambiar contraseña en Supabase Auth (auth.users) por UUID.
-- Usuario: auth.users.id = 5799812e-054e-492c-8dff-b5d0aaa97198
--
-- Ejecutar en: Supabase Dashboard → SQL Editor (rol postgres / service).
--
-- ANTES DE EJECUTAR: sustituí la contraseña entre $pw$ ... $pw$ (línea v_plain).
--
-- Alternativa (sin SQL), desde la raíz del repo con .env cargado:
--   npm run auth:password -- 5799812e-054e-492c-8dff-b5d0aaa97198 "tu_nueva_clave"
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
WHERE au.id = '5799812e-054e-492c-8dff-b5d0aaa97198';

DO $$
DECLARE
  v_user_id uuid := '5799812e-054e-492c-8dff-b5d0aaa97198';
  -- Sustituí solo el texto entre $pw$ y $pw$ (permite comillas y símbolos en la clave)
  v_plain text := $pw$CAMBIAR_ESTA_CONTRASEÑA$pw$;
  v_encrypted_pw text;
  v_updated integer;
BEGIN
  IF v_plain = 'CAMBIAR_ESTA_CONTRASEÑA' THEN
    RAISE EXCEPTION 'Editá v_plain en el script y poné la contraseña real entre $pw$...$pw$.';
  END IF;

  v_encrypted_pw := crypt(v_plain, gen_salt('bf'));

  UPDATE auth.users
  SET
    encrypted_password = v_encrypted_pw,
    updated_at = now(),
  -- Asegura que pueda iniciar sesión con email/contraseña
    email_confirmed_at = coalesce(email_confirmed_at, now())
  WHERE id = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No existe fila en auth.users con id %', v_user_id;
  END IF;

  RAISE NOTICE 'Contraseña actualizada para auth.users.id = %', v_user_id;
END $$;
