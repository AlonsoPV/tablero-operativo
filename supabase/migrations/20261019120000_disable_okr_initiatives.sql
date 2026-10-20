-- =============================================================================
-- OKRs already do not use Kanban actions as initiatives. Block new links.
-- =============================================================================

DROP POLICY IF EXISTS okr_initiatives_insert ON public.okr_initiatives;
REVOKE INSERT, UPDATE ON public.okr_initiatives FROM authenticated;
GRANT SELECT, DELETE ON public.okr_initiatives TO authenticated;

CREATE OR REPLACE FUNCTION public.okr_validate_initiative() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Los OKRs no admiten iniciativas vinculadas'
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.okr_validate_initiative() IS
  'Rechaza cualquier vínculo de acción de Kanban a un resultado clave.';

NOTIFY pgrst, 'reload schema';
