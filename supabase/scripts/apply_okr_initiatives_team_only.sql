-- Aplicar en SQL Editor del proyecto que usa la app.
-- Bloquea vincular iniciativas a OKRs empresa; solo OKRs de equipo.

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
