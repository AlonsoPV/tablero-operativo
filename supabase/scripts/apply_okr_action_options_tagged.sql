-- Aplicar en SQL Editor del proyecto que usa la app.
-- Lista de vincular iniciativas: solo acciones con tag OKR; Kanban corporativo no exige área.

ALTER TABLE public.acciones_diarias
  ADD COLUMN IF NOT EXISTS es_okr boolean NOT NULL DEFAULT false;
ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS es_okr boolean NOT NULL DEFAULT false;

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

REVOKE ALL ON FUNCTION public.okr_action_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_action_options() TO authenticated;

NOTIFY pgrst, 'reload schema';
