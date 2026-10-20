-- Diagnóstico: ¿existe el RPC que pide el front?
-- Ejecutar en SQL Editor del MISMO proyecto que VITE_SUPABASE_URL.

SELECT
  to_regprocedure('public.okr_dashboard()') IS NOT NULL AS has_okr_dashboard,
  to_regprocedure('public.okr_directory()') IS NOT NULL AS has_okr_directory,
  to_regprocedure('public.okr_reporting_history(uuid,timestamptz,uuid)') IS NOT NULL AS has_okr_reporting_history,
  to_regprocedure('public.get_operational_okr_dashboard()') IS NOT NULL AS has_operational_okr_dashboard,
  to_regclass('public.okr_key_results') IS NOT NULL AS has_okr_key_results,
  to_regclass('public.okr_initiatives') IS NOT NULL AS has_okr_initiatives;

-- Si has_okr_dashboard = false → ejecutar supabase/scripts/apply_okr_module.sql
-- Luego: NOTIFY pgrst, 'reload schema';
