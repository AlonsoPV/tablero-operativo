-- =============================================================================
-- Gobernanza del organigrama + gamificacion +15/-15 + auditoria
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de rol / participacion
-- (reutiliza public.normalize_business_role(p_role text) ya existente)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin_role(p_rol text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_business_role(p_rol) = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION public.can_edit_own_org_profile(p_rol text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    NOT public.is_super_admin_role(p_rol)
    AND public.normalize_business_role(p_rol) <> 'analista'
    AND (
      public.normalize_business_role(p_rol) = 'direccion'
      OR public.normalize_business_role(p_rol) = 'operativo'
      OR public.normalize_business_role(p_rol) LIKE '%operativo%'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_chart_participant_role(p_rol text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NOT public.is_super_admin_role(p_rol);
$$;

CREATE OR REPLACE FUNCTION public.can_edit_any_org_hierarchy()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_belongs_to_area_name('RH')
    OR EXISTS (
      SELECT 1
      FROM public.usuarios me
      WHERE me.user_id = auth.uid()
        AND public.is_super_admin_role(me.rol::text)
    );
$$;

COMMENT ON FUNCTION public.can_edit_any_org_hierarchy() IS
  'RH o Super Admin pueden editar la jerarquia de otras personas. Super Admin no participa en el organigrama.';

CREATE OR REPLACE FUNCTION private.is_org_profile_complete(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_user_id
      AND public.is_org_chart_participant_role(u.rol::text)
      AND (
        u.manager_user_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.usuarios report
          WHERE report.manager_user_id = u.id
            AND report.activo
            AND public.is_org_chart_participant_role(report.rol::text)
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Organigrama: excluir Super Admin
-- -----------------------------------------------------------------------------

-- Super Admin puede ver el modulo; no aparece como nodo del arbol.
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

CREATE OR REPLACE FUNCTION public.settings_users_hierarchy_peers()
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
  WHERE u.activo
    AND public.is_org_chart_participant_role(u.rol::text)
  ORDER BY u.nombre ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settings_users_hierarchy_peers() TO authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria de cambios jerarquicos y de puntos
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_hierarchy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  editor_user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_manager_user_id uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  new_manager_user_id uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  previous_report_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  new_report_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  previous_points smallint NULL,
  new_points smallint NULL,
  points_delta smallint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_hierarchy_audit_action_check
    CHECK (action IN ('update_hierarchy', 'score_change'))
);

COMMENT ON TABLE public.org_hierarchy_audit IS
  'Historial de cambios de Reporta a / Supervisa a y movimiento de puntos asociados.';

CREATE INDEX IF NOT EXISTS idx_org_hierarchy_audit_subject_created
  ON public.org_hierarchy_audit (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_audit_editor_created
  ON public.org_hierarchy_audit (editor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_audit_created
  ON public.org_hierarchy_audit (created_at DESC);

ALTER TABLE public.org_hierarchy_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.org_hierarchy_audit FROM anon, authenticated;
GRANT SELECT ON TABLE public.org_hierarchy_audit TO authenticated;

DROP POLICY IF EXISTS org_hierarchy_audit_select_visible ON public.org_hierarchy_audit;
CREATE POLICY org_hierarchy_audit_select_visible
  ON public.org_hierarchy_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios me
      WHERE me.user_id = auth.uid()
        AND (
          me.id = org_hierarchy_audit.subject_user_id
          OR me.id = org_hierarchy_audit.editor_user_id
          OR public.can_manage_catalogs()
          OR public.can_edit_any_org_hierarchy()
        )
    )
  );

-- -----------------------------------------------------------------------------
-- Scores: modelo unico +15 / -15 / 0
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_org_chart_scores
  ADD COLUMN IF NOT EXISTS profile_complete_points smallint,
  ADD COLUMN IF NOT EXISTS ever_completed boolean NOT NULL DEFAULT false;

UPDATE public.user_org_chart_scores s
SET
  ever_completed = COALESCE(s.ever_completed, false)
    OR COALESCE(s.reports_to_points, 0) > 0
    OR COALESCE(s.supervises_points, 0) > 0
    OR COALESCE(s.profile_complete_points, 0) <> 0,
  profile_complete_points = CASE
    WHEN private.is_org_profile_complete(s.user_id) THEN 15
    WHEN COALESCE(s.ever_completed, false)
      OR COALESCE(s.reports_to_points, 0) > 0
      OR COALESCE(s.supervises_points, 0) > 0
      OR COALESCE(s.profile_complete_points, 0) <> 0
    THEN -15
    ELSE 0
  END
WHERE s.profile_complete_points IS NULL;

UPDATE public.user_org_chart_scores
SET profile_complete_points = COALESCE(profile_complete_points, 0);

ALTER TABLE public.user_org_chart_scores
  ALTER COLUMN profile_complete_points SET DEFAULT 0,
  ALTER COLUMN profile_complete_points SET NOT NULL;

ALTER TABLE public.user_org_chart_scores
  DROP CONSTRAINT IF EXISTS user_org_chart_scores_reports_to_points_check;

ALTER TABLE public.user_org_chart_scores
  DROP CONSTRAINT IF EXISTS user_org_chart_scores_supervises_points_check;

UPDATE public.user_org_chart_scores
SET
  reports_to_points = 0,
  supervises_points = 0;

ALTER TABLE public.user_org_chart_scores
  ADD CONSTRAINT user_org_chart_scores_reports_to_points_check
  CHECK (reports_to_points = 0);

ALTER TABLE public.user_org_chart_scores
  ADD CONSTRAINT user_org_chart_scores_supervises_points_check
  CHECK (supervises_points = 0);

ALTER TABLE public.user_org_chart_scores
  DROP CONSTRAINT IF EXISTS user_org_chart_scores_profile_complete_points_check;

ALTER TABLE public.user_org_chart_scores
  ADD CONSTRAINT user_org_chart_scores_profile_complete_points_check
  CHECK (profile_complete_points IN (-15, 0, 15));

-- Compat: mantener columnas legacy sincronizadas para lecturas antiguas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_org_chart_scores'
      AND column_name = 'total_points'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.user_org_chart_scores DROP COLUMN total_points;
  END IF;
EXCEPTION WHEN others THEN
  BEGIN
    ALTER TABLE public.user_org_chart_scores DROP COLUMN IF EXISTS total_points;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

ALTER TABLE public.user_org_chart_scores
  ADD COLUMN IF NOT EXISTS total_points smallint
    GENERATED ALWAYS AS (profile_complete_points) STORED;

COMMENT ON COLUMN public.user_org_chart_scores.profile_complete_points IS
  '+15 perfil organizacional completo; -15 incompleto tras haber estado completo; 0 nunca completado.';
COMMENT ON COLUMN public.user_org_chart_scores.ever_completed IS
  'True cuando el perfil llego a completo al menos una vez (evita multi-premios).';

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

DROP FUNCTION IF EXISTS public.org_chart_score_refresh(uuid);

CREATE OR REPLACE FUNCTION public.org_chart_score_refresh(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  reports_to_points smallint,
  supervises_points smallint,
  profile_complete_points smallint,
  ever_completed boolean,
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
    v_score.profile_complete_points,
    v_score.ever_completed,
    v_score.total_points,
    v_score.last_edited_by,
    v_score.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_chart_score_refresh(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Guardado atomico con gate de roles + auditoria
-- -----------------------------------------------------------------------------

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
  v_editor_rol text;
  v_subject_rol text;
  v_prev_manager uuid;
  v_prev_reports uuid[];
  v_new_reports uuid[] := COALESCE(p_report_ids, ARRAY[]::uuid[]);
  v_score public.user_org_chart_scores;
  v_prev_points smallint := 0;
  v_affected uuid;
BEGIN
  SELECT u.id, u.rol::text INTO v_editor_id, v_editor_rol
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF v_editor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT u.rol::text, u.manager_user_id
  INTO v_subject_rol, v_prev_manager
  FROM public.usuarios u
  WHERE u.id = p_user_id;

  IF v_subject_rol IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF public.is_super_admin_role(v_subject_rol) THEN
    RAISE EXCEPTION 'Super Admin no forma parte del organigrama' USING ERRCODE = '42501';
  END IF;

  IF v_editor_id = p_user_id THEN
    IF NOT public.can_edit_own_org_profile(v_editor_rol) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.can_edit_any_org_hierarchy() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_manager_user_id IS NOT NULL THEN
    IF p_manager_user_id = p_user_id THEN
      RAISE EXCEPTION 'Un usuario no puede reportarse a sí mismo' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.usuarios m
      WHERE m.id = p_manager_user_id
        AND (
          NOT m.activo
          OR public.is_super_admin_role(m.rol::text)
        )
    ) THEN
      RAISE EXCEPTION 'El jefe directo debe estar activo y participar en el organigrama' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(r.id ORDER BY r.id), ARRAY[]::uuid[])
  INTO v_prev_reports
  FROM public.usuarios r
  WHERE r.manager_user_id = p_user_id;

  SELECT COALESCE(s.profile_complete_points, 0)
  INTO v_prev_points
  FROM public.user_org_chart_scores s
  WHERE s.user_id = p_user_id;

  PERFORM *
  FROM public.settings_users_update_manager(p_user_id, p_manager_user_id);

  PERFORM *
  FROM public.settings_users_set_direct_reports(
    p_user_id,
    v_new_reports
  );

  INSERT INTO public.org_hierarchy_audit (
    subject_user_id,
    editor_user_id,
    action,
    previous_manager_user_id,
    new_manager_user_id,
    previous_report_ids,
    new_report_ids,
    previous_points,
    new_points,
    points_delta
  )
  VALUES (
    p_user_id,
    v_editor_id,
    'update_hierarchy',
    v_prev_manager,
    p_manager_user_id,
    COALESCE(v_prev_reports, ARRAY[]::uuid[]),
    v_new_reports,
    v_prev_points,
    NULL,
    NULL
  );

  v_score := private.refresh_org_chart_score(p_user_id, v_editor_id);

  -- Recalcular puntaje de reportes afectados (quien gano/perdio jefe).
  FOR v_affected IN
    SELECT DISTINCT x.id
    FROM (
      SELECT unnest(COALESCE(v_prev_reports, ARRAY[]::uuid[])) AS id
      UNION
      SELECT unnest(v_new_reports)
    ) x
    WHERE x.id IS DISTINCT FROM p_user_id
  LOOP
    PERFORM private.refresh_org_chart_score(v_affected, v_editor_id);
  END LOOP;

  IF p_manager_user_id IS NOT NULL AND p_manager_user_id IS DISTINCT FROM v_prev_manager THEN
    PERFORM private.refresh_org_chart_score(p_manager_user_id, v_editor_id);
  END IF;
  IF v_prev_manager IS NOT NULL AND v_prev_manager IS DISTINCT FROM p_manager_user_id THEN
    PERFORM private.refresh_org_chart_score(v_prev_manager, v_editor_id);
  END IF;

  UPDATE public.org_hierarchy_audit a
  SET
    new_points = v_score.profile_complete_points,
    points_delta = v_score.profile_complete_points - COALESCE(v_prev_points, 0)
  WHERE a.id = (
    SELECT a2.id
    FROM public.org_hierarchy_audit a2
    WHERE a2.subject_user_id = p_user_id
      AND a2.editor_user_id = v_editor_id
      AND a2.action = 'update_hierarchy'
    ORDER BY a2.created_at DESC
    LIMIT 1
  );

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
  'Guarda Reporta a y Supervisa a, recalcula +15/-15 sin multi-premio y registra auditoria.';

GRANT EXECUTE ON FUNCTION public.settings_users_update_org_hierarchy(uuid, uuid, uuid[]) TO authenticated;

-- Gate self en update_manager / set_direct_reports
CREATE OR REPLACE FUNCTION public.settings_users_update_manager(
  p_user_id uuid,
  p_manager_user_id uuid
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
SET search_path = public
AS $$
DECLARE
  v_my_usuarios_id uuid;
  v_my_rol text;
  v_subject_rol text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.id, u.rol::text INTO v_my_usuarios_id, v_my_rol
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  SELECT u.rol::text INTO v_subject_rol
  FROM public.usuarios u
  WHERE u.id = p_user_id;

  IF public.is_super_admin_role(COALESCE(v_subject_rol, '')) THEN
    RAISE EXCEPTION 'Super Admin no forma parte del organigrama' USING ERRCODE = '42501';
  END IF;

  IF public.can_edit_any_org_hierarchy() THEN
    NULL;
  ELSIF v_my_usuarios_id IS NOT NULL
    AND v_my_usuarios_id = p_user_id
    AND public.can_edit_own_org_profile(v_my_rol)
  THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.usuarios u
  SET
    manager_user_id = p_manager_user_id,
    updated_at = now()
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
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
  WHERE u.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settings_users_update_manager(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.settings_users_set_direct_reports(
  p_manager_id uuid,
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
SET search_path = public
AS $$
DECLARE
  v_my_usuarios_id uuid;
  v_my_rol text;
  v_is_privileged boolean;
  v_report_ids uuid[] := COALESCE(p_report_ids, ARRAY[]::uuid[]);
  v_rid uuid;
BEGIN
  IF p_manager_id IS NULL THEN
    RAISE EXCEPTION 'Usuario invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.id, u.rol::text INTO v_my_usuarios_id, v_my_rol
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()
  LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_manager_id AND public.is_super_admin_role(u.rol::text)
  ) THEN
    RAISE EXCEPTION 'Super Admin no forma parte del organigrama' USING ERRCODE = '42501';
  END IF;

  v_is_privileged := public.can_edit_any_org_hierarchy();

  IF v_is_privileged THEN
    NULL;
  ELSIF v_my_usuarios_id IS NOT NULL
    AND v_my_usuarios_id = p_manager_id
    AND public.can_edit_own_org_profile(v_my_rol)
  THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_manager_id = ANY (v_report_ids) THEN
    RAISE EXCEPTION 'Un usuario no puede reportarse a sí mismo' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_report_ids) AS rid(id)
    JOIN public.usuarios u ON u.id = rid.id
    WHERE NOT u.activo OR public.is_super_admin_role(u.rol::text)
  ) THEN
    RAISE EXCEPTION 'Solo usuarios activos del organigrama pueden asignarse como reportes' USING ERRCODE = '23514';
  END IF;

  UPDATE public.usuarios u
  SET manager_user_id = NULL, updated_at = now()
  WHERE u.manager_user_id = p_manager_id
    AND NOT (u.id = ANY (v_report_ids));

  FOREACH v_rid IN ARRAY v_report_ids
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.usuarios u2
      WHERE u2.id = v_rid AND u2.manager_user_id = p_manager_id
    ) THEN
      CONTINUE;
    END IF;

    IF v_is_privileged THEN
      UPDATE public.usuarios u
      SET manager_user_id = p_manager_id, updated_at = now()
      WHERE u.id = v_rid
        AND u.manager_user_id IS DISTINCT FROM p_manager_id;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.usuarios u2
        WHERE u2.id = v_rid AND u2.manager_user_id IS NULL
      ) THEN
        UPDATE public.usuarios u
        SET manager_user_id = p_manager_id, updated_at = now()
        WHERE u.id = v_rid;
      ELSE
        RAISE EXCEPTION 'No autorizado a tomar reportes con otro lider' USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;

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
  WHERE u.manager_user_id = p_manager_id
  ORDER BY u.nombre ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settings_users_set_direct_reports(uuid, uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- Metricas preparadas para dashboard
-- -----------------------------------------------------------------------------

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

COMMENT ON FUNCTION public.org_chart_governance_stats() IS
  'Indicadores de gobernanza organizacionallistos para dashboard (excluye Super Admin).';

GRANT EXECUTE ON FUNCTION public.org_chart_governance_stats() TO authenticated;
