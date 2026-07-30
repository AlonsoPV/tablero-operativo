-- Kanban por equipos: unificar estatus con el catálogo corporativo (`statuses`).
-- `acciones_equipo.estado_id` pasa a referenciar `statuses.id` (global).
-- Las columnas del tablero salen del mismo catálogo que Kanban corporativo.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.team_kanban_default_status_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.id
  FROM public.statuses s
  WHERE s.activo
  ORDER BY s.orden, s.nombre
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_map_legacy_state_to_status(p_legacy_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_status_id uuid;
BEGIN
  IF p_legacy_id IS NULL THEN
    RETURN public.team_kanban_default_status_id();
  END IF;

  IF EXISTS (SELECT 1 FROM public.statuses s WHERE s.id = p_legacy_id) THEN
    RETURN p_legacy_id;
  END IF;

  IF to_regclass('public.area_kanban_estados') IS NOT NULL THEN
    SELECT st.id
    INTO v_status_id
    FROM public.area_kanban_estados aks
    JOIN public.statuses st
      ON public.area_kanban_state_alias(st.nombre) = public.area_kanban_state_alias(aks.nombre)
    WHERE aks.id = p_legacy_id
    ORDER BY st.activo DESC, st.orden, st.nombre
    LIMIT 1;
  END IF;

  RETURN coalesce(v_status_id, public.team_kanban_default_status_id());
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_catalog_states_json(p_area_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'area_id', p_area_id,
        'nombre', s.nombre,
        'orden', s.orden,
        'color', coalesce(nullif(btrim(s.color), ''), '#64748b'),
        'es_final', s.es_cierre
      )
      ORDER BY s.orden, s.nombre
    ),
    '[]'::jsonb
  )
  FROM public.statuses s
  WHERE s.activo;
$$;

-- ---------------------------------------------------------------------------
-- Migrar FK acciones_equipo.estado_id → statuses (idempotente, lock acotado)
-- Ejecutar sin otras migraciones/consultas pesadas en paralelo sobre estas tablas.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sync_area_kanban_estados_from_status ON public.statuses;
DROP FUNCTION IF EXISTS public.sync_area_kanban_estados_from_status_catalog();

DO $$
DECLARE
  v_fk_target text;
BEGIN
  -- Evita dos ejecuciones concurrentes de esta migración (p. ej. SQL Editor + CLI).
  PERFORM pg_advisory_xact_lock(202607291720);

  SELECT frel.relname
  INTO v_fk_target
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_class frel ON frel.oid = c.confrelid
  WHERE c.conname = 'acciones_equipo_estado_id_fkey'
    AND rel.relname = 'acciones_equipo'
  LIMIT 1;

  IF v_fk_target = 'statuses' THEN
    RAISE NOTICE 'acciones_equipo.estado_id ya referencia statuses; se omite migración de datos/FK';
    RETURN;
  END IF;

  PERFORM set_config('lock_timeout', '120s', true);
  PERFORM set_config('statement_timeout', '300s', true);

  ALTER TABLE public.acciones_equipo
    DROP CONSTRAINT IF EXISTS acciones_equipo_estado_id_fkey;

  UPDATE public.acciones_equipo ae
  SET estado_id = public.team_kanban_map_legacy_state_to_status(ae.estado_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.statuses s WHERE s.id = ae.estado_id
  );

  UPDATE public.acciones_equipo ae
  SET estado_id = public.team_kanban_default_status_id()
  FROM public.statuses st
  WHERE ae.estado_id = st.id
    AND NOT st.activo;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'acciones_equipo_estado_id_fkey'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_estado_id_fkey
      FOREIGN KEY (estado_id) REFERENCES public.statuses(id) ON DELETE RESTRICT
      NOT VALID;

    ALTER TABLE public.acciones_equipo
      VALIDATE CONSTRAINT acciones_equipo_estado_id_fkey;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RPC: tablero
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.team_kanban_board(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_is_leader boolean;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT id
  INTO v_me
  FROM public.usuarios
  WHERE user_id = (SELECT auth.uid())
    AND activo = true
  LIMIT 1;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  v_is_leader := EXISTS (
    SELECT 1
    FROM public.area_lideres al
    WHERE al.area_id = p_area_id
      AND al.user_id = v_me
  );

  RETURN jsonb_build_object(
    'isLeader', v_is_leader,
    'canManage', true,
    'states', public.team_kanban_catalog_states_json(p_area_id),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) ORDER BY u.nombre)
      FROM public.usuarios u
      WHERE public.team_kanban_user_belongs_to_area(u.id, p_area_id)
    ), '[]'::jsonb),
    'actions', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('asignado_nombre', u.nombre) ORDER BY a.created_at DESC)
      FROM public.acciones_equipo a
      JOIN public.usuarios u ON u.id = a.asignado_a
      WHERE a.area_id = p_area_id
        AND a.es_plantilla = false
    ), '[]'::jsonb),
    'series', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(t) || jsonb_build_object(
          'asignado_nombre', u.nombre,
          'ocurrencias_total', (
            SELECT count(*)
            FROM public.acciones_equipo o
            WHERE o.serie_id = t.id
          ),
          'ocurrencias_abiertas', (
            SELECT count(*)
            FROM public.acciones_equipo o
            JOIN public.statuses s2 ON s2.id = o.estado_id
            WHERE o.serie_id = t.id
              AND o.completed_at IS NULL
              AND NOT s2.es_cierre
          ),
          'ultima_ocurrencia', (
            SELECT max(o.ocurrencia_fecha)
            FROM public.acciones_equipo o
            WHERE o.serie_id = t.id
          )
        )
        ORDER BY t.serie_activa DESC, t.created_at DESC
      )
      FROM public.acciones_equipo t
      JOIN public.usuarios u ON u.id = t.asignado_a
      WHERE t.area_id = p_area_id
        AND t.es_plantilla = true
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: actualizar acción
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.team_kanban_update_action(
  p_action_id uuid,
  p_state_id uuid DEFAULT NULL,
  p_assignee uuid DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_blocked boolean DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.acciones_equipo;
  v_final boolean;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT *
  INTO v_row
  FROM public.acciones_equipo
  WHERE id = p_action_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Accion no encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(v_row.area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  IF p_assignee IS NOT NULL
    AND NOT public.team_kanban_assignee_belongs_to_area(v_row.area_id, p_assignee)
  THEN
    RAISE EXCEPTION 'El responsable no pertenece al area de la accion'
      USING ERRCODE = '42501';
  END IF;

  IF p_state_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.statuses s
      WHERE s.id = p_state_id
        AND s.activo
    )
  THEN
    RAISE EXCEPTION 'Estado invalido'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.es_cierre
  INTO v_final
  FROM public.statuses s
  WHERE s.id = coalesce(p_state_id, v_row.estado_id);

  UPDATE public.acciones_equipo
  SET estado_id = coalesce(p_state_id, estado_id),
      asignado_a = coalesce(p_assignee, asignado_a),
      prioridad = coalesce(p_priority, prioridad),
      bloqueada = coalesce(p_blocked, bloqueada),
      fecha_limite = coalesce(p_due_at, fecha_limite),
      completed_at = CASE WHEN coalesce(v_final, false) THEN coalesce(completed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = p_action_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_update_action(uuid, uuid, uuid, text, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_update_action(uuid, uuid, uuid, text, boolean, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: crear acción (estado inicial = primer estatus activo del catálogo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.team_kanban_create_action(
  p_area_id uuid,
  p_title text,
  p_description text,
  p_assignee uuid,
  p_priority text,
  p_due_at timestamptz,
  p_evidence boolean,
  p_checklist jsonb DEFAULT '[]'::jsonb,
  p_evidence_text text DEFAULT NULL,
  p_story_points integer DEFAULT 0,
  p_tipo_accion text DEFAULT 'operativa',
  p_gap_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_catalog_kpi_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_es_frecuente boolean DEFAULT false,
  p_frecuencia_tipo text DEFAULT NULL,
  p_frecuencia_dia_semana smallint DEFAULT NULL,
  p_frecuencia_dia_mes smallint DEFAULT NULL,
  p_frecuencia_inicio date DEFAULT NULL
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_state uuid;
  v_row public.acciones_equipo;
  v_frecuencia_tipo text;
  v_frecuencia_dia_semana smallint;
  v_frecuencia_dia_mes smallint;
  v_es_frecuente boolean := coalesce(p_es_frecuente, false);
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT id
  INTO v_me
  FROM public.usuarios
  WHERE user_id = (SELECT auth.uid())
    AND activo = true
  LIMIT 1;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'Solo puedes crear acciones en areas asignadas a tu perfil'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_assignee_belongs_to_area(p_area_id, p_assignee) THEN
    RAISE EXCEPTION 'El responsable no pertenece al area seleccionada'
      USING ERRCODE = '42501';
  END IF;

  v_frecuencia_tipo := NULLIF(trim(coalesce(p_frecuencia_tipo, '')), '');
  v_frecuencia_dia_semana := p_frecuencia_dia_semana;
  v_frecuencia_dia_mes := p_frecuencia_dia_mes;

  IF v_es_frecuente THEN
    IF v_frecuencia_tipo NOT IN ('diaria', 'semanal', 'quincenal', 'mensual') THEN
      RAISE EXCEPTION 'Frecuencia invalida'
        USING ERRCODE = '22023';
    END IF;

    IF v_frecuencia_tipo = 'semanal'
      AND (v_frecuencia_dia_semana IS NULL OR v_frecuencia_dia_semana NOT BETWEEN 1 AND 7) THEN
      RAISE EXCEPTION 'Dia de semana invalido para accion frecuente'
        USING ERRCODE = '22023';
    END IF;

    IF v_frecuencia_tipo IN ('quincenal', 'mensual')
      AND (v_frecuencia_dia_mes IS NULL OR v_frecuencia_dia_mes NOT BETWEEN 1 AND 31) THEN
      RAISE EXCEPTION 'Dia de referencia invalido para accion frecuente'
        USING ERRCODE = '22023';
    END IF;

    IF v_frecuencia_tipo <> 'semanal' THEN
      v_frecuencia_dia_semana := NULL;
    END IF;

    IF v_frecuencia_tipo NOT IN ('quincenal', 'mensual') THEN
      v_frecuencia_dia_mes := NULL;
    END IF;
  ELSE
    v_frecuencia_tipo := NULL;
    v_frecuencia_dia_semana := NULL;
    v_frecuencia_dia_mes := NULL;
  END IF;

  v_state := public.team_kanban_default_status_id();

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'No hay estatus activos en el catalogo corporativo'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.acciones_equipo(
    area_id,
    estado_id,
    titulo,
    descripcion,
    asignado_a,
    lider_id,
    creado_por,
    prioridad,
    fecha_limite,
    evidencia_requerida,
    evidencia_esperada,
    checklist,
    story_points,
    tipo_accion,
    gap_ids,
    catalog_kpi_ids,
    es_frecuente,
    es_plantilla,
    serie_activa,
    frecuencia_tipo,
    frecuencia_dia_semana,
    frecuencia_dia_mes,
    frecuencia_inicio,
    frecuencia_config
  )
  VALUES (
    p_area_id,
    v_state,
    trim(p_title),
    nullif(trim(p_description), ''),
    p_assignee,
    v_me,
    v_me,
    p_priority,
    p_due_at,
    p_evidence,
    nullif(trim(coalesce(p_evidence_text, '')), ''),
    coalesce(p_checklist, '[]'::jsonb),
    coalesce(p_story_points, 0),
    coalesce(p_tipo_accion, 'operativa'),
    coalesce(p_gap_ids, ARRAY[]::uuid[]),
    coalesce(p_catalog_kpi_ids, ARRAY[]::uuid[]),
    v_es_frecuente,
    v_es_frecuente,
    true,
    v_frecuencia_tipo,
    v_frecuencia_dia_semana,
    v_frecuencia_dia_mes,
    CASE WHEN v_es_frecuente THEN coalesce(p_frecuencia_inicio, p_due_at::date, CURRENT_DATE) ELSE NULL END,
    CASE
      WHEN v_es_frecuente THEN jsonb_build_object(
        'captura_recomendada', 'El responsable debe registrar una actualizacion y cerrar los puntos de validacion en cada periodo.',
        'primer_vencimiento', p_due_at,
        'requiere_apoyo_documental', p_evidence
      )
      ELSE '{}'::jsonb
    END
  )
  RETURNING * INTO v_row;

  IF v_es_frecuente THEN
    PERFORM public.team_kanban_generate_serie(v_row.id);
  END IF;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: ocurrencias de serie recurrente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.team_kanban_generate_serie(p_template_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.acciones_equipo;
  v_today date;
  v_from date;
  v_state uuid;
  v_time time;
  v_date date;
  v_checklist jsonb;
  v_created integer := 0;
  v_inserted uuid;
BEGIN
  SELECT *
  INTO t
  FROM public.acciones_equipo
  WHERE id = p_template_id
    AND es_plantilla = true;

  IF t.id IS NULL OR t.serie_activa = false OR t.es_frecuente = false OR t.frecuencia_tipo IS NULL THEN
    RETURN 0;
  END IF;

  v_today := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_from := greatest(coalesce(t.frecuencia_inicio, t.created_at::date), v_today - 120);

  IF v_from > v_today THEN
    RETURN 0;
  END IF;

  v_state := public.team_kanban_default_status_id();

  IF v_state IS NULL THEN
    RETURN 0;
  END IF;

  v_time := coalesce((t.fecha_limite AT TIME ZONE 'America/Mexico_City')::time, time '18:00');

  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'text', item->>'text',
      'done', false,
      'responsable_id', coalesce(item->'responsable_id', 'null'::jsonb)
    )),
    '[]'::jsonb
  )
  INTO v_checklist
  FROM jsonb_array_elements(coalesce(t.checklist, '[]'::jsonb)) AS item
  WHERE btrim(coalesce(item->>'text', '')) <> '';

  FOR v_date IN
    SELECT g.d::date
    FROM generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') AS g(d)
    WHERE CASE t.frecuencia_tipo
      WHEN 'diaria' THEN true
      WHEN 'semanal' THEN EXTRACT(isodow FROM g.d)::int = coalesce(t.frecuencia_dia_semana, 1)
      WHEN 'mensual' THEN EXTRACT(day FROM g.d)::int = least(
        coalesce(t.frecuencia_dia_mes, 1),
        EXTRACT(day FROM (date_trunc('month', g.d) + interval '1 month - 1 day'))::int
      )
      WHEN 'quincenal' THEN EXTRACT(day FROM g.d)::int IN (
        least(
          coalesce(t.frecuencia_dia_mes, 1),
          EXTRACT(day FROM (date_trunc('month', g.d) + interval '1 month - 1 day'))::int
        ),
        least(
          coalesce(t.frecuencia_dia_mes, 1) + 15,
          EXTRACT(day FROM (date_trunc('month', g.d) + interval '1 month - 1 day'))::int
        )
      )
      ELSE false
    END
    ORDER BY 1
    LIMIT 200
  LOOP
    INSERT INTO public.acciones_equipo(
      area_id,
      estado_id,
      titulo,
      descripcion,
      asignado_a,
      lider_id,
      creado_por,
      prioridad,
      fecha_limite,
      evidencia_requerida,
      evidencia_esperada,
      checklist,
      story_points,
      tipo_accion,
      gap_ids,
      catalog_kpi_ids,
      es_frecuente,
      es_plantilla,
      frecuencia_tipo,
      frecuencia_dia_semana,
      frecuencia_dia_mes,
      frecuencia_inicio,
      frecuencia_config,
      serie_id,
      ocurrencia_fecha
    )
    VALUES (
      t.area_id,
      v_state,
      t.titulo,
      t.descripcion,
      t.asignado_a,
      t.lider_id,
      t.creado_por,
      t.prioridad,
      (v_date + v_time) AT TIME ZONE 'America/Mexico_City',
      t.evidencia_requerida,
      t.evidencia_esperada,
      v_checklist,
      t.story_points,
      t.tipo_accion,
      t.gap_ids,
      t.catalog_kpi_ids,
      true,
      false,
      t.frecuencia_tipo,
      t.frecuencia_dia_semana,
      t.frecuencia_dia_mes,
      t.frecuencia_inicio,
      t.frecuencia_config,
      t.id,
      v_date
    )
    ON CONFLICT (serie_id, ocurrencia_fecha) WHERE serie_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NOT NULL THEN
      v_created := v_created + 1;
      v_inserted := NULL;
    END IF;
  END LOOP;

  IF v_created > 0 THEN
    UPDATE public.acciones_equipo
    SET updated_at = now()
    WHERE id = t.id;
  END IF;

  RETURN v_created;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cerrar serie + conteo de áreas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.team_kanban_close_frequent_series(
  p_action_id uuid,
  p_close_pending boolean DEFAULT true,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.acciones_equipo;
  v_template public.acciones_equipo;
  v_me uuid;
  v_final uuid;
  v_closed integer := 0;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT *
  INTO v_row
  FROM public.acciones_equipo
  WHERE id = p_action_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Accion no encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(v_row.area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_template
  FROM public.acciones_equipo
  WHERE id = CASE WHEN v_row.es_plantilla THEN v_row.id ELSE v_row.serie_id END;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'La accion no pertenece a una serie recurrente'
      USING ERRCODE = '22023';
  END IF;

  SELECT id
  INTO v_me
  FROM public.usuarios
  WHERE user_id = (SELECT auth.uid())
    AND activo = true
  LIMIT 1;

  UPDATE public.acciones_equipo
  SET serie_activa = false,
      serie_cerrada_at = coalesce(serie_cerrada_at, now()),
      serie_cerrada_por = coalesce(serie_cerrada_por, v_me),
      serie_cierre_motivo = nullif(btrim(coalesce(p_reason, '')), ''),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  WHERE id = v_template.id;

  IF coalesce(p_close_pending, true) THEN
    SELECT s.id
    INTO v_final
    FROM public.statuses s
    WHERE s.activo
      AND s.es_cierre
    ORDER BY s.orden DESC
    LIMIT 1;

    IF v_final IS NOT NULL THEN
      WITH pendientes AS (
        SELECT o.id
        FROM public.acciones_equipo o
        JOIN public.statuses s ON s.id = o.estado_id
        WHERE o.serie_id = v_template.id
          AND o.completed_at IS NULL
          AND NOT s.es_cierre
      )
      UPDATE public.acciones_equipo o
      SET estado_id = v_final,
          completed_at = now(),
          bloqueada = false,
          updated_at = now()
      FROM pendientes p
      WHERE o.id = p.id;

      GET DIAGNOSTICS v_closed = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'serie_id', v_template.id,
    'ocurrencias_cerradas', v_closed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_my_areas_membership_source()
RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT u.id, u.area
    FROM public.usuarios u
    WHERE u.user_id = (SELECT auth.uid())
      AND u.activo = true
    LIMIT 1
  ),
  membership AS (
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN public.usuario_areas ua ON ua.area_id = a.id
    JOIN me ON me.id = ua.user_id
    UNION
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN me ON me.area IS NOT NULL
      AND lower(btrim(a.nombre)) = lower(btrim(me.area))
  ),
  visible AS (
    SELECT a.id, a.nombre
    FROM public.areas a
    WHERE public.team_kanban_current_user_is_global_admin()
    UNION
    SELECT m.id, m.nombre
    FROM membership m
  )
  SELECT
    v.id,
    v.nombre,
    EXISTS (
      SELECT 1
      FROM public.area_lideres al
      CROSS JOIN me
      WHERE al.area_id = v.id
        AND al.user_id = me.id
    ) AS is_leader,
    (
      SELECT count(*)
      FROM public.usuarios u
      WHERE public.team_kanban_user_belongs_to_area(u.id, v.id)
    ) AS member_count,
    (
      SELECT count(*)
      FROM public.acciones_equipo ae
      JOIN public.statuses s ON s.id = ae.estado_id
      WHERE ae.area_id = v.id
        AND ae.es_plantilla = false
        AND NOT s.es_cierre
    ) AS open_count
  FROM visible v
  ORDER BY v.nombre;
$$;

COMMENT ON FUNCTION public.team_kanban_catalog_states_json(uuid) IS
  'Columnas del Kanban por equipos: mismo catálogo global statuses que el tablero corporativo.';

NOTIFY pgrst, 'reload schema';
