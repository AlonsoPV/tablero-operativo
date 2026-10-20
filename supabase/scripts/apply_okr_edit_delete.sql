-- Aplicar en SQL Editor del proyecto que usa la app.
-- Área OKRS puede editar OKRs; agrega RPCs de borrado.

CREATE OR REPLACE FUNCTION public.okr_manage_scope(p_area uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND (
    public.can_manage_catalogs()
    OR public.user_belongs_to_area_name('OKRS')
    OR (p_area IS NOT NULL AND public.team_kanban_is_leader(p_area))
  );
$$;

CREATE OR REPLACE FUNCTION public.okr_delete_objective(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_id IS NULL OR NOT public.okr_can_manage(p_id) THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar este objetivo'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.okrs WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Objetivo no encontrado' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_delete_key_result(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_okr uuid;
BEGIN
  SELECT okr_id INTO v_okr
  FROM public.okr_key_results
  WHERE id = p_id AND metric_type LIKE 'manual:%';
  IF v_okr IS NULL THEN
    RAISE EXCEPTION 'Este resultado clave no se puede eliminar';
  END IF;
  IF NOT public.okr_can_manage(v_okr) THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar este resultado clave'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.okr_key_results WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.okr_delete_objective(uuid), public.okr_delete_key_result(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_delete_objective(uuid), public.okr_delete_key_result(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
