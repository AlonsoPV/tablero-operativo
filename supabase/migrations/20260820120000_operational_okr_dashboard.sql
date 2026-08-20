-- OKR operativo global para seguimiento ejecutivo de acciones criticas.
-- V1: un OKR activo, datos calculados desde acciones reales y drill-down explicable por accion.

ALTER TABLE public.okrs
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.okrs
  DROP CONSTRAINT IF EXISTS chk_okrs_status;

ALTER TABLE public.okrs
  ADD CONSTRAINT chk_okrs_status
  CHECK (status IN ('in_progress', 'fulfilled', 'at_risk', 'paused', 'cancelled'));

UPDATE public.okrs
SET
  title = COALESCE(title, nombre_okr),
  owner_user_id = COALESCE(owner_user_id, owner_usuario)
WHERE title IS NULL
   OR owner_user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.okr_key_results (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  okr_id uuid NOT NULL REFERENCES public.okrs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  metric_type text NOT NULL,
  baseline_value numeric,
  target_value numeric NOT NULL,
  current_value numeric,
  unit text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'increase',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT okr_key_results_direction_chk CHECK (direction IN ('increase', 'decrease')),
  CONSTRAINT okr_key_results_metric_unique UNIQUE (okr_id, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_okr_key_results_okr_order
  ON public.okr_key_results(okr_id, display_order);

ALTER TABLE public.okr_key_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS okr_key_results_select_authenticated ON public.okr_key_results;
CREATE POLICY okr_key_results_select_authenticated
ON public.okr_key_results
FOR SELECT
TO authenticated
USING (
  public.can_manage_catalogs()
  OR public.has_business_role('Direccion')
  OR public.has_business_role('Lider')
  OR public.has_business_role('DG')
  OR public.has_business_role('Sistemas')
  OR public.has_business_role('super_admin')
);

CREATE OR REPLACE FUNCTION public.operational_okr_is_red_action(action_row public.acciones_diarias)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT p.color = 'rojo'
      FROM public.priorities p
      WHERE (action_row.prioridad_id IS NOT NULL AND p.id = action_row.prioridad_id)
         OR lower(trim(p.nombre)) = lower(trim(action_row.prioridad))
      ORDER BY CASE WHEN action_row.prioridad_id IS NOT NULL AND p.id = action_row.prioridad_id THEN 0 ELSE 1 END
      LIMIT 1
    ),
    lower(trim(action_row.prioridad)) LIKE '%p1%'
      OR lower(trim(action_row.prioridad)) LIKE '%crit%'
      OR lower(trim(action_row.prioridad)) LIKE '%alta%'
      OR lower(trim(action_row.prioridad)) LIKE '%urgent%'
  );
$$;

CREATE OR REPLACE FUNCTION public.operational_okr_is_closed_action(action_row public.acciones_diarias)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT s.es_cierre
      FROM public.statuses s
      WHERE lower(trim(COALESCE(s.estado_key, s.nombre))) = lower(trim(action_row.estado::text))
         OR lower(trim(s.nombre)) = lower(trim(action_row.estado::text))
      LIMIT 1
    ),
    lower(trim(action_row.estado::text)) IN ('hecho', 'verificado', 'cerrado', 'realizado')
  );
$$;

CREATE OR REPLACE FUNCTION public.operational_okr_closed_at(action_row public.acciones_diarias)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(action_row.completed_at, action_row.verified_at, action_row.updated_at);
$$;

WITH seed AS (
  INSERT INTO public.okrs (
    nombre_okr,
    title,
    descripcion,
    periodo,
    start_date,
    end_date,
    status,
    activo
  )
  SELECT
    'Mejorar resolucion de acciones criticas',
    'Mejorar resolucion de acciones criticas',
    'Aumentar la capacidad del equipo para resolver oportunamente las acciones criticas de la operacion.',
    '90 dias',
    CURRENT_DATE,
    CURRENT_DATE + 90,
    'in_progress',
    true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.okrs
    WHERE nombre_okr = 'Mejorar resolucion de acciones criticas'
  )
  RETURNING id, start_date
),
target_okr AS (
  SELECT id, start_date
  FROM seed
  UNION ALL
  SELECT id, COALESCE(start_date, CURRENT_DATE)
  FROM public.okrs
  WHERE nombre_okr = 'Mejorar resolucion de acciones criticas'
  LIMIT 1
),
baseline AS (
  SELECT
    o.id AS okr_id,
    COUNT(a.id)::numeric AS red_open_older_than_15
  FROM target_okr o
  LEFT JOIN public.acciones_diarias a
    ON public.operational_okr_is_red_action(a)
   AND NOT public.operational_okr_is_closed_action(a)
   AND a.created_at < (o.start_date + 1)::timestamptz
   AND GREATEST(0, (o.start_date - a.created_at::date)) > 15
  GROUP BY o.id
)
INSERT INTO public.okr_key_results (
  okr_id,
  title,
  description,
  metric_type,
  baseline_value,
  target_value,
  unit,
  direction,
  display_order
)
SELECT *
FROM (
  SELECT
    o.id,
    'Tiempo promedio de cierre',
    'Reducir el tiempo promedio de cierre de acciones rojas cerradas durante el periodo del OKR.',
    'red_close_avg_days',
    27::numeric,
    10::numeric,
    'dias',
    'decrease',
    1
  FROM target_okr o
  UNION ALL
  SELECT
    o.id,
    'Cierre en fecha compromiso',
    'Porcentaje de acciones rojas cerradas en o antes de su fecha compromiso.',
    'red_closed_on_time_pct',
    NULL::numeric,
    80::numeric,
    '%',
    'increase',
    2
  FROM target_okr o
  UNION ALL
  SELECT
    o.id,
    'Seguimiento activo',
    'Porcentaje de acciones rojas abiertas con actualizacion registrada en las ultimas 48 horas.',
    'red_open_recent_update_pct',
    NULL::numeric,
    90::numeric,
    '%',
    'increase',
    3
  FROM target_okr o
  UNION ALL
  SELECT
    b.okr_id,
    'Reduccion de rezago',
    'Reduccion de acciones rojas abiertas con mas de 15 dias contra el backlog existente al inicio del OKR.',
    'red_open_older_than_15_reduction_pct',
    b.red_open_older_than_15,
    70::numeric,
    '% reduccion',
    'increase',
    4
  FROM baseline b
) AS kr_seed(
  okr_id,
  title,
  description,
  metric_type,
  baseline_value,
  target_value,
  unit,
  direction,
  display_order
)
ON CONFLICT (okr_id, metric_type) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  target_value = EXCLUDED.target_value,
  unit = EXCLUDED.unit,
  direction = EXCLUDED.direction,
  display_order = EXCLUDED.display_order,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_operational_okr_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_okr public.okrs%ROWTYPE;
  v_today date := CURRENT_DATE;
  v_elapsed_days integer;
  v_duration_days integer;
  v_expected_progress numeric;
  v_kr1_current numeric := 0;
  v_kr1_previous numeric := 0;
  v_kr1_progress numeric := 0;
  v_kr2_current numeric := 0;
  v_kr2_progress numeric := 0;
  v_kr3_current numeric := 0;
  v_kr3_progress numeric := 0;
  v_kr4_current_count numeric := 0;
  v_kr4_baseline numeric := 0;
  v_kr4_current numeric := 0;
  v_kr4_progress numeric := 0;
  v_overall_progress numeric := 0;
  v_status text := 'in_progress';
  v_kr1_ids uuid[] := ARRAY[]::uuid[];
  v_kr2_ids uuid[] := ARRAY[]::uuid[];
  v_kr3_stale_ids uuid[] := ARRAY[]::uuid[];
  v_kr4_ids uuid[] := ARRAY[]::uuid[];
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_okr
  FROM public.okrs
  WHERE nombre_okr = 'Mejorar resolucion de acciones criticas'
    AND activo = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'OKR operativo no configurado');
  END IF;

  v_okr.start_date := COALESCE(v_okr.start_date, v_today);
  v_okr.end_date := COALESCE(v_okr.end_date, v_okr.start_date + 90);
  v_elapsed_days := GREATEST(0, LEAST(v_today, v_okr.end_date) - v_okr.start_date);
  v_duration_days := GREATEST(1, v_okr.end_date - v_okr.start_date);
  v_expected_progress := LEAST(100, GREATEST(0, (v_elapsed_days::numeric / v_duration_days::numeric) * 100));

  WITH red_closed AS (
    SELECT
      a.id,
      a.created_at,
      a.fecha,
      public.operational_okr_closed_at(a) AS closed_at
    FROM public.acciones_diarias a
    WHERE public.operational_okr_is_red_action(a)
      AND public.operational_okr_is_closed_action(a)
      AND public.operational_okr_closed_at(a)::date BETWEEN v_okr.start_date AND v_okr.end_date
  )
  SELECT
    COALESCE(ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400.0))::numeric, 1), 0),
    COALESCE(ROUND((COUNT(*) FILTER (WHERE closed_at::date <= fecha)::numeric / NULLIF(COUNT(*), 0)) * 100, 0), 0),
    COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_kr1_current, v_kr2_current, v_kr1_ids
  FROM red_closed;

  v_kr2_ids := v_kr1_ids;

  WITH previous_red_closed AS (
    SELECT
      a.created_at,
      public.operational_okr_closed_at(a) AS closed_at
    FROM public.acciones_diarias a
    WHERE public.operational_okr_is_red_action(a)
      AND public.operational_okr_is_closed_action(a)
      AND public.operational_okr_closed_at(a)::date >= v_okr.start_date - v_duration_days
      AND public.operational_okr_closed_at(a)::date < v_okr.start_date
  )
  SELECT COALESCE(ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400.0))::numeric, 1), 0)
  INTO v_kr1_previous
  FROM previous_red_closed;

  v_kr1_progress := CASE
    WHEN v_kr1_current <= 0 THEN 0
    ELSE LEAST(100, GREATEST(0, ((27 - v_kr1_current) / NULLIF(27 - 10, 0)) * 100))
  END;
  v_kr2_progress := LEAST(100, GREATEST(0, (v_kr2_current / 80) * 100));

  WITH red_open AS (
    SELECT
      a.id,
      a.created_at,
      GREATEST(
        a.updated_at,
        COALESCE((SELECT MAX(c.created_at) FROM public.accion_comentarios c WHERE c.accion_id = a.id), a.updated_at),
        COALESCE((SELECT MAX(cp.updated_at) FROM public.accion_checkpoints cp WHERE cp.accion_id = a.id AND cp.activo = true), a.updated_at),
        COALESCE((SELECT MAX(e.created_at) FROM public.accion_evidencias e WHERE e.accion_id = a.id), a.updated_at),
        COALESCE((SELECT MAX(fc.created_at) FROM public.accion_fecha_compromiso_cambios fc WHERE fc.accion_id = a.id), a.updated_at)
      ) AS last_update_at
    FROM public.acciones_diarias a
    WHERE public.operational_okr_is_red_action(a)
      AND NOT public.operational_okr_is_closed_action(a)
  )
  SELECT
    COALESCE(ROUND((COUNT(*) FILTER (WHERE last_update_at >= now() - interval '48 hours')::numeric / NULLIF(COUNT(*), 0)) * 100, 0), 100),
    COALESCE(array_agg(id) FILTER (WHERE last_update_at < now() - interval '48 hours'), ARRAY[]::uuid[])
  INTO v_kr3_current, v_kr3_stale_ids
  FROM red_open;

  v_kr3_progress := LEAST(100, GREATEST(0, (v_kr3_current / 90) * 100));

  SELECT COALESCE(kr.baseline_value, 0)
  INTO v_kr4_baseline
  FROM public.okr_key_results kr
  WHERE kr.okr_id = v_okr.id
    AND kr.metric_type = 'red_open_older_than_15_reduction_pct';

  WITH red_open_old AS (
    SELECT a.id
    FROM public.acciones_diarias a
    WHERE public.operational_okr_is_red_action(a)
      AND NOT public.operational_okr_is_closed_action(a)
      AND GREATEST(0, (v_today - a.created_at::date)) > 15
  )
  SELECT COUNT(*)::numeric, COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_kr4_current_count, v_kr4_ids
  FROM red_open_old;

  v_kr4_current := CASE
    WHEN v_kr4_baseline <= 0 THEN 100
    ELSE ROUND(((v_kr4_baseline - v_kr4_current_count) / v_kr4_baseline) * 100, 0)
  END;
  v_kr4_progress := CASE
    WHEN v_kr4_baseline <= 0 THEN 100
    ELSE LEAST(100, GREATEST(0, (v_kr4_current / 70) * 100))
  END;

  v_overall_progress := ROUND((v_kr1_progress + v_kr2_progress + v_kr3_progress + v_kr4_progress) / 4, 0);
  v_status := CASE
    WHEN v_overall_progress >= 100 THEN 'fulfilled'
    WHEN v_overall_progress + 5 >= v_expected_progress THEN 'in_progress'
    WHEN v_overall_progress + 20 >= v_expected_progress THEN 'in_progress_warning'
    ELSE 'at_risk'
  END;

  v_result := jsonb_build_object(
    'ok', true,
    'okr', jsonb_build_object(
      'id', v_okr.id,
      'title', COALESCE(v_okr.title, v_okr.nombre_okr),
      'description', v_okr.descripcion,
      'start_date', v_okr.start_date,
      'end_date', v_okr.end_date,
      'period_days', v_duration_days,
      'elapsed_days', v_elapsed_days,
      'status', v_status,
      'expected_progress', ROUND(v_expected_progress, 0),
      'overall_progress', v_overall_progress
    ),
    'milestones', jsonb_build_array(
      jsonb_build_object('day', 0, 'target_value', 27),
      jsonb_build_object('day', 30, 'target_value', 20),
      jsonb_build_object('day', 60, 'target_value', 15),
      jsonb_build_object('day', 90, 'target_value', 10)
    ),
    'key_results', jsonb_build_array(
      jsonb_build_object(
        'id', 'kr1',
        'metric_type', 'red_close_avg_days',
        'title', 'Tiempo promedio de cierre',
        'description', 'Rojas cerradas durante el periodo del OKR.',
        'baseline_value', 27,
        'current_value', v_kr1_current,
        'target_value', 10,
        'unit', 'dias',
        'direction', 'decrease',
        'progress', ROUND(v_kr1_progress, 0),
        'trend_delta', ROUND(v_kr1_current - v_kr1_previous, 1),
        'trend_previous', v_kr1_previous,
        'action_ids', to_jsonb(v_kr1_ids),
        'drilldown_title', 'Rojas cerradas usadas para KR1'
      ),
      jsonb_build_object(
        'id', 'kr2',
        'metric_type', 'red_closed_on_time_pct',
        'title', 'Cierre en fecha compromiso',
        'description', 'Rojas cerradas en o antes de su fecha compromiso.',
        'baseline_value', NULL,
        'current_value', v_kr2_current,
        'target_value', 80,
        'unit', '%',
        'direction', 'increase',
        'progress', ROUND(v_kr2_progress, 0),
        'trend_delta', NULL,
        'trend_previous', NULL,
        'action_ids', to_jsonb(v_kr2_ids),
        'drilldown_title', 'Rojas cerradas para cumplimiento de fecha'
      ),
      jsonb_build_object(
        'id', 'kr3',
        'metric_type', 'red_open_recent_update_pct',
        'title', 'Seguimiento activo',
        'description', 'Rojas abiertas con actualizacion en las ultimas 48 horas.',
        'baseline_value', NULL,
        'current_value', v_kr3_current,
        'target_value', 90,
        'unit', '%',
        'direction', 'increase',
        'progress', ROUND(v_kr3_progress, 0),
        'trend_delta', NULL,
        'trend_previous', NULL,
        'action_ids', to_jsonb(v_kr3_stale_ids),
        'drilldown_title', 'Rojas sin actualizacion en 48 horas'
      ),
      jsonb_build_object(
        'id', 'kr4',
        'metric_type', 'red_open_older_than_15_reduction_pct',
        'title', 'Reduccion de rezago',
        'description', 'Reduccion contra backlog rojo historico abierto al inicio del OKR.',
        'baseline_value', v_kr4_baseline,
        'current_value', v_kr4_current,
        'current_count', v_kr4_current_count,
        'target_value', 70,
        'unit', '% reduccion',
        'direction', 'increase',
        'progress', ROUND(v_kr4_progress, 0),
        'trend_delta', NULL,
        'trend_previous', NULL,
        'action_ids', to_jsonb(v_kr4_ids),
        'drilldown_title', 'Rojas abiertas con mas de 15 dias'
      )
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_operational_okr_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operational_okr_dashboard() TO authenticated;

COMMENT ON FUNCTION public.get_operational_okr_dashboard() IS
  'OKR operativo global: KR1/KR2 usan rojas cerradas durante el periodo; KR3/KR4 usan rojas abiertas actuales. Devuelve KRs normalizados 0-100 y action_ids para drill-down.';
