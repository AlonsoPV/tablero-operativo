-- =============================================================================
-- Gamificacion del organigrama por perfil
--
-- Cada bloque se evalua por su estado actual despues de guardar:
--   Reporta a   con contenido: +4 | vacio: 0
--   Supervisa a con contenido: +4 | vacio: 0
--
-- La fila es unica por usuario y se actualiza con UPSERT. Por lo tanto, guardar
-- varias veces nunca acumula puntos. La puntuacion pertenece al perfil editado,
-- independientemente de si lo edita la propia persona o RH.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_org_chart_scores (
  user_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  reports_to_points smallint NOT NULL,
  supervises_points smallint NOT NULL,
  total_points smallint GENERATED ALWAYS AS (reports_to_points + supervises_points) STORED,
  last_edited_by uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_org_chart_scores_reports_to_points_check
    CHECK (reports_to_points IN (0, 4)),
  CONSTRAINT user_org_chart_scores_supervises_points_check
    CHECK (supervises_points IN (0, 4))
);

COMMENT ON TABLE public.user_org_chart_scores IS
  'Puntaje vigente del organigrama. Una fila por perfil; no acumula por ediciones repetidas.';
COMMENT ON COLUMN public.user_org_chart_scores.reports_to_points IS
  '+4 si Reporta a tiene contenido; 0 si queda vacio despues de guardar.';
COMMENT ON COLUMN public.user_org_chart_scores.supervises_points IS
  '+4 si Supervisa a tiene al menos una persona; 0 si queda vacio despues de guardar.';

ALTER TABLE public.user_org_chart_scores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_org_chart_scores FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_org_chart_scores TO authenticated;

DROP POLICY IF EXISTS user_org_chart_scores_select_visible ON public.user_org_chart_scores;
CREATE POLICY user_org_chart_scores_select_visible
  ON public.user_org_chart_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios me
      WHERE me.user_id = auth.uid()
        AND (
          me.id = user_org_chart_scores.user_id
          OR public.can_manage_catalogs()
          OR public.can_edit_any_org_hierarchy()
          OR EXISTS (
            SELECT 1
            FROM public.usuarios target
            WHERE target.id = user_org_chart_scores.user_id
              AND target.manager_user_id = me.id
          )
        )
    )
  );

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

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
  v_score public.user_org_chart_scores;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_org_chart_scores (
    user_id,
    reports_to_points,
    supervises_points,
    last_edited_by,
    updated_at
  )
  SELECT
    u.id,
    CASE WHEN u.manager_user_id IS NULL THEN 0 ELSE 4 END,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.usuarios report
        WHERE report.manager_user_id = u.id
      ) THEN 4
      ELSE 0
    END,
    p_editor_id,
    now()
  FROM public.usuarios u
  WHERE u.id = p_user_id
  ON CONFLICT (user_id) DO UPDATE
  SET
    reports_to_points = EXCLUDED.reports_to_points,
    supervises_points = EXCLUDED.supervises_points,
    last_edited_by = EXCLUDED.last_edited_by,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_score;

  RETURN v_score;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_org_chart_score(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Punto de entrada seguro para recalcular sin aceptar puntos desde el cliente.
CREATE OR REPLACE FUNCTION public.org_chart_score_refresh(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  reports_to_points smallint,
  supervises_points smallint,
  total_points smallint,
  last_edited_by uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_editor_id uuid;
  v_score public.user_org_chart_scores;
BEGIN
  SELECT u.id INTO v_editor_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF v_editor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  IF v_editor_id <> p_user_id
    AND NOT public.can_edit_any_org_hierarchy()
  THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_score := private.refresh_org_chart_score(p_user_id, v_editor_id);

  RETURN QUERY SELECT
    v_score.user_id,
    v_score.reports_to_points,
    v_score.supervises_points,
    v_score.total_points,
    v_score.last_edited_by,
    v_score.updated_at;
END;
$$;

COMMENT ON FUNCTION public.org_chart_score_refresh(uuid) IS
  'Recalcula el puntaje vigente del perfil editado. Self o RH; nunca recibe puntos del cliente.';

REVOKE ALL ON FUNCTION public.org_chart_score_refresh(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_chart_score_refresh(uuid) TO authenticated;

-- Guardado atomico usado por Perfil y Organigrama: ambos bloques y un solo score.
CREATE OR REPLACE FUNCTION public.settings_users_update_org_hierarchy(
  p_user_id uuid,
  p_manager_user_id uuid,
  p_report_ids uuid[]
)
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
SET search_path = public, private
AS $$
DECLARE
  v_editor_id uuid;
BEGIN
  SELECT u.id INTO v_editor_id
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF v_editor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  IF v_editor_id <> p_user_id
    AND NOT public.can_edit_any_org_hierarchy()
  THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  PERFORM *
  FROM public.settings_users_update_manager(p_user_id, p_manager_user_id);

  PERFORM *
  FROM public.settings_users_set_direct_reports(
    p_user_id,
    COALESCE(p_report_ids, ARRAY[]::uuid[])
  );

  PERFORM private.refresh_org_chart_score(p_user_id, v_editor_id);

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
  WHERE u.id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.settings_users_update_org_hierarchy(uuid, uuid, uuid[]) IS
  'Guarda Reporta a y Supervisa a en una transaccion y reemplaza el puntaje del perfil (max +8, min 0).';

REVOKE ALL ON FUNCTION public.settings_users_update_org_hierarchy(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settings_users_update_org_hierarchy(uuid, uuid, uuid[]) TO authenticated;
