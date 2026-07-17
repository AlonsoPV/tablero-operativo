-- =============================================================================
-- DEV ONLY: sincronizar public.usuarios (perfil + jerarquía + área)
-- Proyecto: tgiuevzlyptzlfgxsfhj
--
-- Fuente: snapshot de perfiles (id / user_id / nombre / rol / area / activo /
--         onboarding / manager_user_id).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor (proyecto DEV tgiuevzlyptzlfgxsfhj)
--              con rol postgres / service.
--
-- Requisitos:
--   - Cada user_id debe existir en auth.users (si falta, el script avisa y
--     omite ese registro; no crea identidades de auth).
--   - manager_user_id apunta a public.usuarios.id (se aplica en 2ª pasada).
-- =============================================================================

BEGIN;

-- 1) Staging con el snapshot
CREATE TEMP TABLE tmp_usuarios_sync (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  rol text NOT NULL,
  area text NULL,
  activo boolean NOT NULL,
  onboarding_completed boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  manager_user_id uuid NULL
) ON COMMIT DROP;

INSERT INTO tmp_usuarios_sync (
  id, user_id, nombre, rol, area, activo, onboarding_completed,
  created_at, updated_at, manager_user_id
) VALUES
  ('0d9c9f25-78bc-496b-b3b0-9ff7814e1674', '245dbc32-4a06-481b-be50-254aa04ed769', 'Nubia Flores',     'Operativo',   'Mantenimiento',      true,  true, '2026-06-22 05:17:35.524076+00', '2026-07-09 00:00:10.096303+00', '7e16053e-a2ae-44a6-b9ed-3966754cd5b7'),
  ('0ecab769-46bd-4de7-94da-b2b1e8b6c98b', '6033dcd1-be84-4920-a7b8-6417d2144654', 'I. Rojas',         'Operativo',   'Operaciones',        true,  true, '2026-06-17 21:03:09.478292+00', '2026-07-09 00:01:03.683248+00', '7e16053e-a2ae-44a6-b9ed-3966754cd5b7'),
  ('10e80eb8-7ec5-4dfb-98dd-11e37866d762', '3d0eec63-3feb-4a3d-976b-997255896073', 'Antonio',          'Operativo',   'Operaciones',        true,  true, '2026-06-08 18:28:19.015695+00', '2026-07-08 23:59:47.062055+00', '14afe802-8187-4db5-a13b-37c01adba157'),
  ('14afe802-8187-4db5-a13b-37c01adba157', 'b96a7dee-5ace-4d33-8ce5-a5be27cc2630', 'Damaris Medrano',  'Operativo',   'RH',                 true,  true, '2026-06-08 18:28:19.015695+00', '2026-07-07 16:56:55.044321+00', NULL),
  ('317465b7-f009-4635-9a27-a05d14c7c619', '2e0af8cc-03a6-445a-ae1e-d4e9e6f7b3ae', 'Abraham',          'Direccion',   'Planeación',         true,  true, '2026-06-08 18:28:19.015695+00', '2026-07-03 16:57:23.302294+00', NULL),
  ('50819182-cb32-46e3-b11a-7bd28d3e3e3b', 'e23561a2-20cc-40cb-9dad-6de520d1ec28', 'Nancy Rojo',       'Operativo',   'Finanzas',           true,  true, '2026-06-08 18:28:19.015695+00', '2026-07-09 00:00:44.365453+00', '7e16053e-a2ae-44a6-b9ed-3966754cd5b7'),
  ('5262608e-7b8e-4d1a-83aa-2ef819e8e50e', '38e5276b-92f4-4c5f-b420-ba20e83e67c7', 'envialo_mexico',   'super_admin', NULL,                 false, true, '2026-03-13 19:13:21.48923+00',  '2026-07-09 00:01:46.369859+00', NULL),
  ('5da297c3-262b-41cf-ad7b-70de50eb2f24', 'f4e66a01-dc2e-4c69-9323-b953c3a6c14e', 'Hector',           'Operativo',   'Operaciones',        false, true, '2026-06-22 05:33:19.024192+00', '2026-06-29 16:05:30.524738+00', NULL),
  ('5f74ce7c-035f-451e-bdfa-99dd8d0f258b', '0ca21de5-2df2-4a4c-b8cb-4e90899d0ef6', 'Irhec Vazquez',    'Operativo',   'Operaciones',        true,  true, '2026-06-17 21:04:32.46869+00',  '2026-07-09 00:01:18.97791+00',  '7e16053e-a2ae-44a6-b9ed-3966754cd5b7'),
  ('743000fb-4aad-4c29-8876-898c20f57ba0', 'd2769005-bf48-48f0-a15d-e3b62f8ebea4', 'G. Puga',          'super_admin', NULL,                 false, true, '2026-06-08 18:56:56.378362+00', '2026-07-09 00:01:58.173075+00', NULL),
  ('7e16053e-a2ae-44a6-b9ed-3966754cd5b7', '5700cc85-100e-4c62-89ad-34ce54eb0c8c', 'Jorge Gonzalez',   'Operativo',   'Direccion general',  true,  true, '2026-06-08 18:28:19.015695+00', '2026-07-01 15:58:42.262327+00', NULL),
  ('848bbe04-0115-41d4-b9b2-8e8c2cfee6dc', 'f3b57fa8-9d7d-42f1-8da0-4d8c22ea420e', 'Leslie',           'Operativo',   'Sistemas',           true,  true, '2026-06-08 18:28:19.015695+00', '2026-07-09 00:00:29.417607+00', '7e16053e-a2ae-44a6-b9ed-3966754cd5b7'),
  ('a19c561b-674e-4bc6-a8b8-6aed845d678c', '6280e32e-70fb-49fb-85e5-d6aeae91f946', 'Jennifer Lopez',   'Operativo',   'Operaciones',        true,  true, '2026-06-23 20:24:33.083661+00', '2026-06-24 15:31:12.130437+00', NULL),
  ('b268a8dc-0824-4e43-a79a-7a2a9ff3693a', '63780264-bbf1-48de-86c1-1a3e4184b987', 'Rebeca Martinez',  'Operativo',   'Operaciones',        true,  true, '2026-06-23 22:57:25.52336+00',  '2026-06-24 15:31:15.341221+00', NULL),
  ('d5d4944d-abd6-4465-9006-93aeafe6d1b4', '6de8785e-0bd0-424e-97b9-8762658631a6', 'Hector Martinez',  'Operativo',   'Operaciones',        true,  true, '2026-06-23 23:05:25.8372+00',   '2026-06-24 15:31:18.264613+00', NULL),
  ('dd764c9f-8145-45d4-9111-0a8ec7f687e5', '83a033bd-e273-4314-8c9a-6a6bd8f4400e', 'Alonso P.V',       'super_admin', NULL,                 true,  true, '2026-03-13 18:37:24.270455+00', '2026-06-30 19:52:12.138004+00', NULL),
  ('e5e93ec8-716d-42f1-bec7-cdcc7ba2abc3', 'bb977914-8d4d-4aa4-8785-7194d0289f49', 'Kanban',           'Direccion',   NULL,                 true,  true, '2026-06-22 04:56:44.249672+00', '2026-06-24 15:31:35.850692+00', NULL),
  ('f7e4b655-234c-4f81-abdb-a9c15ab8fd2c', '0af758ca-779f-44d1-815c-a8916917cf67', 'Gerardo Puga',     'Operativo',   'Proyectos',          true,  true, '2026-06-01 19:16:01.524946+00', '2026-07-01 15:58:42.262327+00', NULL);

-- 2) Diagnóstico: auth.users faltantes (obligatorio para INSERT/UPDATE)
DO $$
DECLARE
  rec record;
  v_missing int := 0;
BEGIN
  RAISE NOTICE '=== Validación auth.users (DEV tgiuevzlyptzlfgxsfhj) ===';
  FOR rec IN
    SELECT s.id, s.user_id, s.nombre
    FROM tmp_usuarios_sync s
    WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = s.user_id)
    ORDER BY s.nombre
  LOOP
    v_missing := v_missing + 1;
    RAISE WARNING 'Sin auth.users: usuarios.id=% user_id=% nombre=% — se omite',
      rec.id, rec.user_id, rec.nombre;
  END LOOP;

  IF v_missing > 0 THEN
    RAISE NOTICE 'Omitidos por falta de auth: % de %', v_missing, (SELECT count(*) FROM tmp_usuarios_sync);
  ELSE
    RAISE NOTICE 'Todos los user_id existen en auth.users.';
  END IF;
END $$;

-- 3) Asegurar roles de catálogo
INSERT INTO public.catalog_roles (nombre, descripcion, activo)
SELECT DISTINCT s.rol, 'Rol sincronizado desde snapshot DEV', true
FROM tmp_usuarios_sync s
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_roles cr
  WHERE lower(trim(cr.nombre)) = lower(trim(s.rol))
);

-- 4) Asegurar áreas de catálogo
INSERT INTO public.areas (nombre, descripcion, activo)
SELECT DISTINCT s.area, 'Área sincronizada desde snapshot DEV', true
FROM tmp_usuarios_sync s
WHERE s.area IS NOT NULL
  AND trim(s.area) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.areas a
    WHERE lower(trim(a.nombre)) = lower(trim(s.area))
  );

-- 5) Solo registros con auth válido
CREATE TEMP TABLE tmp_usuarios_ready ON COMMIT DROP AS
SELECT s.*
FROM tmp_usuarios_sync s
WHERE EXISTS (SELECT 1 FROM auth.users au WHERE au.id = s.user_id);

-- Evitar conflictos user_id únicos: si otro perfil en DEV ya usa ese user_id con distinto id,
-- reasignamos/actualizamos el existente por user_id preferentemente.
-- Estrategia:
--   a) Si existe fila con mismo id → UPDATE
--   b) Si existe fila con mismo user_id (otro id) → UPDATE de esa fila (mantener su id DEV)
--   c) Si no existe → INSERT con el id del snapshot

-- 5a) Liberar managers entre filas del lote (evita ciclos / FK al reordenar)
UPDATE public.usuarios u
SET manager_user_id = NULL,
    updated_at = now()
WHERE u.id IN (SELECT id FROM tmp_usuarios_ready)
   OR u.user_id IN (SELECT user_id FROM tmp_usuarios_ready);

-- 5b) UPDATE por id exacto
UPDATE public.usuarios u
SET
  user_id = s.user_id,
  nombre = s.nombre,
  rol = s.rol,
  area = s.area,
  activo = s.activo,
  onboarding_completed = s.onboarding_completed,
  updated_at = greatest(u.updated_at, s.updated_at),
  manager_user_id = NULL
FROM tmp_usuarios_ready s
WHERE u.id = s.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.usuarios other
    WHERE other.user_id = s.user_id
      AND other.id <> s.id
  );

-- 5c) UPDATE por user_id cuando el id del snapshot no existe / choca
UPDATE public.usuarios u
SET
  nombre = s.nombre,
  rol = s.rol,
  area = s.area,
  activo = s.activo,
  onboarding_completed = s.onboarding_completed,
  updated_at = greatest(u.updated_at, s.updated_at),
  manager_user_id = NULL
FROM tmp_usuarios_ready s
WHERE u.user_id = s.user_id
  AND u.id <> s.id;

-- 5d) INSERT faltantes
INSERT INTO public.usuarios (
  id, user_id, nombre, rol, area, activo, onboarding_completed,
  created_at, updated_at, manager_user_id
)
SELECT
  s.id,
  s.user_id,
  s.nombre,
  s.rol,
  s.area,
  s.activo,
  s.onboarding_completed,
  s.created_at,
  s.updated_at,
  NULL
FROM tmp_usuarios_ready s
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = s.id)
  AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.user_id = s.user_id);

-- 6) Aplicar manager_user_id (resuelve id destino: preferir id snapshot; si no, id DEV por user_id del snapshot del jefe)
WITH manager_map AS (
  SELECT
    COALESCE(
      (SELECT u.id FROM public.usuarios u WHERE u.id = s.id LIMIT 1),
      (SELECT u.id FROM public.usuarios u WHERE u.user_id = s.user_id LIMIT 1)
    ) AS target_id,
    CASE
      WHEN s.manager_user_id IS NULL THEN NULL
      ELSE COALESCE(
        (SELECT u.id FROM public.usuarios u WHERE u.id = s.manager_user_id LIMIT 1),
        (
          SELECT u2.id
          FROM tmp_usuarios_ready m
          JOIN public.usuarios u2 ON u2.user_id = m.user_id
          WHERE m.id = s.manager_user_id
          LIMIT 1
        )
      )
    END AS resolved_manager_id
  FROM tmp_usuarios_ready s
)
UPDATE public.usuarios u
SET
  manager_user_id = m.resolved_manager_id,
  updated_at = now()
FROM manager_map m
WHERE u.id = m.target_id
  AND m.target_id IS NOT NULL
  AND (m.resolved_manager_id IS NULL OR m.resolved_manager_id <> u.id);

-- 7) Sincronizar área principal en usuario_areas (si la tabla existe)
DO $$
BEGIN
  IF to_regclass('public.usuario_areas') IS NULL THEN
    RAISE NOTICE 'usuario_areas no existe; se omite sync de áreas.';
    RETURN;
  END IF;

  -- Quitar primaria previa de los usuarios del lote
  DELETE FROM public.usuario_areas ua
  WHERE ua.is_primary
    AND ua.user_id IN (
      SELECT COALESCE(
        (SELECT u.id FROM public.usuarios u WHERE u.id = s.id LIMIT 1),
        (SELECT u.id FROM public.usuarios u WHERE u.user_id = s.user_id LIMIT 1)
      )
      FROM tmp_usuarios_ready s
    );

  INSERT INTO public.usuario_areas (user_id, area_id, is_primary)
  SELECT
    COALESCE(
      (SELECT u.id FROM public.usuarios u WHERE u.id = s.id LIMIT 1),
      (SELECT u.id FROM public.usuarios u WHERE u.user_id = s.user_id LIMIT 1)
    ) AS user_pk,
    a.id,
    true
  FROM tmp_usuarios_ready s
  JOIN public.areas a ON lower(trim(a.nombre)) = lower(trim(s.area))
  WHERE s.area IS NOT NULL
    AND trim(s.area) <> ''
  ON CONFLICT (user_id, area_id) DO UPDATE
  SET is_primary = true;
END $$;

COMMIT;

-- =============================================================================
-- Verificación
-- =============================================================================
SELECT
  u.id,
  u.user_id,
  au.email,
  u.nombre,
  u.rol,
  u.area,
  u.activo,
  u.onboarding_completed,
  u.manager_user_id,
  m.nombre AS manager_nombre,
  u.updated_at
FROM public.usuarios u
LEFT JOIN auth.users au ON au.id = u.user_id
LEFT JOIN public.usuarios m ON m.id = u.manager_user_id
WHERE u.user_id IN (
  '245dbc32-4a06-481b-be50-254aa04ed769',
  '6033dcd1-be84-4920-a7b8-6417d2144654',
  '3d0eec63-3feb-4a3d-976b-997255896073',
  'b96a7dee-5ace-4d33-8ce5-a5be27cc2630',
  '2e0af8cc-03a6-445a-ae1e-d4e9e6f7b3ae',
  'e23561a2-20cc-40cb-9dad-6de520d1ec28',
  '38e5276b-92f4-4c5f-b420-ba20e83e67c7',
  'f4e66a01-dc2e-4c69-9323-b953c3a6c14e',
  '0ca21de5-2df2-4a4c-b8cb-4e90899d0ef6',
  'd2769005-bf48-48f0-a15d-e3b62f8ebea4',
  '5700cc85-100e-4c62-89ad-34ce54eb0c8c',
  'f3b57fa8-9d7d-42f1-8da0-4d8c22ea420e',
  '6280e32e-70fb-49fb-85e5-d6aeae91f946',
  '63780264-bbf1-48de-86c1-1a3e4184b987',
  '6de8785e-0bd0-424e-97b9-8762658631a6',
  '83a033bd-e273-4314-8c9a-6a6bd8f4400e',
  'bb977914-8d4d-4aa4-8785-7194d0289f49',
  '0af758ca-779f-44d1-815c-a8916917cf67'
)
ORDER BY u.nombre;
