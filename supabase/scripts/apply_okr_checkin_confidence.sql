-- Aplicar en SQL Editor del proyecto que usa la app.
-- Semáforo de confianza (rojo / amarillo / verde) al registrar una medición.

ALTER TABLE public.okr_check_ins
  ADD COLUMN IF NOT EXISTS confidence text;

ALTER TABLE public.okr_check_ins
  DROP CONSTRAINT IF EXISTS okr_check_ins_confidence_check;
ALTER TABLE public.okr_check_ins
  ADD CONSTRAINT okr_check_ins_confidence_check
  CHECK (confidence IS NULL OR confidence IN ('red', 'yellow', 'green'));

DROP FUNCTION IF EXISTS public.okr_check_in(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.okr_check_in(
  p_id uuid,
  p_value numeric,
  p_note text DEFAULT NULL,
  p_confidence text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM okr_key_results WHERE id = p_id AND metric_type LIKE 'manual:%' FOR UPDATE;
  IF NOT FOUND OR NOT public.okr_can_update_kr(p_id) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar esta medición';
  END IF;
  IF p_value IS NULL OR p_value::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'La medición debe ser un número finito';
  END IF;
  IF p_confidence IS NOT NULL AND p_confidence NOT IN ('red', 'yellow', 'green') THEN
    RAISE EXCEPTION 'Indica si tu confianza es roja, amarilla o verde';
  END IF;
  INSERT INTO okr_check_ins(key_result_id, value, note, created_by, confidence)
    VALUES(p_id, p_value, NULLIF(trim(p_note), ''), public.get_my_usuario_id(), p_confidence);
  UPDATE okr_key_results SET current_value = p_value, updated_at = now() WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.okr_check_in(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okr_check_in(uuid, numeric, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
