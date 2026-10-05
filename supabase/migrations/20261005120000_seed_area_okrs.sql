-- =============================================================================
-- Catálogo: asegurar área OKRS (acceso a /okrs y pestaña OKRs del dashboard).
-- UUID fijo alineado al catálogo existente en producción/dev.
-- =============================================================================

INSERT INTO public.areas (id, nombre, descripcion, activo)
SELECT
  'a3561f47-6800-440d-8ba1-85334b8e05f8'::uuid,
  'OKRS',
  'Gestión de objetivos, resultados clave e iniciativas (módulo OKRs).',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.areas a
  WHERE a.id = 'a3561f47-6800-440d-8ba1-85334b8e05f8'::uuid
     OR lower(trim(a.nombre)) = 'okrs'
);
