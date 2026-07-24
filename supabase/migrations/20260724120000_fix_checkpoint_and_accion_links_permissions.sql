-- Corrige permisos de checklist y tablas puente de O2C para edicion de acciones.
-- - set_accion_checkpoint_completado devolvia 400 cuando el usuario tenia permiso
--   funcional pero no estaba contemplado por el RPC mas reciente.
-- - accion_gaps / accion_catalog_kpis devolvian 403 para Direccion o usuarios con
--   permiso completo de accion porque la politica seguia limitada a creador,
--   responsable o app admin.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accion_checkpoints TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.accion_gaps TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.accion_catalog_kpis TO authenticated;

CREATE OR REPLACE FUNCTION public.set_accion_checkpoint_completado(
  p_checkpoint_id uuid,
  p_completado boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  v_accion_id uuid;
  v_creator uuid;
  v_action_responsable uuid;
  v_checkpoint_responsable uuid;
  can_update boolean;
BEGIN
  me := public.get_my_usuario_id();

  IF me IS NULL THEN
    RAISE EXCEPTION 'No autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.accion_id, c.responsable_id, a.created_by, a.responsable
  INTO v_accion_id, v_checkpoint_responsable, v_creator, v_action_responsable
  FROM public.accion_checkpoints c
  JOIN public.acciones_diarias a ON a.id = c.accion_id
  WHERE c.id = p_checkpoint_id
    AND c.activo = true;

  IF v_accion_id IS NULL THEN
    RAISE EXCEPTION 'Punto de checklist no encontrado o inactivo.'
      USING ERRCODE = 'P0002';
  END IF;

  can_update :=
    public.can_manage_accion_full_as(v_accion_id, me)
    OR public.can_contribute_accion_checklist(v_accion_id)
    OR (v_creator IS NOT NULL AND v_creator = me)
    OR v_action_responsable = me
    OR v_checkpoint_responsable = me
    OR public.is_app_admin()
    OR public.is_business_admin();

  IF NOT can_update THEN
    RAISE EXCEPTION 'No tienes permiso para marcar este punto del checklist.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accion_checkpoints
  SET
    completado = p_completado,
    checked_at = CASE WHEN p_completado THEN now() ELSE NULL END,
    checked_by = CASE WHEN p_completado THEN me ELSE NULL END
  WHERE id = p_checkpoint_id
    AND activo = true;
END;
$$;

COMMENT ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) IS
  'Marca/desmarca un punto validando permiso completo, contribucion, responsable de accion, responsable del check o admin.';

REVOKE ALL ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_accion_checkpoint_completado(uuid, boolean) TO authenticated;

DROP POLICY IF EXISTS accion_gaps_insert_responsable_creator_admin ON public.accion_gaps;
DROP POLICY IF EXISTS accion_gaps_delete_responsable_creator_admin ON public.accion_gaps;
DROP POLICY IF EXISTS accion_catalog_kpis_insert_responsable_creator_admin ON public.accion_catalog_kpis;
DROP POLICY IF EXISTS accion_catalog_kpis_delete_responsable_creator_admin ON public.accion_catalog_kpis;

CREATE POLICY accion_gaps_insert_manage_accion ON public.accion_gaps
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_accion_full(accion_id));

CREATE POLICY accion_gaps_delete_manage_accion ON public.accion_gaps
  FOR DELETE
  TO authenticated
  USING (public.can_manage_accion_full(accion_id));

CREATE POLICY accion_catalog_kpis_insert_manage_accion ON public.accion_catalog_kpis
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_accion_full(accion_id));

CREATE POLICY accion_catalog_kpis_delete_manage_accion ON public.accion_catalog_kpis
  FOR DELETE
  TO authenticated
  USING (public.can_manage_accion_full(accion_id));

NOTIFY pgrst, 'reload schema';
