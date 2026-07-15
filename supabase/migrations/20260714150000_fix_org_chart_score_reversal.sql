-- El bono del organigrama es un saldo vigente, no una penalizacion acumulativa:
-- completo = +15; al retirar la jerarquia = 0 (delta -15 desde +15).

ALTER TABLE public.user_org_chart_scores
  DROP CONSTRAINT IF EXISTS user_org_chart_scores_profile_complete_points_check;

-- Reparar inmediatamente perfiles que quedaron en -15 con la logica anterior.
UPDATE public.user_org_chart_scores
SET profile_complete_points = 0,
    updated_at = now()
WHERE profile_complete_points < 0;

ALTER TABLE public.user_org_chart_scores
  ADD CONSTRAINT user_org_chart_scores_profile_complete_points_check
  CHECK (profile_complete_points IN (0, 15));

-- Corregir el historial generado con la semantica anterior: quitar el bono
-- representa -15 desde un saldo de 15, no un salto de 15 a -15 (-30).
UPDATE public.org_hierarchy_audit
SET new_points = 0,
    points_delta = 0 - COALESCE(previous_points, 0)
WHERE new_points < 0;

COMMENT ON COLUMN public.user_org_chart_scores.profile_complete_points IS
  '+15 mientras el perfil organizacional tiene jerarquia; 0 al retirarla o si nunca se completo.';

COMMENT ON COLUMN public.user_org_chart_scores.ever_completed IS
  'True cuando el perfil llego a completo al menos una vez; conserva trazabilidad sin generar puntos acumulativos.';

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
  v_points := CASE WHEN v_complete THEN 15 ELSE 0 END;

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

