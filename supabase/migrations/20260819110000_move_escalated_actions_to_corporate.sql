-- El escalamiento se convierte en un traslado definitivo al Kanban Corporativo.

DROP TRIGGER IF EXISTS trg_team_kanban_sync_action_to_corporate
  ON public.acciones_equipo;
DROP TRIGGER IF EXISTS trg_team_kanban_sync_corporate_to_action
  ON public.acciones_diarias;

DROP FUNCTION IF EXISTS public.team_kanban_sync_action_to_corporate();
DROP FUNCTION IF EXISTS public.team_kanban_sync_corporate_to_action();

DROP INDEX IF EXISTS public.idx_acciones_equipo_accion_corporativa_id;

ALTER TABLE public.escalamiento_historial
  ADD COLUMN IF NOT EXISTS accion_equipo_origen_id uuid;

UPDATE public.escalamiento_historial
SET accion_equipo_origen_id = accion_equipo_id
WHERE accion_equipo_origen_id IS NULL;

ALTER TABLE public.escalamiento_historial
  ALTER COLUMN accion_equipo_id DROP NOT NULL;

ALTER TABLE public.escalamiento_historial
  DROP CONSTRAINT IF EXISTS escalamiento_historial_accion_equipo_id_fkey;

ALTER TABLE public.escalamiento_historial
  ADD CONSTRAINT escalamiento_historial_accion_equipo_id_fkey
  FOREIGN KEY (accion_equipo_id)
  REFERENCES public.acciones_equipo(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.team_kanban_finalize_corporate_transfer(
  p_action_id uuid,
  p_corporate_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.acciones_equipo;
BEGIN
  SELECT *
  INTO v_action
  FROM public.acciones_equipo
  WHERE id = p_action_id
  FOR UPDATE;

  IF v_action.id IS NULL THEN
    RAISE EXCEPTION 'Accion de equipo no encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_action.es_plantilla THEN
    RAISE EXCEPTION 'Una plantilla recurrente no se puede trasladar a Corporativo'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.accion_comentarios (
    accion_id,
    contenido,
    created_by,
    asignado,
    etiquetas,
    adjuntos,
    created_at
  )
  SELECT
    p_corporate_id,
    comment.contenido,
    comment.created_by,
    comment.asignado,
    comment.etiquetas,
    comment.adjuntos,
    comment.created_at
  FROM public.equipo_accion_comentarios comment
  WHERE comment.accion_id = p_action_id;

  INSERT INTO public.accion_checkpoints (
    accion_id,
    texto,
    orden,
    obligatorio,
    activo,
    completado,
    checked_at,
    checked_by,
    created_by,
    responsable_id
  )
  SELECT
    p_corporate_id,
    btrim(coalesce(item.value->>'text', item.value->>'texto')),
    item.ordinality::integer - 1,
    true,
    true,
    coalesce((item.value->>'done')::boolean, false),
    CASE WHEN coalesce((item.value->>'done')::boolean, false) THEN now() ELSE NULL END,
    CASE WHEN coalesce((item.value->>'done')::boolean, false) THEN p_actor_id ELSE NULL END,
    v_action.creado_por,
    CASE
      WHEN coalesce(item.value->>'responsable_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (item.value->>'responsable_id')::uuid
      ELSE NULL
    END
  FROM jsonb_array_elements(coalesce(v_action.checklist, '[]'::jsonb))
    WITH ORDINALITY AS item(value, ordinality)
  WHERE btrim(coalesce(item.value->>'text', item.value->>'texto', '')) <> '';

  INSERT INTO public.accion_gaps (accion_id, gap_id)
  SELECT p_corporate_id, gap_id
  FROM unnest(coalesce(v_action.gap_ids, ARRAY[]::uuid[])) AS gap_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.accion_catalog_kpis (accion_id, catalog_kpi_id)
  SELECT p_corporate_id, catalog_kpi_id
  FROM unnest(coalesce(v_action.catalog_kpi_ids, ARRAY[]::uuid[])) AS catalog_kpi_id
  ON CONFLICT DO NOTHING;

  UPDATE public.escalamiento_historial
  SET accion_equipo_origen_id = coalesce(accion_equipo_origen_id, p_action_id)
  WHERE accion_equipo_id = p_action_id
    AND accion_corporativa_id = p_corporate_id;

  DELETE FROM public.acciones_equipo
  WHERE id = p_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_escalate(
  p_action_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.acciones_equipo;
  v_actor_id uuid;
  v_corporate_id uuid;
  v_area_name text;
  v_status public.action_status;
  v_priority_id uuid;
  v_reason text;
BEGIN
  SELECT *
  INTO v_action
  FROM public.acciones_equipo
  WHERE id = p_action_id
  FOR UPDATE;

  SELECT u.id
  INTO v_actor_id
  FROM public.usuarios u
  WHERE u.user_id = (SELECT auth.uid())
    AND u.activo = true
  LIMIT 1;

  IF v_action.id IS NULL THEN
    RAISE EXCEPTION 'Accion de equipo no encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_id IS NULL OR NOT public.team_kanban_is_leader(v_action.area_id) THEN
    RAISE EXCEPTION 'Solo el lider del area puede escalar'
      USING ERRCODE = '42501';
  END IF;

  IF v_action.es_plantilla THEN
    RAISE EXCEPTION 'Una plantilla recurrente no se puede trasladar a Corporativo'
      USING ERRCODE = '22023';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'El motivo del escalamiento es obligatorio'
      USING ERRCODE = '22023';
  END IF;

  SELECT a.nombre
  INTO v_area_name
  FROM public.areas a
  WHERE a.id = v_action.area_id;

  SELECT s.estado_key::public.action_status
  INTO v_status
  FROM public.statuses s
  WHERE s.id = v_action.estado_id
  LIMIT 1;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'El estatus de la accion no tiene equivalencia corporativa'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.id
  INTO v_priority_id
  FROM public.priorities p
  WHERE lower(btrim(p.nombre)) = lower(btrim(v_action.prioridad))
  ORDER BY p.activo DESC, p.orden
  LIMIT 1;

  INSERT INTO public.acciones_diarias (
    fecha,
    titulo_accion,
    descripcion_accion,
    responsable,
    hora_limite,
    evidencia_esperada,
    estado,
    area,
    prioridad,
    prioridad_id,
    escalado,
    fecha_escalamiento,
    notas_escalamiento,
    story_points,
    tipo_accion,
    gap_id,
    catalog_kpi_id,
    completed_at,
    completed_by,
    verified_at,
    verified_by,
    created_by,
    updated_by
  )
  VALUES (
    coalesce(
      (v_action.fecha_limite AT TIME ZONE 'America/Mexico_City')::date,
      current_date
    ),
    left(v_action.titulo, 70),
    coalesce(nullif(btrim(v_action.descripcion), ''), v_action.titulo),
    v_action.asignado_a,
    coalesce(
      (v_action.fecha_limite AT TIME ZONE 'America/Mexico_City')::time,
      time '18:00'
    ),
    CASE
      WHEN v_action.evidencia_requerida THEN
        coalesce(nullif(btrim(v_action.evidencia_esperada), ''), 'Evidencia requerida')
      ELSE
        coalesce(nullif(btrim(v_action.evidencia_esperada), ''), 'Confirmacion de cierre')
    END,
    v_status,
    v_area_name,
    v_action.prioridad,
    v_priority_id,
    true,
    now(),
    v_reason,
    v_action.story_points,
    v_action.tipo_accion,
    (v_action.gap_ids)[1],
    (v_action.catalog_kpi_ids)[1],
    CASE
      WHEN v_status IN ('Hecho'::public.action_status, 'Verificado'::public.action_status)
        THEN coalesce(v_action.completed_at, now())
      ELSE NULL
    END,
    CASE
      WHEN v_status IN ('Hecho'::public.action_status, 'Verificado'::public.action_status)
        THEN v_actor_id
      ELSE NULL
    END,
    CASE WHEN v_status = 'Verificado'::public.action_status THEN now() ELSE NULL END,
    CASE WHEN v_status = 'Verificado'::public.action_status THEN v_actor_id ELSE NULL END,
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_corporate_id;

  INSERT INTO public.escalamiento_historial (
    accion_equipo_id,
    accion_equipo_origen_id,
    accion_corporativa_id,
    area_origen_id,
    escalado_por,
    motivo,
    prioridad
  )
  VALUES (
    p_action_id,
    p_action_id,
    v_corporate_id,
    v_action.area_id,
    v_actor_id,
    v_reason,
    v_action.prioridad
  );

  PERFORM public.team_kanban_finalize_corporate_transfer(
    p_action_id,
    v_corporate_id,
    v_actor_id
  );

  RETURN v_corporate_id;
END;
$$;

-- Consolida también acciones escaladas antes de este cambio.
DO $$
DECLARE
  linked record;
  v_actor_id uuid;
BEGIN
  FOR linked IN
    SELECT team_action.*
    FROM public.acciones_equipo team_action
    WHERE team_action.escalada = true
      AND team_action.accion_corporativa_id IS NOT NULL
      AND team_action.es_plantilla = false
  LOOP
    SELECT history.escalado_por
    INTO v_actor_id
    FROM public.escalamiento_historial history
    WHERE history.accion_equipo_id = linked.id
      AND history.accion_corporativa_id = linked.accion_corporativa_id
    ORDER BY history.created_at DESC
    LIMIT 1;

    v_actor_id := coalesce(v_actor_id, linked.lider_id, linked.creado_por);

    UPDATE public.acciones_diarias corporate
    SET titulo_accion = left(linked.titulo, 70),
        descripcion_accion = coalesce(nullif(btrim(linked.descripcion), ''), linked.titulo),
        responsable = linked.asignado_a,
        prioridad = linked.prioridad,
        prioridad_id = (
          SELECT p.id
          FROM public.priorities p
          WHERE lower(btrim(p.nombre)) = lower(btrim(linked.prioridad))
          ORDER BY p.activo DESC, p.orden
          LIMIT 1
        ),
        fecha = coalesce(
          (linked.fecha_limite AT TIME ZONE 'America/Mexico_City')::date,
          corporate.fecha
        ),
        hora_limite = coalesce(
          (linked.fecha_limite AT TIME ZONE 'America/Mexico_City')::time,
          corporate.hora_limite
        ),
        evidencia_esperada = CASE
          WHEN linked.evidencia_requerida THEN
            coalesce(nullif(btrim(linked.evidencia_esperada), ''), 'Evidencia requerida')
          ELSE
            coalesce(nullif(btrim(linked.evidencia_esperada), ''), corporate.evidencia_esperada)
        END,
        story_points = linked.story_points,
        tipo_accion = linked.tipo_accion,
        gap_id = coalesce((linked.gap_ids)[1], corporate.gap_id),
        catalog_kpi_id = coalesce((linked.catalog_kpi_ids)[1], corporate.catalog_kpi_id),
        updated_by = coalesce(v_actor_id, corporate.updated_by)
    WHERE corporate.id = linked.accion_corporativa_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.escalamiento_historial history
      WHERE history.accion_equipo_id = linked.id
        AND history.accion_corporativa_id = linked.accion_corporativa_id
    ) THEN
      INSERT INTO public.escalamiento_historial (
        accion_equipo_id,
        accion_equipo_origen_id,
        accion_corporativa_id,
        area_origen_id,
        escalado_por,
        motivo,
        prioridad
      )
      VALUES (
        linked.id,
        linked.id,
        linked.accion_corporativa_id,
        linked.area_id,
        v_actor_id,
        'Traslado definitivo de escalamiento previo',
        linked.prioridad
      );
    END IF;

    PERFORM public.team_kanban_finalize_corporate_transfer(
      linked.id,
      linked.accion_corporativa_id,
      v_actor_id
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_finalize_corporate_transfer(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_escalate(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_escalate(uuid, text)
  TO authenticated;

COMMENT ON COLUMN public.escalamiento_historial.accion_equipo_origen_id IS
  'UUID historico de la accion de equipo eliminada al completar el traslado corporativo.';
COMMENT ON FUNCTION public.team_kanban_escalate(uuid, text) IS
  'Traslada una accion de equipo a Corporativo, migra su informacion y elimina el origen.';

NOTIFY pgrst, 'reload schema';
