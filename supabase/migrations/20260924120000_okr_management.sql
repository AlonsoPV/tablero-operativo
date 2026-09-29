-- Evolves existing OKRs. Company means the organization of this installation;
-- teams reuse areas and area_lideres (no parallel team catalogue).
BEGIN;

-- Some installations have only the original OKR catalogue, without the
-- optional operational-dashboard migration. Upgrade that schema first.
ALTER TABLE public.okrs
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;
UPDATE public.okrs SET title = nombre_okr WHERE title IS NULL;

CREATE TABLE IF NOT EXISTS public.okr_key_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  okr_id uuid NOT NULL REFERENCES public.okrs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  metric_type text NOT NULL,
  baseline_value numeric,
  target_value numeric NOT NULL,
  current_value numeric,
  unit text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'increase' CHECK (direction IN ('increase', 'decrease')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (okr_id, metric_type)
);
ALTER TABLE public.okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_key_results ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_modules (key, nombre, descripcion, route, section, sort_order)
VALUES ('okrs', 'OKRs', 'Objetivos, resultados clave e iniciativas por periodo.', '/okrs', 'operacion', 15)
ON CONFLICT (key) DO UPDATE SET nombre = EXCLUDED.nombre, route = EXCLUDED.route, activo = true;
INSERT INTO public.catalog_role_modules (role_id, module_key)
SELECT id, 'okrs' FROM public.catalog_roles WHERE activo
ON CONFLICT DO NOTHING;

ALTER TABLE public.okrs
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'company' CHECK (scope IN ('company', 'team')),
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id) ON DELETE RESTRICT;
ALTER TABLE public.okrs DROP CONSTRAINT IF EXISTS okrs_scope_area;
ALTER TABLE public.okrs DROP CONSTRAINT IF EXISTS okrs_dates;
ALTER TABLE public.okrs
  ADD CONSTRAINT okrs_scope_area CHECK ((scope = 'company' AND area_id IS NULL) OR (scope = 'team' AND area_id IS NOT NULL)),
  ADD CONSTRAINT okrs_dates CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

ALTER TABLE public.okr_key_results
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.okr_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_result_id uuid NOT NULL REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  note text,
  created_by uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_okr_check_ins_history ON public.okr_check_ins(key_result_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.okr_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_result_id uuid NOT NULL REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
  action_id uuid REFERENCES public.acciones_diarias(id) ON DELETE CASCADE,
  team_action_id uuid REFERENCES public.acciones_equipo(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(action_id, team_action_id) = 1),
  UNIQUE (key_result_id, action_id),
  UNIQUE (key_result_id, team_action_id)
);
CREATE INDEX IF NOT EXISTS idx_okrs_scope_period ON public.okrs(scope, area_id, start_date, end_date);

CREATE OR REPLACE FUNCTION public.okr_active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE user_id = auth.uid() AND activo);
$$;

CREATE OR REPLACE FUNCTION public.okr_manage_scope(p_area uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND (public.can_manage_catalogs()
    OR (p_area IS NOT NULL AND public.team_kanban_is_leader(p_area)));
$$;

CREATE OR REPLACE FUNCTION public.okr_can_view(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND EXISTS (
    SELECT 1 FROM okrs o WHERE o.id = p_id AND (
      o.scope = 'company' OR public.okr_manage_scope(o.area_id)
      OR EXISTS (SELECT 1 FROM usuario_areas ua WHERE ua.area_id = o.area_id AND ua.user_id = public.get_my_usuario_id())
      OR EXISTS (SELECT 1 FROM usuarios u JOIN areas a ON a.nombre = u.area WHERE u.user_id = auth.uid() AND a.id = o.area_id)
      OR EXISTS (SELECT 1 FROM okr_key_results k WHERE k.okr_id = o.id AND k.owner_user_id = public.get_my_usuario_id())
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.okr_can_manage(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM okrs WHERE id = p_id AND public.okr_manage_scope(area_id));
$$;

CREATE OR REPLACE FUNCTION public.okr_can_update_kr(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND EXISTS (SELECT 1 FROM okr_key_results k
    JOIN okrs o ON o.id = k.okr_id WHERE k.id = p_id AND o.activo
    AND (public.okr_can_manage(o.id) OR k.owner_user_id = public.get_my_usuario_id()));
$$;

DROP POLICY IF EXISTS okrs_select_authenticated ON public.okrs;
CREATE POLICY okrs_select_authenticated ON public.okrs FOR SELECT TO authenticated USING (public.okr_can_view(id));
DROP POLICY IF EXISTS okr_key_results_select_authenticated ON public.okr_key_results;
CREATE POLICY okr_key_results_select_authenticated ON public.okr_key_results FOR SELECT TO authenticated USING (public.okr_can_view(okr_id));
ALTER TABLE public.okr_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_initiatives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS okr_check_ins_read ON public.okr_check_ins;
CREATE POLICY okr_check_ins_read ON public.okr_check_ins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.okr_key_results k WHERE k.id = key_result_id));
DROP POLICY IF EXISTS okr_initiatives_read ON public.okr_initiatives;
CREATE POLICY okr_initiatives_read ON public.okr_initiatives FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.okr_key_results k WHERE k.id = key_result_id));
DROP POLICY IF EXISTS okr_initiatives_insert ON public.okr_initiatives;
CREATE POLICY okr_initiatives_insert ON public.okr_initiatives FOR INSERT TO authenticated
  WITH CHECK (public.okr_can_update_kr(key_result_id));
DROP POLICY IF EXISTS okr_initiatives_delete ON public.okr_initiatives;
CREATE POLICY okr_initiatives_delete ON public.okr_initiatives FOR DELETE TO authenticated
  USING (public.okr_can_update_kr(key_result_id));
GRANT SELECT ON public.okrs, public.okr_check_ins, public.okr_key_results TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.okr_initiatives TO authenticated;

-- Invoker trigger checks action visibility under its existing RLS, as well as team scope.
CREATE OR REPLACE FUNCTION public.okr_validate_initiative() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_area uuid;
BEGIN
  SELECT o.area_id INTO v_area FROM okrs o JOIN okr_key_results k ON k.okr_id = o.id WHERE k.id = NEW.key_result_id;
  IF NEW.action_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM acciones_diarias a WHERE a.id = NEW.action_id
      AND (v_area IS NULL OR a.area = (SELECT nombre FROM areas WHERE id = v_area))
  ) THEN RAISE EXCEPTION 'La acción no es accesible o no pertenece al equipo del objetivo'; END IF;
  IF NEW.team_action_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM acciones_equipo a WHERE a.id = NEW.team_action_id AND (v_area IS NULL OR a.area_id = v_area)
  ) THEN RAISE EXCEPTION 'La acción no es accesible o no pertenece al equipo del objetivo'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS okr_initiative_validation ON public.okr_initiatives;
CREATE TRIGGER okr_initiative_validation BEFORE INSERT OR UPDATE ON public.okr_initiatives
  FOR EACH ROW EXECUTE FUNCTION public.okr_validate_initiative();

CREATE OR REPLACE FUNCTION public.okr_save_objective(p_data jsonb, p_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_area uuid := NULLIF(p_data->>'area_id', '')::uuid;
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
  IF p_id IS NOT NULL THEN
    PERFORM 1 FROM okrs WHERE id = p_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM okrs o WHERE o.id = p_id AND (o.area_id IS DISTINCT FROM v_area OR o.scope <> p_data->>'scope'))
      AND EXISTS (SELECT 1 FROM okr_key_results WHERE okr_id = p_id) THEN
      RAISE EXCEPTION 'No se puede cambiar el ámbito de un objetivo con KRs; crea otro objetivo';
    END IF;
    UPDATE okrs SET nombre_okr = v_title, title = v_title, descripcion = NULLIF(trim(p_data->>'descripcion'), ''),
      scope = p_data->>'scope', area_id = v_area, start_date = v_start, end_date = v_end,
      periodo = v_start::text || ' / ' || v_end::text, activo = COALESCE((p_data->>'activo')::boolean, true), updated_at = now()
    WHERE id = p_id;
  ELSE
    INSERT INTO okrs(nombre_okr, title, descripcion, scope, area_id, start_date, end_date, periodo)
    VALUES(v_title, v_title, NULLIF(trim(p_data->>'descripcion'), ''), p_data->>'scope', v_area, v_start, v_end,
      v_start::text || ' / ' || v_end::text) RETURNING id INTO p_id;
  END IF;
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_save_key_result(p_okr_id uuid, p_data jsonb, p_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base numeric := (p_data->>'baseline_value')::numeric;
  v_target numeric := (p_data->>'target_value')::numeric;
  v_owner uuid := (p_data->>'owner_user_id')::uuid;
  v_title text := trim(p_data->>'title');
BEGIN
  PERFORM 1 FROM okrs WHERE id = p_okr_id AND activo FOR UPDATE;
  IF NOT FOUND OR NOT public.okr_can_manage(p_okr_id) THEN RAISE EXCEPTION 'No puedes editar los KRs de este objetivo'; END IF;
  IF v_title IS NULL OR length(v_title) < 3 OR v_base IS NULL OR v_target IS NULL OR v_base = v_target
    OR v_base::text IN ('NaN','Infinity','-Infinity') OR v_target::text IN ('NaN','Infinity','-Infinity')
    OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id = v_owner AND activo) THEN
    RAISE EXCEPTION 'Define título, línea base, una meta diferente y un dueño activo';
  END IF;
  IF p_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM okr_key_results WHERE id = p_id AND okr_id = p_okr_id AND metric_type LIKE 'manual:%') THEN
      RAISE EXCEPTION 'Este KR automático no admite edición manual';
    END IF;
    UPDATE okr_key_results SET title = v_title, baseline_value = v_base, target_value = v_target,
      owner_user_id = v_owner, unit = COALESCE(p_data->>'unit', ''),
      direction = CASE WHEN v_target > v_base THEN 'increase' ELSE 'decrease' END, updated_at = now() WHERE id = p_id;
  ELSE
    p_id := gen_random_uuid();
    INSERT INTO okr_key_results(id, okr_id, title, baseline_value, target_value, current_value, owner_user_id, unit, direction, metric_type)
    VALUES(p_id, p_okr_id, v_title, v_base, v_target, v_base, v_owner, COALESCE(p_data->>'unit', ''),
      CASE WHEN v_target > v_base THEN 'increase' ELSE 'decrease' END, 'manual:' || p_id::text);
    INSERT INTO okr_check_ins(key_result_id, value, note, created_by)
    VALUES(p_id, v_base, 'Línea base inicial', public.get_my_usuario_id());
  END IF;
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_check_in(p_id uuid, p_value numeric, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM okr_key_results WHERE id = p_id AND metric_type LIKE 'manual:%' FOR UPDATE;
  IF NOT FOUND OR NOT public.okr_can_update_kr(p_id) THEN RAISE EXCEPTION 'No tienes permiso para registrar esta medición'; END IF;
  IF p_value IS NULL OR p_value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'La medición debe ser un número finito'; END IF;
  INSERT INTO okr_check_ins(key_result_id, value, note, created_by)
    VALUES(p_id, p_value, NULLIF(trim(p_note), ''), public.get_my_usuario_id());
  UPDATE okr_key_results SET current_value = p_value, updated_at = now() WHERE id = p_id;
END;
$$;

-- Invoker keeps all objective, KR and history reads under RLS.
CREATE OR REPLACE FUNCTION public.okr_dashboard() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'objectives', COALESCE((SELECT jsonb_agg(to_jsonb(o) || jsonb_build_object('can_manage', public.okr_can_manage(o.id)) ORDER BY o.start_date DESC NULLS LAST) FROM okrs o), '[]'::jsonb),
    'keyResults', COALESCE((SELECT jsonb_agg(to_jsonb(k) || jsonb_build_object('can_update', public.okr_can_update_kr(k.id)) ORDER BY k.display_order, k.created_at) FROM okr_key_results k), '[]'::jsonb),
    'initiatives', COALESCE((SELECT jsonb_agg(i) FROM okr_initiatives i), '[]'::jsonb),
    'checkIns', COALESCE((SELECT jsonb_agg(c ORDER BY c.created_at DESC) FROM okr_check_ins c), '[]'::jsonb),
    'can_manage_company', public.okr_manage_scope(NULL)
  );
$$;

-- Exposes only the assignment directory, never private user profile fields.
CREATE OR REPLACE FUNCTION public.okr_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.okr_active_user() THEN jsonb_build_object(
    'users', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) ORDER BY nombre) FROM usuarios WHERE activo), '[]'::jsonb),
    'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'can_manage', public.okr_manage_scope(a.id)) ORDER BY a.nombre) FROM areas a
      WHERE public.okr_manage_scope(a.id) OR EXISTS (SELECT 1 FROM usuario_areas ua WHERE ua.area_id = a.id AND ua.user_id = public.get_my_usuario_id())
      OR EXISTS (SELECT 1 FROM okrs o WHERE o.area_id = a.id AND public.okr_can_view(o.id))), '[]'::jsonb)
  ) ELSE '{"users":[],"areas":[]}'::jsonb END;
$$;

REVOKE ALL ON FUNCTION public.okr_active_user(), public.okr_manage_scope(uuid), public.okr_can_view(uuid), public.okr_can_manage(uuid),
  public.okr_can_update_kr(uuid), public.okr_save_objective(jsonb,uuid), public.okr_save_key_result(uuid,jsonb,uuid),
  public.okr_check_in(uuid,numeric,text), public.okr_dashboard(), public.okr_directory(), public.okr_validate_initiative() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_active_user(), public.okr_manage_scope(uuid), public.okr_can_view(uuid), public.okr_can_manage(uuid),
  public.okr_can_update_kr(uuid), public.okr_save_objective(jsonb,uuid), public.okr_save_key_result(uuid,jsonb,uuid),
  public.okr_check_in(uuid,numeric,text), public.okr_dashboard(), public.okr_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.okr_action_options() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(a ORDER BY a.title), '[]'::jsonb) FROM (
    SELECT d.id, d.titulo_accion AS title, 'company' AS kind, ar.id AS area_id,
      COALESCE((SELECT s.es_cierre FROM statuses s
        WHERE lower(trim(COALESCE(to_jsonb(s)->>'estado_key', s.nombre))) = lower(trim(d.estado::text))
           OR lower(trim(s.nombre)) = lower(trim(d.estado::text))
        ORDER BY (lower(trim(COALESCE(to_jsonb(s)->>'estado_key', s.nombre))) = lower(trim(d.estado::text))) DESC
        LIMIT 1), lower(trim(d.estado::text)) IN ('hecho','verificado','cerrado','realizado')) AS closed
    FROM acciones_diarias d LEFT JOIN areas ar ON ar.nombre = d.area
    UNION ALL
    SELECT t.id, t.titulo, 'team', t.area_id, COALESCE(s.es_cierre, false)
    FROM acciones_equipo t LEFT JOIN statuses s ON s.id = t.estado_id
  ) a;
$$;
REVOKE ALL ON FUNCTION public.okr_action_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_action_options() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
