-- Adopción: detalle de quién inició sesión por periodo + dedupe diario del registro.

CREATE OR REPLACE FUNCTION public.record_user_login_event()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  -- Un evento por usuario y día (CDMX): basta para adopción y evita ruido por refresh.
  IF EXISTS (
    SELECT 1
    FROM public.user_login_events e
    WHERE e.user_id = v_uid
      AND (e.logged_in_at AT TIME ZONE 'America/Mexico_City')::date = v_today
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_login_events (user_id)
  VALUES (v_uid);
END;
$$;

COMMENT ON FUNCTION public.record_user_login_event() IS
  'Registra un inicio de sesion del usuario autenticado (maximo uno por dia CDMX).';

DROP FUNCTION IF EXISTS public.dashboard_user_login_buckets(text);

CREATE OR REPLACE FUNCTION public.dashboard_user_login_buckets(
  p_granularity text DEFAULT 'weekly'
)
RETURNS TABLE (
  bucket_start date,
  bucket_end date,
  users_logged_in integer,
  users_total integer,
  logged_in_users jsonb,
  absent_users jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_granularity text := lower(trim(coalesce(p_granularity, 'weekly')));
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  IF v_granularity NOT IN ('weekly', 'biweekly', 'monthly') THEN
    RAISE EXCEPTION 'Granularidad invalida'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate_periods AS (
    SELECT
      gs::date AS period_start,
      (gs + interval '6 days')::date AS period_end
    FROM generate_series(
      date_trunc('week', v_today::timestamp) - interval '7 weeks',
      date_trunc('week', v_today::timestamp),
      interval '1 week'
    ) gs
    WHERE v_granularity = 'weekly'

    UNION ALL

    SELECT
      month_start::date AS period_start,
      (month_start + interval '14 days')::date AS period_end
    FROM generate_series(
      date_trunc('month', v_today::timestamp) - interval '4 months',
      date_trunc('month', v_today::timestamp),
      interval '1 month'
    ) month_start
    WHERE v_granularity = 'biweekly'

    UNION ALL

    SELECT
      (month_start + interval '15 days')::date AS period_start,
      (month_start + interval '1 month - 1 day')::date AS period_end
    FROM generate_series(
      date_trunc('month', v_today::timestamp) - interval '4 months',
      date_trunc('month', v_today::timestamp),
      interval '1 month'
    ) month_start
    WHERE v_granularity = 'biweekly'

    UNION ALL

    SELECT
      month_start::date AS period_start,
      (month_start + interval '1 month - 1 day')::date AS period_end
    FROM generate_series(
      date_trunc('month', v_today::timestamp) - interval '7 months',
      date_trunc('month', v_today::timestamp),
      interval '1 month'
    ) month_start
    WHERE v_granularity = 'monthly'
  ),
  periods AS (
    SELECT cp.period_start, cp.period_end
    FROM candidate_periods cp
    WHERE cp.period_start <= v_today
    ORDER BY cp.period_start DESC
    LIMIT 8
  ),
  active_users AS (
    SELECT DISTINCT ON (u.user_id)
      u.user_id,
      coalesce(nullif(trim(u.nombre), ''), 'Sin nombre') AS nombre,
      nullif(trim(u.area), '') AS area,
      nullif(trim(u.rol), '') AS rol
    FROM public.usuarios u
    WHERE u.activo = true
      AND u.user_id IS NOT NULL
    ORDER BY u.user_id, u.updated_at DESC NULLS LAST
  ),
  active_total AS (
    SELECT count(*)::integer AS total
    FROM active_users
  ),
  period_logins AS (
    SELECT
      p.period_start,
      p.period_end,
      au.user_id,
      au.nombre,
      au.area,
      au.rol,
      max(e.logged_in_at) AS last_login_at
    FROM periods p
    INNER JOIN public.user_login_events e
      ON (e.logged_in_at AT TIME ZONE 'America/Mexico_City')::date
        BETWEEN p.period_start AND LEAST(p.period_end, v_today)
    INNER JOIN active_users au
      ON au.user_id = e.user_id
    GROUP BY p.period_start, p.period_end, au.user_id, au.nombre, au.area, au.rol
  )
  SELECT
    p.period_start,
    p.period_end,
    coalesce((
      SELECT count(*)::integer
      FROM period_logins pl
      WHERE pl.period_start = p.period_start
        AND pl.period_end = p.period_end
    ), 0) AS users_logged_in,
    t.total AS users_total,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', pl.user_id,
          'nombre', pl.nombre,
          'area', pl.area,
          'rol', pl.rol,
          'last_login_at', pl.last_login_at
        )
        ORDER BY pl.last_login_at DESC, pl.nombre ASC
      )
      FROM period_logins pl
      WHERE pl.period_start = p.period_start
        AND pl.period_end = p.period_end
    ), '[]'::jsonb) AS logged_in_users,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', au.user_id,
          'nombre', au.nombre,
          'area', au.area,
          'rol', au.rol
        )
        ORDER BY au.nombre ASC
      )
      FROM active_users au
      WHERE NOT EXISTS (
        SELECT 1
        FROM period_logins pl
        WHERE pl.period_start = p.period_start
          AND pl.period_end = p.period_end
          AND pl.user_id = au.user_id
      )
    ), '[]'::jsonb) AS absent_users
  FROM periods p
  CROSS JOIN active_total t
  ORDER BY p.period_start;
END;
$$;

COMMENT ON FUNCTION public.dashboard_user_login_buckets(text) IS
  'Adopcion: inicios de sesion unicos por periodo, con listas de presentes y ausentes.';

REVOKE ALL ON FUNCTION public.dashboard_user_login_buckets(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_user_login_buckets(text) TO authenticated;
