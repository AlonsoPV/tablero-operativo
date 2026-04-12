-- Meta M3 para alineación con docs/KPIs.md (getActiveMeta mes 1–3).
ALTER TABLE public.catalog_kpis
  ADD COLUMN IF NOT EXISTS target_m3 numeric;

COMMENT ON COLUMN public.catalog_kpis.target_m3 IS
  'Meta mes 3 (programa O2C). Opcional. Usada por cálculo MD §3–§4 con mes de programa.';
