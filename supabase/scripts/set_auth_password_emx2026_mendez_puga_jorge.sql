-- =============================================================================
-- DEV: poner contraseña emx@2026 a usuarios que ya existen en auth.users.
--
--   e.mendez@nbio.mx
--   g.puga@nbio.mx
--   jorge.gonzalez@envialomexico.com
--
-- Solo actualiza la contraseña de Auth. No cambia nombre, rol ni área.
-- Si un correo no existe, el script falla y no deja a medias el lote.
--
-- Ejecutar en: Supabase DEV → SQL Editor (rol postgres / service).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verificación previa
SELECT
  e.email AS email_esperado,
  au.id AS auth_user_id,
  u.nombre,
  u.rol,
  u.area,
  u.activo
FROM (
  VALUES
    ('e.mendez@nbio.mx'),
    ('g.puga@nbio.mx'),
    ('jorge.gonzalez@envialomexico.com')
) AS e(email)
LEFT JOIN auth.users au ON lower(trim(au.email)) = lower(trim(e.email))
LEFT JOIN public.usuarios u ON u.user_id = au.id
ORDER BY e.email;

DO $$
DECLARE
  v_plain constant text := $pw$emx@2026$pw$;
  v_encrypted_pw text := crypt(v_plain, gen_salt('bf'));
  rec record;
  v_user_id uuid;
  v_updated integer;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('e.mendez@nbio.mx'),
        ('g.puga@nbio.mx'),
        ('jorge.gonzalez@envialomexico.com')
    ) AS x(email)
  LOOP
    SELECT au.id
    INTO v_user_id
    FROM auth.users au
    WHERE lower(trim(au.email)) = lower(trim(rec.email))
    LIMIT 1;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'No existe fila en auth.users con email %', rec.email;
    END IF;

    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      updated_at = now(),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, '')
    WHERE id = v_user_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No se pudo actualizar auth.users.id % (%)', v_user_id, rec.email;
    END IF;

    RAISE NOTICE 'Contraseña actualizada para % (auth.users.id = %)', rec.email, v_user_id;
  END LOOP;

  RAISE NOTICE 'Listo: 3 usuarios con contraseña emx@2026';
END $$;

-- Verificación posterior
SELECT
  au.id AS auth_user_id,
  au.email,
  u.nombre,
  au.email_confirmed_at IS NOT NULL AS email_confirmado,
  au.updated_at
FROM auth.users au
LEFT JOIN public.usuarios u ON u.user_id = au.id
WHERE lower(trim(au.email)) IN (
  'e.mendez@nbio.mx',
  'g.puga@nbio.mx',
  'jorge.gonzalez@envialomexico.com'
)
ORDER BY au.email;
