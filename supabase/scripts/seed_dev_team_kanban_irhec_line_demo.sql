-- =============================================================================
-- DEV DEMO: Kanban por Equipos — actividades en todas las lineas organizacionales
--
-- Proyecto: tgiuevzlyptzlfgxsfhj (DEV)
--
-- Lineas demo:
--   • Irhec      → Operaciones
--   • Abraham    → Planeacion
--   • Nancy      → Finanzas
--   • Leslie     → Sistemas
--   • Gerardo    → Proyectos
--   • Damaris    → RH
--
-- Crea plantillas FRECUENTES (unicas) + acciones UNicas por linea.
-- Idempotente: seed_pack = dev_team_lines_demo_v2
-- Ejecutar en Supabase SQL Editor con rol postgres / service_role.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_seed constant text := 'dev_team_lines_demo_v2';
  v_default_status uuid;
  v_status_pendiente uuid;
  v_status_progreso uuid;
  v_status_retraso uuid;
  v_status_hecho uuid;
  v_prio_alta text;
  v_prio_media text;
  v_prio_baja text;

  line_rec record;
  v_area_id uuid;
  v_leader_id uuid;
  v_branch_ids uuid[];
  v_branch_count int;
  v_template_id uuid;
  v_generated int;
  v_member uuid;
  action_rec record;
  idx int;
BEGIN
  -- -------------------------------------------------------------------------
  -- Catalogos compartidos
  -- -------------------------------------------------------------------------
  v_default_status := public.team_kanban_default_status_id();
  IF v_default_status IS NULL THEN
    RAISE EXCEPTION 'No hay estatus corporativos activos.';
  END IF;

  SELECT s.id INTO v_status_pendiente
  FROM public.statuses s
  WHERE s.activo AND lower(coalesce(s.estado_key, s.nombre)) IN ('pendiente', 'por_hacer', 'todo')
  ORDER BY s.orden NULLS LAST LIMIT 1;

  SELECT s.id INTO v_status_progreso
  FROM public.statuses s
  WHERE s.activo AND lower(coalesce(s.estado_key, s.nombre)) IN ('en_progreso', 'en progreso', 'doing', 'activo')
  ORDER BY s.orden NULLS LAST LIMIT 1;

  SELECT s.id INTO v_status_retraso
  FROM public.statuses s
  WHERE s.activo AND lower(coalesce(s.estado_key, s.nombre)) IN ('retraso', 'vencido', 'vencida', 'atrasado')
  ORDER BY s.orden NULLS LAST LIMIT 1;

  SELECT s.id INTO v_status_hecho
  FROM public.statuses s
  WHERE s.activo AND (s.es_cierre OR lower(coalesce(s.estado_key, s.nombre)) IN ('hecho', 'done', 'completado', 'cerrado'))
  ORDER BY CASE WHEN s.es_cierre THEN 0 ELSE 1 END, s.orden NULLS LAST LIMIT 1;

  v_status_pendiente := coalesce(v_status_pendiente, v_default_status);
  v_status_progreso := coalesce(v_status_progreso, v_default_status);
  v_status_retraso := coalesce(v_status_retraso, v_default_status);
  v_status_hecho := coalesce(v_status_hecho, v_default_status);

  SELECT p.nombre INTO v_prio_alta FROM public.priorities p WHERE p.activo ORDER BY p.orden NULLS FIRST LIMIT 1;
  SELECT p.nombre INTO v_prio_media FROM public.priorities p WHERE p.activo ORDER BY abs(coalesce(p.orden, 999) - 2) LIMIT 1;
  SELECT p.nombre INTO v_prio_baja FROM public.priorities p WHERE p.activo ORDER BY p.orden DESC NULLS LAST LIMIT 1;

  v_prio_alta := coalesce(v_prio_alta, 'P1_Critica');
  v_prio_media := coalesce(v_prio_media, 'P2_Media');
  v_prio_baja := coalesce(v_prio_baja, 'P3_Baja');

  CREATE TEMP TABLE tmp_demo_lines (
    line_key text PRIMARY KEY,
    area_nombre text NOT NULL,
    leader_email text,
    leader_name text,
    title_tag text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_demo_lines (line_key, area_nombre, leader_email, leader_name, title_tag) VALUES
    ('irhec',   'Operaciones',       'irhec.vazquez@envialomexico.com', NULL,              'IRHEC'),
    ('abraham', 'Planeación',        'e.mendez@nbio.mx',                NULL,              'ABRAHAM'),
    ('nancy',   'Finanzas',          'nancy.rojo@envialomexico.com',    NULL,              'NANCY'),
    ('leslie',  'Sistemas',          'l.diaz@nbio.mx',                  NULL,              'LESLIE'),
    ('gerardo', 'Proyectos',         NULL,                              'Gerardo Puga',    'GERARDO'),
    ('damaris', 'RH',                NULL,                              'Damaris Medrano', 'DAMARIS');

  CREATE TEMP TABLE tmp_demo_actions (
    line_key text NOT NULL REFERENCES tmp_demo_lines(line_key),
    kind text NOT NULL CHECK (kind IN ('frequent', 'unique')),
    titulo text NOT NULL,
    descripcion text NOT NULL,
    frecuencia text,
    dia_semana smallint,
    dia_mes smallint,
    estado text,
    prioridad_key text,
    due_offset_days int,
    evidencia boolean NOT NULL DEFAULT false,
    ord int NOT NULL,
    PRIMARY KEY (line_key, kind, ord)
  ) ON COMMIT DROP;

  -- Irhec / Operaciones
  INSERT INTO tmp_demo_actions VALUES
    ('irhec', 'frequent', 'Corte matutino de operaciones', 'Revision diaria de guias, incidencias nocturnas y prioridades del turno.', 'diaria', NULL, NULL, NULL, 'alta', 0, true, 0),
    ('irhec', 'frequent', 'Revision OTIF y excepciones', 'Validar pedidos fuera de SLA y plan de recuperacion.', 'semanal', 1, NULL, NULL, 'media', 0, false, 1),
    ('irhec', 'unique', 'Auditar guias con retraso >48h', 'Muestra de 15 guias vencidas con causa raiz por cliente.', NULL, NULL, NULL, 'retraso', 'alta', -2, true, 0),
    ('irhec', 'unique', 'Tablero de excepciones en piso', 'TOP 5 riesgos del dia con responsable visible.', NULL, NULL, NULL, 'pendiente', 'media', 4, false, 1);

  -- Abraham / Planeacion
  INSERT INTO tmp_demo_actions VALUES
    ('abraham', 'frequent', 'Seguimiento S&OP semanal', 'Conciliar demanda, capacidad y riesgos de cumplimiento.', 'semanal', 2, NULL, NULL, 'alta', 0, false, 0),
    ('abraham', 'frequent', 'Cierre de forecast mensual', 'Validar proyeccion vs real y desviaciones por familia.', 'mensual', NULL, 5, NULL, 'media', 0, true, 1),
    ('abraham', 'unique', 'Actualizar tablero de capacidad Q3', 'Incluir restricciones de muelle y personal critico.', NULL, NULL, NULL, 'progreso', 'media', 3, false, 0),
    ('abraham', 'unique', 'Alinear plan maestro con operaciones', 'Sesion de prioridades compartidas con Irhec.', NULL, NULL, NULL, 'pendiente', 'alta', 5, false, 1);

  -- Nancy / Finanzas
  INSERT INTO tmp_demo_actions VALUES
    ('nancy', 'frequent', 'Conciliacion de cobranza', 'Revisar cartera vencida y acuerdos pendientes.', 'semanal', 5, NULL, NULL, 'media', 0, false, 0),
    ('nancy', 'unique', 'Cierre preliminar de semana', 'Validar flujo y variaciones vs presupuesto.', NULL, NULL, NULL, 'progreso', 'media', 1, true, 0),
    ('nancy', 'unique', 'Reporte de exposicion de clientes', 'TOP clientes con riesgo de impago.', NULL, NULL, NULL, 'pendiente', 'alta', 4, false, 1);

  -- Leslie / Sistemas
  INSERT INTO tmp_demo_actions VALUES
    ('leslie', 'frequent', 'Monitoreo de incidentes criticos', 'Revisar alertas, SLA de soporte y tickets P1 abiertos.', 'diaria', NULL, NULL, NULL, 'alta', 0, false, 0),
    ('leslie', 'frequent', 'Backup y salud de integraciones', 'Validar jobs nocturnos y colas de sincronizacion.', 'semanal', 3, NULL, NULL, 'media', 0, true, 1),
    ('leslie', 'unique', 'Parche de seguridad en portal interno', 'Aplicar fix y validar accesos de prueba.', NULL, NULL, NULL, 'progreso', 'alta', 2, false, 0),
    ('leslie', 'unique', 'Documentar runbook de caida WMS', 'Procedimiento de contingencia para operaciones.', NULL, NULL, NULL, 'hecho', 'media', -3, false, 1);

  -- Gerardo / Proyectos
  INSERT INTO tmp_demo_actions VALUES
    ('gerardo', 'frequent', 'Comite de avance de proyectos', 'Estado de hitos, bloqueos y dependencias interareas.', 'semanal', 1, NULL, NULL, 'media', 0, false, 0),
    ('gerardo', 'unique', 'Kickoff mejora de embarque express', 'Definir alcance, KPI y responsables por area.', NULL, NULL, NULL, 'pendiente', 'alta', 7, false, 0),
    ('gerardo', 'unique', 'Cierre de fase piloto O2C', 'Lecciones aprendidas y plan de escalamiento.', NULL, NULL, NULL, 'progreso', 'media', 2, true, 1);

  -- Damaris / RH
  INSERT INTO tmp_demo_actions VALUES
    ('damaris', 'frequent', 'Seguimiento de altas y bajas', 'Confirmar documentacion y accesos de nuevos ingresos.', 'semanal', 4, NULL, NULL, 'media', 0, false, 0),
    ('damaris', 'frequent', 'Revision de incidencias laborales', 'Casos abiertos, riesgos y acuerdos pendientes.', 'quincenal', NULL, 1, NULL, 'alta', 0, false, 1),
    ('damaris', 'unique', 'Actualizar matriz de capacitacion', 'Cursos obligatorios por puesto y vencimientos.', NULL, NULL, NULL, 'pendiente', 'baja', 6, false, 0),
    ('damaris', 'unique', 'Entrevistas de salida pendientes', 'Cerrar entrevistas de bajas recientes.', NULL, NULL, NULL, 'retraso', 'media', -1, false, 1);

  -- -------------------------------------------------------------------------
  -- Limpieza idempotente (packs v1 y v2)
  -- -------------------------------------------------------------------------
  DELETE FROM public.acciones_equipo occ
  USING public.acciones_equipo tmpl
  WHERE occ.serie_id = tmpl.id
    AND tmpl.es_plantilla = true
    AND tmpl.frecuencia_config->>'seed_pack' IN ('dev_irhec_line_demo_v1', v_seed);

  DELETE FROM public.acciones_equipo
  WHERE frecuencia_config->>'seed_pack' IN ('dev_irhec_line_demo_v1', v_seed)
     OR coalesce(descripcion, '') LIKE '%seed_pack:dev_irhec_line_demo_v1%'
     OR coalesce(descripcion, '') LIKE '%seed_pack:' || v_seed || '%';

  -- -------------------------------------------------------------------------
  -- Procesar cada linea organizacional
  -- -------------------------------------------------------------------------
  FOR line_rec IN
    SELECT * FROM tmp_demo_lines ORDER BY line_key
  LOOP
    SELECT a.id INTO v_area_id
    FROM public.areas a
    WHERE lower(btrim(a.nombre)) = lower(btrim(line_rec.area_nombre))
      AND coalesce(a.activo, true)
    ORDER BY a.created_at NULLS LAST
    LIMIT 1;

    IF v_area_id IS NULL THEN
      RAISE WARNING 'Area % no encontrada; se omite linea %', line_rec.area_nombre, line_rec.line_key;
      CONTINUE;
    END IF;

    SELECT u.id INTO v_leader_id
    FROM public.usuarios u
    LEFT JOIN auth.users au ON au.id = u.user_id
    WHERE u.activo = true
      AND (
        (line_rec.leader_email IS NOT NULL AND lower(btrim(au.email)) = lower(line_rec.leader_email))
        OR (line_rec.leader_name IS NOT NULL AND lower(btrim(u.nombre)) = lower(btrim(line_rec.leader_name)))
      )
    ORDER BY
      CASE WHEN line_rec.leader_email IS NOT NULL AND lower(btrim(au.email)) = lower(line_rec.leader_email) THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_leader_id IS NULL THEN
      RAISE WARNING 'Lider no encontrado para linea % (%); se omite.', line_rec.line_key, line_rec.area_nombre;
      CONTINUE;
    END IF;

    INSERT INTO public.area_lideres (area_id, user_id)
    SELECT v_area_id, v_leader_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.area_lideres al
      WHERE al.area_id = v_area_id AND al.user_id = v_leader_id
    );

    UPDATE public.usuarios report
    SET
      manager_user_id = v_leader_id,
      area = coalesce(nullif(btrim(report.area), ''), line_rec.area_nombre),
      updated_at = now()
    WHERE report.activo = true
      AND report.id <> v_leader_id
      AND report.manager_user_id IS NULL
      AND lower(btrim(coalesce(report.area, ''))) = lower(btrim(line_rec.area_nombre));

    INSERT INTO public.usuario_areas (user_id, area_id)
    SELECT candidate.id, v_area_id
    FROM public.usuarios candidate
    WHERE candidate.activo = true
      AND (
        candidate.id = v_leader_id
        OR candidate.manager_user_id = v_leader_id
        OR lower(btrim(candidate.area)) = lower(btrim(line_rec.area_nombre))
      )
    ON CONFLICT DO NOTHING;

    WITH RECURSIVE branch AS (
      SELECT u.id FROM public.usuarios u
      WHERE u.id = v_leader_id AND u.activo = true
      UNION ALL
      SELECT child.id FROM public.usuarios child
      JOIN branch parent ON child.manager_user_id = parent.id
      WHERE child.activo = true
    )
    SELECT coalesce(array_agg(b.id ORDER BY b.id), ARRAY[v_leader_id])
    INTO v_branch_ids
    FROM branch b;

    v_branch_count := greatest(coalesce(array_length(v_branch_ids, 1), 1), 1);

    RAISE NOTICE 'Linea % — area %, lider %, rama=% personas',
      line_rec.title_tag, line_rec.area_nombre, v_leader_id, v_branch_count;

    FOR action_rec IN
      SELECT * FROM tmp_demo_actions
      WHERE line_key = line_rec.line_key
      ORDER BY kind DESC, ord
    LOOP
      idx := action_rec.ord;
      v_member := v_branch_ids[1 + (idx % v_branch_count)];

      IF action_rec.kind = 'frequent' THEN
        INSERT INTO public.acciones_equipo (
          area_id, estado_id, titulo, descripcion, prioridad,
          asignado_a, lider_id, creado_por, fecha_limite,
          evidencia_requerida, evidencia_esperada, checklist,
          es_frecuente, es_plantilla, serie_activa,
          frecuencia_tipo, frecuencia_dia_semana, frecuencia_dia_mes,
          frecuencia_inicio, frecuencia_config
        )
        VALUES (
          v_area_id,
          v_default_status,
          '[DEMO ' || line_rec.title_tag || '] ' || action_rec.titulo,
          action_rec.descripcion || E'\n\nseed_pack:' || v_seed,
          CASE action_rec.prioridad_key WHEN 'alta' THEN v_prio_alta WHEN 'baja' THEN v_prio_baja ELSE v_prio_media END,
          v_member,
          v_leader_id,
          v_leader_id,
          ((current_date + 1)::timestamp + time '17:00') AT TIME ZONE 'America/Mexico_City',
          action_rec.evidencia,
          CASE WHEN action_rec.evidencia THEN 'Evidencia verificable del periodo.' ELSE NULL END,
          jsonb_build_array(
            jsonb_build_object('text', 'Ejecutar actividad del periodo', 'done', false, 'responsable_id', v_member),
            jsonb_build_object('text', 'Validar con lider de linea', 'done', false, 'responsable_id', v_leader_id)
          ),
          true, true, true,
          action_rec.frecuencia,
          action_rec.dia_semana,
          action_rec.dia_mes,
          current_date - 45,
          jsonb_build_object(
            'seed_pack', v_seed,
            'demo_line', line_rec.line_key,
            'demo_leader', line_rec.title_tag,
            'area', line_rec.area_nombre
          )
        )
        RETURNING id INTO v_template_id;

        v_generated := public.team_kanban_generate_serie(v_template_id);
        RAISE NOTICE '  Frecuente [%]: % → % ocurrencias', line_rec.title_tag, action_rec.titulo, v_generated;
      ELSE
        INSERT INTO public.acciones_equipo (
          area_id, estado_id, titulo, descripcion, prioridad,
          asignado_a, lider_id, creado_por, fecha_limite,
          evidencia_requerida, evidencia_esperada, checklist,
          es_frecuente, es_plantilla, serie_activa, completed_at, frecuencia_config
        )
        VALUES (
          v_area_id,
          CASE action_rec.estado
            WHEN 'retraso' THEN v_status_retraso
            WHEN 'progreso' THEN v_status_progreso
            WHEN 'hecho' THEN v_status_hecho
            ELSE v_status_pendiente
          END,
          '[DEMO ' || line_rec.title_tag || '] ' || action_rec.titulo,
          action_rec.descripcion || E'\n\nseed_pack:' || v_seed,
          CASE action_rec.prioridad_key WHEN 'alta' THEN v_prio_alta WHEN 'baja' THEN v_prio_baja ELSE v_prio_media END,
          v_member,
          v_leader_id,
          v_leader_id,
          ((current_date + action_rec.due_offset_days)::timestamp + time '18:00') AT TIME ZONE 'America/Mexico_City',
          action_rec.evidencia,
          CASE WHEN action_rec.evidencia THEN 'Evidencia breve en comentario o adjunto.' ELSE NULL END,
          jsonb_build_array(
            jsonb_build_object('text', 'Ejecutar actividad', 'done', action_rec.estado = 'hecho', 'responsable_id', v_member),
            jsonb_build_object('text', 'Validar con lider', 'done', false, 'responsable_id', v_leader_id)
          ),
          false, false, true,
          CASE WHEN action_rec.estado = 'hecho' THEN now() - interval '1 day' ELSE NULL END,
          jsonb_build_object(
            'seed_pack', v_seed,
            'demo_line', line_rec.line_key,
            'demo_leader', line_rec.title_tag,
            'area', line_rec.area_nombre,
            'kind', 'unique'
          )
        );
        RAISE NOTICE '  Unica [%]: % → asignado %', line_rec.title_tag, action_rec.titulo, v_member;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seed % completado en todas las lineas configuradas.', v_seed;
END $$;

COMMIT;

-- Verificacion:
-- SELECT a.nombre AS area, ae.titulo, ae.es_frecuente, ae.es_plantilla,
--        u_l.nombre AS lider, u_a.nombre AS asignado
-- FROM public.acciones_equipo ae
-- JOIN public.areas a ON a.id = ae.area_id
-- JOIN public.usuarios u_l ON u_l.id = ae.lider_id
-- JOIN public.usuarios u_a ON u_a.id = ae.asignado_a
-- WHERE ae.frecuencia_config->>'seed_pack' = 'dev_team_lines_demo_v2'
-- ORDER BY a.nombre, ae.es_plantilla DESC, ae.titulo;
