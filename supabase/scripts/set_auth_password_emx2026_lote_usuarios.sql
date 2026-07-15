-- =============================================================================
-- Actualizar contraseña Auth a emx@2026 para el lote de usuarios indicado.
-- Proyecto: ejecuta en el proyecto donde existan estos auth.users / usuarios
--           (típicamente DEV tgiuevzlyptzlfgxsfhj).
--
-- Supabase Dashboard → SQL Editor (rol postgres / service).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verificación previa
SELECT
  u.id AS usuario_id,
  u.user_id AS auth_user_id,
  au.email,
  u.nombre,
  u.rol,
  u.area,
  u.activo,
  (au.id IS NOT NULL) AS tiene_auth
FROM (
  VALUES
    ('0f3d23ca-499d-4638-8ed4-9aaca07665e8'::uuid, 'f8162bf6-869e-4774-9016-f63af2378223'::uuid, 'Antonio'),
    ('36dc006a-9f12-4c7a-9373-b36ac32cfbd2'::uuid, '6a5e3cad-903b-4fa8-b589-b8c9f7c766ec'::uuid, 'I. Rojas'),
    ('6fa2f62f-a2ec-43c8-81fd-40f6d06f9a6a'::uuid, 'd9f9c844-303c-4482-a94c-777b67ec4ab0'::uuid, 'Damaris'),
    ('a0683f3a-ff09-4842-bf24-cb6df3e27030'::uuid, '7a1422d5-ebd9-49c2-b0e7-15ccc852f831'::uuid, 'Jorge Gonzalez'),
    ('a1b7e24a-61b1-48d0-bcd0-0c05ad3c4b3e'::uuid, 'e17fe342-aa53-49f5-a43b-3e1163fa114b'::uuid, 'Leslie'),
    ('cdf07a98-fbd4-4f47-ba7e-9d3ccd90d2a8'::uuid, 'aae1c3c0-c39b-473d-9e71-513663d58ec3'::uuid, 'Nancy Rojo'),
    ('d4384538-0d50-44c7-8508-86458eb939d2'::uuid, '220adfc2-895d-42ed-b0ee-67e4db96ec5d'::uuid, 'alpeva96'),
    ('dd706638-1608-4988-84f3-85d222ec2d8b'::uuid, '2d5bcd2f-c12b-4a67-84ec-6a37526e407f'::uuid, 'Gerardo Puga'),
    ('df41149c-b57e-4d1a-a766-eb5e92dbd1f8'::uuid, 'c178f1da-282a-4d6e-8df2-426be943a654'::uuid, 'Irhec Vazquez'),
    ('f79a6f8c-5986-4131-9a4d-62aabe09cd27'::uuid, '2a814a0d-aeab-482e-ab73-bff0619ffc5b'::uuid, 'Abraham')
) AS t(usuario_id, auth_user_id, nombre_hint)
LEFT JOIN public.usuarios u ON u.id = t.usuario_id OR u.user_id = t.auth_user_id
LEFT JOIN auth.users au ON au.id = t.auth_user_id
ORDER BY coalesce(u.nombre, t.nombre_hint);

DO $$
DECLARE
  v_plain constant text := $pw$emx@2026$pw$;
  v_encrypted_pw text := crypt(v_plain, gen_salt('bf'));
  rec record;
  v_updated integer := 0;
  v_missing integer := 0;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('f8162bf6-869e-4774-9016-f63af2378223'::uuid, 'Antonio'),
        ('6a5e3cad-903b-4fa8-b589-b8c9f7c766ec'::uuid, 'I. Rojas'),
        ('d9f9c844-303c-4482-a94c-777b67ec4ab0'::uuid, 'Damaris'),
        ('7a1422d5-ebd9-49c2-b0e7-15ccc852f831'::uuid, 'Jorge Gonzalez'),
        ('e17fe342-aa53-49f5-a43b-3e1163fa114b'::uuid, 'Leslie'),
        ('aae1c3c0-c39b-473d-9e71-513663d58ec3'::uuid, 'Nancy Rojo'),
        ('220adfc2-895d-42ed-b0ee-67e4db96ec5d'::uuid, 'alpeva96'),
        ('2d5bcd2f-c12b-4a67-84ec-6a37526e407f'::uuid, 'Gerardo Puga'),
        ('c178f1da-282a-4d6e-8df2-426be943a654'::uuid, 'Irhec Vazquez'),
        ('2a814a0d-aeab-482e-ab73-bff0619ffc5b'::uuid, 'Abraham')
    ) AS x(auth_user_id, nombre)
  LOOP
    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      updated_at = now(),
      email_confirmed_at = coalesce(email_confirmed_at, now())
    WHERE id = rec.auth_user_id;

    IF FOUND THEN
      v_updated := v_updated + 1;
      RAISE NOTICE '[OK] % (%)', rec.nombre, rec.auth_user_id;
    ELSE
      v_missing := v_missing + 1;
      RAISE WARNING '[MISS] No existe auth.users id=% nombre=%', rec.auth_user_id, rec.nombre;
    END IF;
  END LOOP;

  RAISE NOTICE 'Contraseñas actualizadas: % | No encontrados: % | Clave: emx@2026', v_updated, v_missing;
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
WHERE au.id IN (
  'f8162bf6-869e-4774-9016-f63af2378223',
  '6a5e3cad-903b-4fa8-b589-b8c9f7c766ec',
  'd9f9c844-303c-4482-a94c-777b67ec4ab0',
  '7a1422d5-ebd9-49c2-b0e7-15ccc852f831',
  'e17fe342-aa53-49f5-a43b-3e1163fa114b',
  'aae1c3c0-c39b-473d-9e71-513663d58ec3',
  '220adfc2-895d-42ed-b0ee-67e4db96ec5d',
  '2d5bcd2f-c12b-4a67-84ec-6a37526e407f',
  'c178f1da-282a-4d6e-8df2-426be943a654',
  '2a814a0d-aeab-482e-ab73-bff0619ffc5b'
)
ORDER BY coalesce(u.nombre, au.email);
