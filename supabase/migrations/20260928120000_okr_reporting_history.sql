-- Reporting preserves the reference used at measurement time. Old measurements
-- intentionally keep NULL snapshots: their original targets cannot be inferred.
BEGIN;
ALTER TABLE public.okr_check_ins
  ADD COLUMN IF NOT EXISTS baseline_snapshot numeric,
  ADD COLUMN IF NOT EXISTS target_snapshot numeric,
  ADD COLUMN IF NOT EXISTS unit_snapshot text,
  ADD COLUMN IF NOT EXISTS title_snapshot text,
  ADD COLUMN IF NOT EXISTS owner_snapshot uuid,
  ADD COLUMN IF NOT EXISTS period_start_snapshot date,
  ADD COLUMN IF NOT EXISTS period_end_snapshot date;

CREATE OR REPLACE FUNCTION public.okr_capture_measurement_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT k.baseline_value, k.target_value, k.unit, k.title, k.owner_user_id, o.start_date, o.end_date
  INTO NEW.baseline_snapshot, NEW.target_snapshot, NEW.unit_snapshot, NEW.title_snapshot,
       NEW.owner_snapshot, NEW.period_start_snapshot, NEW.period_end_snapshot
  FROM public.okr_key_results k JOIN public.okrs o ON o.id = k.okr_id WHERE k.id = NEW.key_result_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS okr_measurement_reference ON public.okr_check_ins;
CREATE TRIGGER okr_measurement_reference BEFORE INSERT ON public.okr_check_ins
FOR EACH ROW EXECUTE FUNCTION public.okr_capture_measurement_reference();

CREATE TABLE IF NOT EXISTS public.okr_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  okr_id uuid NOT NULL REFERENCES public.okrs(id) ON DELETE CASCADE,
  key_result_id uuid REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
  entity text NOT NULL CHECK (entity IN ('objective','key_result')),
  event text NOT NULL CHECK (event IN ('created','updated')),
  before_data jsonb,
  after_data jsonb NOT NULL,
  actor_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_okr_change_log_history ON public.okr_change_log(okr_id, created_at DESC, id DESC);
ALTER TABLE public.okr_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS okr_change_log_read ON public.okr_change_log;
CREATE POLICY okr_change_log_read ON public.okr_change_log FOR SELECT TO authenticated
USING (public.okr_can_view(okr_id));
GRANT SELECT ON public.okr_change_log TO authenticated;

CREATE OR REPLACE FUNCTION public.okr_capture_configuration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb; v_okr uuid; v_kr uuid; v_entity text;
BEGIN
  IF TG_TABLE_NAME = 'okrs' THEN
    v_entity := 'objective'; v_okr := NEW.id;
    v_after := jsonb_build_object('title', NEW.nombre_okr, 'description', NEW.descripcion,
      'owner_user_id', NEW.owner_user_id, 'scope', NEW.scope, 'area_id', NEW.area_id,
      'start_date', NEW.start_date, 'end_date', NEW.end_date, 'activo', NEW.activo);
    IF TG_OP = 'UPDATE' THEN
      v_before := jsonb_build_object('title', OLD.nombre_okr, 'description', OLD.descripcion,
        'owner_user_id', OLD.owner_user_id, 'scope', OLD.scope, 'area_id', OLD.area_id,
        'start_date', OLD.start_date, 'end_date', OLD.end_date, 'activo', OLD.activo);
    END IF;
  ELSE
    v_entity := 'key_result'; v_okr := NEW.okr_id; v_kr := NEW.id;
    v_after := jsonb_build_object('title', NEW.title, 'baseline_value', NEW.baseline_value,
      'target_value', NEW.target_value, 'unit', NEW.unit, 'owner_user_id', NEW.owner_user_id);
    IF TG_OP = 'UPDATE' THEN
      v_before := jsonb_build_object('title', OLD.title, 'baseline_value', OLD.baseline_value,
        'target_value', OLD.target_value, 'unit', OLD.unit, 'owner_user_id', OLD.owner_user_id);
    END IF;
  END IF;
  IF v_before IS DISTINCT FROM v_after THEN
    INSERT INTO public.okr_change_log(okr_id, key_result_id, entity, event, before_data, after_data, actor_id)
    VALUES(v_okr, v_kr, v_entity, CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
      v_before, v_after, public.get_my_usuario_id());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS okr_configuration_history ON public.okrs;
CREATE TRIGGER okr_configuration_history AFTER INSERT OR UPDATE ON public.okrs
FOR EACH ROW EXECUTE FUNCTION public.okr_capture_configuration();
DROP TRIGGER IF EXISTS okr_kr_configuration_history ON public.okr_key_results;
CREATE TRIGGER okr_kr_configuration_history AFTER INSERT OR UPDATE ON public.okr_key_results
FOR EACH ROW EXECUTE FUNCTION public.okr_capture_configuration();

-- Keyset pagination includes the UUID tie-breaker for simultaneous events.
CREATE OR REPLACE FUNCTION public.okr_reporting_history(
  p_okr_id uuid, p_before timestamptz DEFAULT NULL, p_before_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(e ORDER BY e.created_at DESC, e.id DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM (
      SELECT c.id, c.created_at, c.created_by AS actor_id, 'measurement'::text AS kind,
        c.key_result_id, to_jsonb(c) || jsonb_build_object('current_title', k.title) AS details
      FROM public.okr_check_ins c JOIN public.okr_key_results k ON k.id = c.key_result_id
      WHERE k.okr_id = p_okr_id
      UNION ALL
      SELECT l.id, l.created_at, l.actor_id, 'configuration'::text, l.key_result_id,
        jsonb_build_object('entity', l.entity, 'event', l.event, 'before', l.before_data, 'after', l.after_data)
      FROM public.okr_change_log l WHERE l.okr_id = p_okr_id
    ) history
    WHERE p_before IS NULL OR (history.created_at, history.id) < (p_before, p_before_id)
    ORDER BY history.created_at DESC, history.id DESC LIMIT 51
  ) e;
$$;
REVOKE ALL ON FUNCTION public.okr_capture_measurement_reference(), public.okr_capture_configuration(),
  public.okr_reporting_history(uuid,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_reporting_history(uuid,timestamptz,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
