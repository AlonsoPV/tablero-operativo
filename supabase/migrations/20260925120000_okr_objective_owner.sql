-- Every objective (company or team) has an accountable owner.
BEGIN;

ALTER TABLE public.okrs
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_okrs_owner ON public.okrs(owner_user_id);

CREATE OR REPLACE FUNCTION public.okr_can_view(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND EXISTS (
    SELECT 1 FROM okrs o WHERE o.id = p_id AND (
      o.scope = 'company' OR public.okr_manage_scope(o.area_id)
      OR o.owner_user_id = public.get_my_usuario_id()
      OR EXISTS (SELECT 1 FROM usuario_areas ua WHERE ua.area_id = o.area_id AND ua.user_id = public.get_my_usuario_id())
      OR EXISTS (SELECT 1 FROM usuarios u JOIN areas a ON a.nombre = u.area WHERE u.user_id = auth.uid() AND a.id = o.area_id)
      OR EXISTS (SELECT 1 FROM okr_key_results k WHERE k.okr_id = o.id AND k.owner_user_id = public.get_my_usuario_id())
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.okr_save_objective(p_data jsonb, p_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_area uuid := NULLIF(p_data->>'area_id', '')::uuid;
  v_owner uuid := NULLIF(p_data->>'owner_user_id', '')::uuid;
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
  IF p_id IS NOT NULL THEN
    PERFORM 1 FROM okrs WHERE id = p_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM okrs o WHERE o.id = p_id AND (o.area_id IS DISTINCT FROM v_area OR o.scope <> p_data->>'scope'))
      AND EXISTS (SELECT 1 FROM okr_key_results WHERE okr_id = p_id) THEN
      RAISE EXCEPTION 'No se puede cambiar el ámbito de un objetivo con KRs; crea otro objetivo';
    END IF;
    UPDATE okrs SET nombre_okr = v_title, title = v_title, descripcion = NULLIF(trim(p_data->>'descripcion'), ''),
      scope = p_data->>'scope', area_id = v_area, owner_user_id = v_owner, start_date = v_start, end_date = v_end,
      periodo = v_start::text || ' / ' || v_end::text, activo = COALESCE((p_data->>'activo')::boolean, true), updated_at = now()
    WHERE id = p_id;
  ELSE
    INSERT INTO okrs(nombre_okr, title, descripcion, scope, area_id, owner_user_id, start_date, end_date, periodo)
    VALUES(v_title, v_title, NULLIF(trim(p_data->>'descripcion'), ''), p_data->>'scope', v_area, v_owner, v_start, v_end,
      v_start::text || ' / ' || v_end::text) RETURNING id INTO p_id;
  END IF;
  RETURN p_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
