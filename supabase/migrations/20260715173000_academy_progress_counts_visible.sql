-- Expone solo conteos de progreso de Academia para alinear gamificacion en dashboard.
-- No revela pasos ni quizzes; respeta visibilidad propia o roles administrativos.

CREATE OR REPLACE FUNCTION public.academy_progress_counts_visible()
RETURNS TABLE (
  user_id uuid,
  completed_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ap.user_id,
    COALESCE(cardinality(ap.completed_modules), 0)::integer AS completed_count
  FROM public.academy_progress ap
  JOIN public.usuarios target
    ON target.user_id = ap.user_id
  WHERE
    ap.user_id = auth.uid()
    OR public.is_app_admin()
    OR public.is_business_admin();
$$;

COMMENT ON FUNCTION public.academy_progress_counts_visible() IS
  'Conteo de modulos de Academia completados visible para gamificacion; no expone detalle de progreso.';

REVOKE ALL ON FUNCTION public.academy_progress_counts_visible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_progress_counts_visible() TO authenticated;
