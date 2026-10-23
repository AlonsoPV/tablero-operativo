-- =============================================================================
-- Alineación OKR equipo → empresa, tag es_okr en acciones, iniciativas filtradas.
-- =============================================================================

ALTER TABLE public.okrs
  ADD COLUMN IF NOT EXISTS parent_okr_id uuid REFERENCES public.okrs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_okrs_parent ON public.okrs(parent_okr_id);

ALTER TABLE public.acciones_diarias
  ADD COLUMN IF NOT EXISTS es_okr boolean NOT NULL DEFAULT false;
ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS es_okr boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.okr_save_objective(p_data jsonb, p_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_area uuid := NULLIF(p_data->>'area_id', '')::uuid;
  v_owner uuid := NULLIF(p_data->>'owner_user_id', '')::uuid;
  v_parent uuid := NULLIF(p_data->>'parent_okr_id', '')::uuid;
  v_start date := (p_data->>'start_date')::date;
  v_end date := (p_data->>'end_date')::date;
  v_title text := trim(p_data->>'nombre_okr');
BEGIN
  IF NOT public.okr_manage_scope(v_area) OR (p_id IS NOT NULL AND NOT public.okr_can_manage(p_id)) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar este objetivo';
  END IF;
  IF v_title IS NULL OR length(v_title) < 3 OR v_start IS NULL OR v_end IS NULL OR v_end < v_start THEN
    RAISE EXCEPTION 'Define un objetivo y un periodo válido';
  END IF;
  IF p_data->>'scope' IS NULL OR p_data->>'scope' NOT IN ('company', 'team') OR
    ((p_data->>'scope' = 'team') <> (v_area IS NOT NULL)) THEN RAISE EXCEPTION 'Selecciona el ámbito y equipo'; END IF;
  IF v_owner IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id = v_owner AND activo) THEN
    RAISE EXCEPTION 'Selecciona un responsable activo para el objetivo';
  END IF;
  IF p_data->>'scope' = 'company' THEN
    v_parent := NULL;
  ELSIF v_parent IS NOT NULL THEN
    IF v_parent = p_id OR NOT EXISTS (
      SELECT 1 FROM okrs p WHERE p.id = v_parent AND p.scope = 'company'
    ) THEN
      RAISE EXCEPTION 'Alinea el OKR de equipo con un objetivo de empresa';
    END IF;
  END IF;
  IF p_id IS NOT NULL THEN
    PERFORM 1 FROM okrs WHERE id = p_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM okrs o WHERE o.id = p_id AND (o.area_id IS DISTINCT FROM v_area OR o.scope <> p_data->>'scope'))
      AND EXISTS (SELECT 1 FROM okr_key_results WHERE okr_id = p_id) THEN
      RAISE EXCEPTION 'No se puede cambiar el ámbito de un objetivo con KRs; crea otro objetivo';
    END IF;
    UPDATE okrs SET nombre_okr = v_title, title = v_title, descripcion = NULLIF(trim(p_data->>'descripcion'), ''),
      scope = p_data->>'scope', area_id = v_area, owner_user_id = v_owner, parent_okr_id = v_parent,
      start_date = v_start, end_date = v_end,
      periodo = v_start::text || ' / ' || v_end::text, activo = COALESCE((p_data->>'activo')::boolean, true), updated_at = now()
    WHERE id = p_id;
  ELSE
    INSERT INTO okrs(nombre_okr, title, descripcion, scope, area_id, owner_user_id, parent_okr_id, start_date, end_date, periodo)
    VALUES(v_title, v_title, NULLIF(trim(p_data->>'descripcion'), ''), p_data->>'scope', v_area, v_owner, v_parent, v_start, v_end,
      v_start::text || ' / ' || v_end::text) RETURNING id INTO p_id;
  END IF;
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_validate_initiative() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_area uuid; v_scope text;
BEGIN
  SELECT o.area_id, o.scope INTO v_area, v_scope
  FROM okrs o JOIN okr_key_results k ON k.okr_id = o.id WHERE k.id = NEW.key_result_id;
  IF v_scope IS DISTINCT FROM 'team' THEN
    RAISE EXCEPTION 'Las iniciativas solo se vinculan a OKRs de equipo';
  END IF;
  IF NEW.action_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM acciones_diarias a WHERE a.id = NEW.action_id AND a.es_okr
  ) THEN RAISE EXCEPTION 'Solo se pueden vincular acciones marcadas como OKR'; END IF;
  IF NEW.team_action_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM acciones_equipo a WHERE a.id = NEW.team_action_id AND a.es_okr
      AND (v_area IS NULL OR a.area_id = v_area)
  ) THEN RAISE EXCEPTION 'Solo se pueden vincular acciones marcadas como OKR'; END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS okr_initiatives_insert ON public.okr_initiatives;
CREATE POLICY okr_initiatives_insert ON public.okr_initiatives FOR INSERT TO authenticated
  WITH CHECK (public.okr_can_update_kr(key_result_id));
GRANT SELECT, INSERT, DELETE ON public.okr_initiatives TO authenticated;

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
      UNION ALL
      SELECT t.id, t.titulo, 'team', t.area_id, COALESCE(s.es_cierre, false), true
      FROM acciones_equipo t
      LEFT JOIN statuses s ON s.id = t.estado_id
      WHERE COALESCE(t.es_okr, false)
    ) a
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_can_tag_actions() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND (
    public.can_manage_catalogs() OR public.user_belongs_to_area_name('OKRS')
  );
$$;

CREATE OR REPLACE FUNCTION public.okr_tag_team_action(p_id uuid, p_es_okr boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.okr_can_tag_actions() THEN
    RAISE EXCEPTION 'Solo el área OKRS puede marcar acciones como OKR';
  END IF;
  UPDATE public.acciones_equipo SET es_okr = COALESCE(p_es_okr, false) WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acción de equipo no encontrada'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_guard_es_okr() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.es_okr IS NOT DISTINCT FROM OLD.es_okr THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.es_okr, false) AND NOT public.okr_can_tag_actions() THEN
    RAISE EXCEPTION 'Solo el área OKRS puede marcar acciones como OKR';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acciones_diarias_okr_tag ON public.acciones_diarias;
CREATE TRIGGER acciones_diarias_okr_tag
  BEFORE INSERT OR UPDATE OF es_okr ON public.acciones_diarias
  FOR EACH ROW EXECUTE FUNCTION public.okr_guard_es_okr();

REVOKE ALL ON FUNCTION public.okr_can_tag_actions(), public.okr_tag_team_action(uuid, boolean),
  public.okr_guard_es_okr() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_save_objective(jsonb, uuid), public.okr_action_options(),
  public.okr_can_tag_actions(), public.okr_tag_team_action(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
