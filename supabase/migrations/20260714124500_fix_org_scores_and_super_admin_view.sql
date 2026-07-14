-- =============================================================================
-- Fix: checks legacy 0/4 chocan con modelo +15; Super Admin puede ver organigrama
-- =============================================================================

-- Quitar CHECKs antiguos (+4) que bloquean el UPSERT del nuevo modelo.
ALTER TABLE public.user_org_chart_scores
  DROP CONSTRAINT IF EXISTS user_org_chart_scores_reports_to_points_check;

ALTER TABLE public.user_org_chart_scores
  DROP CONSTRAINT IF EXISTS user_org_chart_scores_supervises_points_check;

-- Las columnas legacy quedan en 0; la puntuacion vigente es profile_complete_points.
UPDATE public.user_org_chart_scores
SET
  reports_to_points = 0,
  supervises_points = 0
WHERE reports_to_points IS DISTINCT FROM 0
   OR supervises_points IS DISTINCT FROM 0;

ALTER TABLE public.user_org_chart_scores
  ADD CONSTRAINT user_org_chart_scores_reports_to_points_check
  CHECK (reports_to_points = 0);

ALTER TABLE public.user_org_chart_scores
  ADD CONSTRAINT user_org_chart_scores_supervises_points_check
  CHECK (supervises_points = 0);

CREATE OR REPLACE FUNCTION private.refresh_org_chart_score(
  p_user_id uuid,
  p_editor_id uuid
)
RETURNS public.user_org_chart_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_prev public.user_org_chart_scores;
  v_score public.user_org_chart_scores;
  v_complete boolean;
  v_ever boolean;
  v_points smallint;
  v_rol text;
  v_had_prev boolean := false;
BEGIN
  SELECT u.rol::text INTO v_rol
  FROM public.usuarios u
  WHERE u.id = p_user_id;

  IF v_rol IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_prev
  FROM public.user_org_chart_scores
  WHERE user_id = p_user_id;
  v_had_prev := FOUND;

  IF public.is_super_admin_role(v_rol) THEN
    INSERT INTO public.user_org_chart_scores (
      user_id,
      reports_to_points,
      supervises_points,
      profile_complete_points,
      ever_completed,
      last_edited_by,
      updated_at
    )
    VALUES (p_user_id, 0, 0, 0, false, p_editor_id, now())
    ON CONFLICT (user_id) DO UPDATE
    SET
      reports_to_points = 0,
      supervises_points = 0,
      profile_complete_points = 0,
      ever_completed = false,
      last_edited_by = EXCLUDED.last_edited_by,
      updated_at = EXCLUDED.updated_at
    RETURNING * INTO v_score;
    RETURN v_score;
  END IF;

  v_complete := private.is_org_profile_complete(p_user_id);
  v_ever := COALESCE(v_prev.ever_completed, false) OR v_complete;

  IF v_complete THEN
    v_points := 15;
  ELSIF v_ever THEN
    v_points := -15;
  ELSE
    v_points := 0;
  END IF;

  INSERT INTO public.user_org_chart_scores (
    user_id,
    reports_to_points,
    supervises_points,
    profile_complete_points,
    ever_completed,
    last_edited_by,
    updated_at
  )
  VALUES (
    p_user_id,
    0,
    0,
    v_points,
    v_ever,
    p_editor_id,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    reports_to_points = 0,
    supervises_points = 0,
    profile_complete_points = EXCLUDED.profile_complete_points,
    ever_completed = EXCLUDED.ever_completed OR public.user_org_chart_scores.ever_completed,
    last_edited_by = EXCLUDED.last_edited_by,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_score;

  IF (NOT v_had_prev)
    OR COALESCE(v_prev.profile_complete_points, 0) IS DISTINCT FROM v_score.profile_complete_points
  THEN
    INSERT INTO public.org_hierarchy_audit (
      subject_user_id,
      editor_user_id,
      action,
      previous_points,
      new_points,
      points_delta
    )
    VALUES (
      p_user_id,
      p_editor_id,
      'score_change',
      COALESCE(v_prev.profile_complete_points, 0),
      v_score.profile_complete_points,
      v_score.profile_complete_points - COALESCE(v_prev.profile_complete_points, 0)
    );
  END IF;

  RETURN v_score;
END;
$$;

-- Super Admin puede consultar el organigrama (sin aparecer como nodo).
DROP FUNCTION IF EXISTS public.org_chart_list();

CREATE OR REPLACE FUNCTION public.org_chart_list()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  rol text,
  area text,
  areas text[],
  activo boolean,
  manager_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    u.nombre,
    u.rol::text,
    u.area,
    public.usuario_area_names(u.id),
    u.activo,
    u.manager_user_id,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  WHERE public.is_org_chart_participant_role(u.rol::text)
  ORDER BY u.nombre ASC;
END;
$$;

COMMENT ON FUNCTION public.org_chart_list() IS
  'Organigrama visible para autenticados (incl. Super Admin). Los nodos Super Admin se excluyen.';

GRANT EXECUTE ON FUNCTION public.org_chart_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.org_chart_governance_stats()
RETURNS TABLE (
  eligible_users integer,
  complete_profiles integer,
  complete_pct numeric,
  users_without_manager integer,
  leaders_without_team integer,
  hierarchy_changes_30d integer,
  points_from_complete_profiles integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, private
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT u.*
    FROM public.usuarios u
    WHERE u.activo
      AND public.is_org_chart_participant_role(u.rol::text)
  ),
  scored AS (
    SELECT e.id,
      private.is_org_profile_complete(e.id) AS is_complete,
      EXISTS (
        SELECT 1 FROM public.usuarios r
        WHERE r.manager_user_id = e.id
          AND r.activo
          AND public.is_org_chart_participant_role(r.rol::text)
      ) AS has_team
    FROM eligible e
  )
  SELECT
    (SELECT count(*)::integer FROM eligible),
    (SELECT count(*)::integer FROM scored WHERE is_complete),
    ROUND(
      100.0 * (SELECT count(*) FROM scored WHERE is_complete)
        / NULLIF((SELECT count(*) FROM eligible), 0),
      1
    ),
    (SELECT count(*)::integer FROM eligible e WHERE e.manager_user_id IS NULL),
    (
      SELECT count(*)::integer
      FROM eligible e
      JOIN scored s ON s.id = e.id
      WHERE public.normalize_business_role(e.rol::text) = 'direccion'
        AND NOT s.has_team
    ),
    (
      SELECT count(*)::integer
      FROM public.org_hierarchy_audit a
      WHERE a.action = 'update_hierarchy'
        AND a.created_at >= now() - interval '30 days'
    ),
    (
      SELECT COALESCE(sum(s.profile_complete_points), 0)::integer
      FROM public.user_org_chart_scores s
      WHERE s.profile_complete_points = 15
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_chart_governance_stats() TO authenticated;
