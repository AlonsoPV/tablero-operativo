-- RPC para insertar snapshots del score global (0–1) sin requerir rol admin en la tabla.
-- Dedupe: mismo día UTC y mismo score → devuelve el id existente sin insertar otra fila.

CREATE OR REPLACE FUNCTION public.record_global_score_snapshot(
  p_score numeric,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
  v_id uuid;
  existing_id uuid;
BEGIN
  v := LEAST(1::numeric, GREATEST(0::numeric, COALESCE(p_score, 0::numeric)));

  SELECT s.id INTO existing_id
  FROM public.global_score_snapshots s
  WHERE (s.created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
    AND abs(s.score - v) < 1e-9::numeric
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO public.global_score_snapshots (score, metadata)
  VALUES (
    v,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('recorded_at', to_jsonb(now()))
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_global_score_snapshot(numeric, jsonb) IS
  'Inserta snapshot del score global O2C (0–1). Dedupe mismo día UTC y mismo score. Usado tras registrar mediciones de catálogo.';

REVOKE ALL ON FUNCTION public.record_global_score_snapshot(numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_global_score_snapshot(numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_global_score_snapshot(numeric, jsonb) TO service_role;
