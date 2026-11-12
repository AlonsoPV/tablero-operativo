-- Iniciativas de OKR viven en Kanban corporativo (`acciones_diarias`).
-- Copia vínculos existentes de `acciones_equipo` y deja de aceptar team_action_id.

ALTER TABLE public.acciones_diarias
  ADD COLUMN IF NOT EXISTS es_okr boolean NOT NULL DEFAULT false;
ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS es_okr boolean NOT NULL DEFAULT false;

-- Reescribir vínculos existentes no debe revalidar alcance ni tag OKR.
ALTER TABLE public.okr_initiatives DISABLE TRIGGER okr_initiative_validation;
ALTER TABLE public.acciones_diarias DISABLE TRIGGER acciones_diarias_okr_tag;

-- Reutilizar acciones corporativas ya ligadas por escalamiento.
UPDATE public.okr_initiatives i
SET
  action_id = t.accion_corporativa_id,
  team_action_id = NULL
FROM public.acciones_equipo t
WHERE i.team_action_id = t.id
  AND i.action_id IS NULL
  AND t.accion_corporativa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.okr_initiatives other
    WHERE other.key_result_id = i.key_result_id
      AND other.action_id = t.accion_corporativa_id
      AND other.id <> i.id
  );

UPDATE public.acciones_diarias d
SET es_okr = true
FROM public.okr_initiatives i
WHERE i.action_id = d.id
  AND COALESCE(d.es_okr, false) = false;

WITH pending AS (
  SELECT
    i.id AS initiative_id,
    t.id AS team_action_id,
    gen_random_uuid() AS action_id,
    t.fecha_limite,
    t.created_at,
    t.titulo,
    t.descripcion,
    t.asignado_a,
    t.evidencia_requerida,
    t.evidencia_esperada,
    t.estado_id,
    t.area_id,
    t.prioridad,
    t.escalada,
    t.story_points,
    t.gap_ids,
    t.catalog_kpi_ids,
    t.completed_at,
    t.creado_por,
    t.lider_id
  FROM public.okr_initiatives i
  JOIN public.acciones_equipo t ON t.id = i.team_action_id
  WHERE i.action_id IS NULL
    AND i.team_action_id IS NOT NULL
),
inserted AS (
  INSERT INTO public.acciones_diarias (
    id,
    fecha,
    titulo_accion,
    descripcion_accion,
    responsable,
    hora_limite,
    evidencia_esperada,
    evidencia_cargada,
    estado,
    area,
    prioridad,
    prioridad_id,
    escalado,
    story_points,
    tipo_accion,
    gap_id,
    catalog_kpi_id,
    es_okr,
    completed_at,
    completed_by,
    created_by,
    updated_by
  )
  SELECT
    p.action_id,
    coalesce(
      (p.fecha_limite AT TIME ZONE 'America/Mexico_City')::date,
      (p.created_at AT TIME ZONE 'America/Mexico_City')::date,
      current_date
    ),
    left(p.titulo, 70),
    coalesce(nullif(btrim(p.descripcion), ''), p.titulo),
    p.asignado_a,
    coalesce(
      (p.fecha_limite AT TIME ZONE 'America/Mexico_City')::time,
      time '18:00'
    ),
    CASE
      WHEN p.evidencia_requerida THEN
        coalesce(nullif(btrim(p.evidencia_esperada), ''), 'Evidencia requerida')
      ELSE
        coalesce(nullif(btrim(p.evidencia_esperada), ''), 'Confirmacion de cierre')
    END,
    false,
    CASE
      WHEN s.estado_key IN (
        'Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso', 'Hecho', 'Verificado'
      ) THEN s.estado_key::public.action_status
      WHEN lower(btrim(COALESCE(s.estado_key, s.nombre, ''))) IN ('pendiente', 'asignado')
        THEN 'Pendiente'::public.action_status
      WHEN lower(btrim(COALESCE(s.estado_key, s.nombre, ''))) IN ('hoy')
        THEN 'Hoy'::public.action_status
      WHEN lower(btrim(COALESCE(s.estado_key, s.nombre, ''))) IN (
        'en_ejecucion', 'en ejecucion', 'en ejecución', 'en proceso', 'enproceso'
      ) THEN 'En_Ejecucion'::public.action_status
      WHEN lower(btrim(COALESCE(s.estado_key, s.nombre, ''))) IN ('bloqueado', 'bloqueada')
        THEN 'Bloqueado'::public.action_status
      WHEN lower(btrim(COALESCE(s.estado_key, s.nombre, ''))) IN ('retraso', 'vencido')
        THEN 'Retraso'::public.action_status
      WHEN lower(btrim(COALESCE(s.estado_key, s.nombre, ''))) IN ('hecho', 'terminado', 'realizado')
        THEN 'Hecho'::public.action_status
      WHEN lower(btrim(COALESCE(s.estado_key, s.nombre, ''))) IN ('verificado', 'validacion', 'validación')
        THEN 'Verificado'::public.action_status
      ELSE 'Pendiente'::public.action_status
    END,
    a.nombre,
    p.prioridad,
    pr.id,
    coalesce(p.escalada, false),
    coalesce(p.story_points, 0),
    'operativa',
    (p.gap_ids)[1],
    (p.catalog_kpi_ids)[1],
    true,
    CASE
      WHEN COALESCE(s.estado_key, lower(btrim(COALESCE(s.nombre, '')))) IN (
        'Hecho', 'Verificado', 'hecho', 'verificado'
      ) THEN p.completed_at
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(s.estado_key, lower(btrim(COALESCE(s.nombre, '')))) IN (
        'Hecho', 'Verificado', 'hecho', 'verificado'
      ) THEN p.asignado_a
      ELSE NULL
    END,
    coalesce(p.creado_por, p.lider_id, p.asignado_a),
    coalesce(p.creado_por, p.lider_id, p.asignado_a)
  FROM pending p
  LEFT JOIN public.areas a ON a.id = p.area_id
  LEFT JOIN public.statuses s ON s.id = p.estado_id
  LEFT JOIN LATERAL (
    SELECT pri.id
    FROM public.priorities pri
    WHERE lower(btrim(pri.nombre)) = lower(btrim(p.prioridad))
    ORDER BY pri.activo DESC, pri.orden
    LIMIT 1
  ) pr ON true
  RETURNING id
)
UPDATE public.okr_initiatives i
SET
  action_id = p.action_id,
  team_action_id = NULL
FROM pending p
WHERE i.id = p.initiative_id
  AND i.action_id IS NULL
  AND EXISTS (SELECT 1 FROM inserted ins WHERE ins.id = p.action_id);

UPDATE public.acciones_equipo
SET es_okr = false
WHERE COALESCE(es_okr, false);

CREATE OR REPLACE FUNCTION public.okr_validate_initiative() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_scope text;
BEGIN
  IF NEW.team_action_id IS NOT NULL THEN
    RAISE EXCEPTION 'Las iniciativas se alojan en el Kanban corporativo';
  END IF;
  IF NEW.action_id IS NULL THEN
    RAISE EXCEPTION 'La iniciativa debe vincular una acción del Kanban corporativo';
  END IF;
  SELECT o.scope INTO v_scope
  FROM okrs o JOIN okr_key_results k ON k.okr_id = o.id WHERE k.id = NEW.key_result_id;
  IF v_scope IS DISTINCT FROM 'team' THEN
    RAISE EXCEPTION 'Las iniciativas solo se vinculan a OKRs de equipo';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM acciones_diarias a WHERE a.id = NEW.action_id AND a.es_okr
  ) THEN
    RAISE EXCEPTION 'Solo se pueden vincular acciones marcadas como OKR';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_action_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.okr_active_user() THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(a ORDER BY a.title)
    FROM (
      SELECT d.id, d.titulo_accion AS title, 'company'::text AS kind, ar.id AS area_id,
        COALESCE((SELECT s.es_cierre FROM statuses s
          WHERE lower(trim(COALESCE(to_jsonb(s)->>'estado_key', s.nombre))) = lower(trim(d.estado::text))
             OR lower(trim(s.nombre)) = lower(trim(d.estado::text))
          ORDER BY (lower(trim(COALESCE(to_jsonb(s)->>'estado_key', s.nombre))) = lower(trim(d.estado::text))) DESC
          LIMIT 1), lower(trim(d.estado::text)) IN ('hecho','verificado','cerrado','realizado')) AS closed,
        true AS es_okr
      FROM acciones_diarias d
      LEFT JOIN areas ar ON lower(trim(ar.nombre)) = lower(trim(d.area))
      WHERE COALESCE(d.es_okr, false)
    ) a
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.okr_action_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_action_options() TO authenticated;

ALTER TABLE public.okr_initiatives ENABLE TRIGGER okr_initiative_validation;
ALTER TABLE public.acciones_diarias ENABLE TRIGGER acciones_diarias_okr_tag;

NOTIFY pgrst, 'reload schema';
