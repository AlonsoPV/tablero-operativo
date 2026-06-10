-- =============================================================================
-- Duplica UAT-01, UAT-02 y UAT-03 para un responsable.
--
-- Origenes:
--   UAT-01 | Validación Perfil         → 45434a87-0ff5-4547-aa06-cb321a1f58ae
--   UAT-02 | Validación Kanban         → 04985aa7-2d2c-4640-add8-12bc38356333
--   UAT-03 | Validación Notificaciones → 2ddc81db-ffd3-4647-a66e-9ebb0934c8e1
--
-- Responsable destino: d2769005-bf48-48f0-a15d-e3b62f8ebea4
--   (acepta public.usuarios.id o auth.users.id)
--
-- Incluye checkpoints activos del origen (sin evidencias ni comentarios).
-- Idempotente por título + fecha + responsable + created_by.
--
-- Ejecutar en Supabase SQL Editor (dev o prod).
-- =============================================================================

-- 0) Diagnóstico del responsable destino
SELECT
  ref.user_ref,
  u.id AS usuarios_id,
  u.user_id AS auth_user_id,
  u.nombre,
  u.rol,
  u.area,
  au.email
FROM (VALUES ('d2769005-bf48-48f0-a15d-e3b62f8ebea4'::uuid)) AS ref(user_ref)
LEFT JOIN public.usuarios u
  ON u.id = ref.user_ref OR u.user_id = ref.user_ref
LEFT JOIN auth.users au ON au.id = u.user_id;

-- 0b) Verifica que existan las acciones origen
SELECT id, titulo_accion, fecha, responsable, estado
FROM public.acciones_diarias
WHERE id IN (
  '45434a87-0ff5-4547-aa06-cb321a1f58ae'::uuid,
  '04985aa7-2d2c-4640-add8-12bc38356333'::uuid,
  '2ddc81db-ffd3-4647-a66e-9ebb0934c8e1'::uuid
)
ORDER BY titulo_accion;

DO $$
DECLARE
  v_user_ref uuid := 'd2769005-bf48-48f0-a15d-e3b62f8ebea4';
  v_source_ids uuid[] := ARRAY[
    '45434a87-0ff5-4547-aa06-cb321a1f58ae'::uuid,
    '04985aa7-2d2c-4640-add8-12bc38356333'::uuid,
    '2ddc81db-ffd3-4647-a66e-9ebb0934c8e1'::uuid
  ];
  v_source_id uuid;
  v_resp uuid;
  v_new_id uuid;
  v_existing_id uuid;
  v_source record;
  v_inserted int := 0;
  v_skipped int := 0;
  v_auth_email text;
BEGIN
  SELECT u.id
  INTO v_resp
  FROM public.usuarios u
  WHERE u.id = v_user_ref OR u.user_id = v_user_ref
  LIMIT 1;

  IF v_resp IS NULL THEN
    SELECT au.email
    INTO v_auth_email
    FROM auth.users au
    WHERE au.id = v_user_ref;

    IF v_auth_email IS NOT NULL THEN
      RAISE EXCEPTION
        'Existe auth.users (email=%) pero no hay fila en public.usuarios para user_id=%. Crea la ficha de negocio primero.',
        v_auth_email,
        v_user_ref;
    END IF;

    RAISE EXCEPTION 'Usuario no encontrado (ni usuarios.id ni auth.users.id): %', v_user_ref;
  END IF;

  FOREACH v_source_id IN ARRAY v_source_ids LOOP
    SELECT *
    INTO v_source
    FROM public.acciones_diarias
    WHERE id = v_source_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Acción origen no encontrada: %', v_source_id;
    END IF;

    SELECT a.id
    INTO v_existing_id
    FROM public.acciones_diarias a
    WHERE a.titulo_accion = v_source.titulo_accion
      AND a.fecha = v_source.fecha
      AND a.responsable = v_resp
      AND a.created_by IS NOT DISTINCT FROM v_source.created_by
      AND a.id <> v_source_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE NOTICE 'Ya existe copia de "%" → acción %', v_source.titulo_accion, v_existing_id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.acciones_diarias (
      fecha,
      titulo_accion,
      descripcion_accion,
      responsable,
      hora_limite,
      evidencia_esperada,
      evidencia_cargada,
      evidencia_adjunta,
      estado,
      kpi_afectado,
      okr_impactado,
      proceso,
      area,
      cliente_id,
      prioridad,
      causa_raiz,
      responsable_bloqueo,
      escalado,
      fecha_escalamiento,
      notas_escalamiento,
      repeticion,
      verificador_dato,
      verificador_gobierno,
      created_by,
      updated_by,
      gap_id,
      story_points,
      catalog_kpi_id,
      tipo_accion,
      completed_at,
      completed_by,
      verified_at,
      verified_by,
      sprint_id
    )
    VALUES (
      v_source.fecha,
      v_source.titulo_accion,
      v_source.descripcion_accion,
      v_resp,
      v_source.hora_limite,
      v_source.evidencia_esperada,
      false,
      null,
      'Pendiente'::action_status,
      v_source.kpi_afectado,
      v_source.okr_impactado,
      v_source.proceso,
      v_source.area,
      v_source.cliente_id,
      v_source.prioridad,
      v_source.causa_raiz,
      v_source.responsable_bloqueo,
      false,
      null,
      null,
      v_source.repeticion,
      v_source.verificador_dato,
      v_source.verificador_gobierno,
      v_source.created_by,
      null,
      v_source.gap_id,
      v_source.story_points,
      v_source.catalog_kpi_id,
      v_source.tipo_accion,
      null,
      null,
      null,
      null,
      v_source.sprint_id
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.accion_checkpoints (
      accion_id,
      texto,
      orden,
      obligatorio,
      activo,
      completado,
      checked_at,
      checked_by
    )
    SELECT
      v_new_id,
      c.texto,
      c.orden,
      c.obligatorio,
      c.activo,
      false,
      null,
      null
    FROM public.accion_checkpoints c
    WHERE c.accion_id = v_source_id
      AND c.activo = true
    ORDER BY c.orden;

    INSERT INTO public.accion_gaps (accion_id, gap_id)
    SELECT v_new_id, ag.gap_id
    FROM public.accion_gaps ag
    WHERE ag.accion_id = v_source_id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.accion_catalog_kpis (accion_id, catalog_kpi_id)
    SELECT v_new_id, ak.catalog_kpi_id
    FROM public.accion_catalog_kpis ak
    WHERE ak.accion_id = v_source_id
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Copia creada: "%" → % (usuarios.id %)', v_source.titulo_accion, v_new_id, v_resp;
    v_inserted := v_inserted + 1;
  END LOOP;

  RAISE NOTICE 'Listo. Insertadas: %, omitidas (ya existían): %', v_inserted, v_skipped;
END $$;

-- Verificación
SELECT
  a.id,
  a.titulo_accion,
  a.fecha,
  a.estado,
  a.prioridad,
  a.responsable,
  u.nombre AS responsable_nombre,
  u.user_id AS responsable_auth_id,
  (SELECT count(*) FROM public.accion_checkpoints cp WHERE cp.accion_id = a.id AND cp.activo) AS checkpoints
FROM public.acciones_diarias a
JOIN public.usuarios u ON u.id = a.responsable
WHERE a.titulo_accion IN (
  'UAT-01 | Validación Perfil',
  'UAT-02 | Validación Kanban',
  'UAT-03 | Validación Notificaciones'
)
AND (
  u.id = 'd2769005-bf48-48f0-a15d-e3b62f8ebea4'::uuid
  OR u.user_id = 'd2769005-bf48-48f0-a15d-e3b62f8ebea4'::uuid
)
ORDER BY a.titulo_accion;
