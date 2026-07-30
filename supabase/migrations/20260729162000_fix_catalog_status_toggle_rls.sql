-- Fix: desactivar/activar estatus en catálogos fallaba con PGRST116.
-- Causa: RLS update en statuses exige can_manage_catalogs(); esa función
-- usa has_business_role('super_admin'), pero normalize_business_role dejaba
-- "Super Admin" como "super admin" (espacio) y nunca coincidía con "super_admin".
-- Resultado: UPDATE afectaba 0 filas y .single() devolvía PGRST116.

CREATE OR REPLACE FUNCTION public.normalize_business_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      translate(
        trim(coalesce(p_role, '')),
        U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1',
        'aeiouun'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    )
  );
$$;

COMMENT ON FUNCTION public.normalize_business_role(text) IS
  'Normaliza roles de negocio: minúsculas, sin acentos y separadores unificados a underscore (Super Admin → super_admin).';

-- Asegura privilegios de tabla; RLS sigue gobernando quién puede escribir.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.statuses TO authenticated;
