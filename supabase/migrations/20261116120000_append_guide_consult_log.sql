-- Append atómico a guide_sessions.consult_log (evita RMW que pisa entradas concurrentes).
CREATE OR REPLACE FUNCTION public.append_guide_consult_log(
  p_session_id uuid,
  p_entry jsonb,
  p_max integer DEFAULT 16
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_log jsonb;
  next_log jsonb;
  len integer;
BEGIN
  IF p_session_id IS NULL OR p_entry IS NULL THEN
    RETURN;
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(COALESCE(consult_log, '[]'::jsonb)) = 'array' THEN COALESCE(consult_log, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
  INTO current_log
  FROM public.guide_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  next_log := current_log || jsonb_build_array(p_entry);
  len := jsonb_array_length(next_log);
  IF len > GREATEST(1, COALESCE(p_max, 16)) THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
    INTO next_log
    FROM jsonb_array_elements(next_log) WITH ORDINALITY AS t(elem, ord)
    WHERE ord > (len - GREATEST(1, COALESCE(p_max, 16)));
  END IF;

  UPDATE public.guide_sessions
  SET consult_log = next_log
  WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_guide_consult_log(uuid, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_guide_consult_log(uuid, jsonb, integer) TO service_role;

COMMENT ON FUNCTION public.append_guide_consult_log(uuid, jsonb, integer) IS
  'Append atómico a consult_log (máx p_max entradas). Solo service_role.';
