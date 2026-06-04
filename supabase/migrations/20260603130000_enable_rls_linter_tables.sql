-- =============================================================================
-- RLS audit: protect public tables exposed through PostgREST.
-- Addresses Supabase linter 0013_rls_disabled_in_public for legacy catalog,
-- action-support, KPI, area report and distance helper tables.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_catalogs()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.is_app_admin()
    OR public.is_business_admin()
    OR public.has_business_role('Direccion');
$$;

COMMENT ON FUNCTION public.can_manage_catalogs() IS
  'Permiso comun para administrar catalogos y configuracion: admin app, admin de negocio o Direccion.';

-- Catalogos y tablas maestras: lectura autenticada, escritura solo administradores.
ALTER TABLE public.catalog_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropdown_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_mediciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_onepager_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_reportes_diarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_roles_select_authenticated ON public.catalog_roles;
CREATE POLICY catalog_roles_select_authenticated ON public.catalog_roles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS catalog_roles_insert_admin ON public.catalog_roles;
CREATE POLICY catalog_roles_insert_admin ON public.catalog_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS catalog_roles_update_admin ON public.catalog_roles;
CREATE POLICY catalog_roles_update_admin ON public.catalog_roles
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS catalog_roles_delete_admin ON public.catalog_roles;
CREATE POLICY catalog_roles_delete_admin ON public.catalog_roles
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS areas_select_authenticated ON public.areas;
CREATE POLICY areas_select_authenticated ON public.areas
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS areas_insert_admin ON public.areas;
CREATE POLICY areas_insert_admin ON public.areas
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS areas_update_admin ON public.areas;
CREATE POLICY areas_update_admin ON public.areas
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS areas_delete_admin ON public.areas;
CREATE POLICY areas_delete_admin ON public.areas
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS statuses_select_authenticated ON public.statuses;
CREATE POLICY statuses_select_authenticated ON public.statuses
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS statuses_insert_admin ON public.statuses;
CREATE POLICY statuses_insert_admin ON public.statuses
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS statuses_update_admin ON public.statuses;
CREATE POLICY statuses_update_admin ON public.statuses
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS statuses_delete_admin ON public.statuses;
CREATE POLICY statuses_delete_admin ON public.statuses
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS priorities_select_authenticated ON public.priorities;
CREATE POLICY priorities_select_authenticated ON public.priorities
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS priorities_insert_admin ON public.priorities;
CREATE POLICY priorities_insert_admin ON public.priorities
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS priorities_update_admin ON public.priorities;
CREATE POLICY priorities_update_admin ON public.priorities
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS priorities_delete_admin ON public.priorities;
CREATE POLICY priorities_delete_admin ON public.priorities
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS dropdown_catalogs_select_authenticated ON public.dropdown_catalogs;
CREATE POLICY dropdown_catalogs_select_authenticated ON public.dropdown_catalogs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS dropdown_catalogs_insert_admin ON public.dropdown_catalogs;
CREATE POLICY dropdown_catalogs_insert_admin ON public.dropdown_catalogs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS dropdown_catalogs_update_admin ON public.dropdown_catalogs;
CREATE POLICY dropdown_catalogs_update_admin ON public.dropdown_catalogs
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS dropdown_catalogs_delete_admin ON public.dropdown_catalogs;
CREATE POLICY dropdown_catalogs_delete_admin ON public.dropdown_catalogs
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS dropdown_options_select_authenticated ON public.dropdown_options;
CREATE POLICY dropdown_options_select_authenticated ON public.dropdown_options
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS dropdown_options_insert_admin ON public.dropdown_options;
CREATE POLICY dropdown_options_insert_admin ON public.dropdown_options
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS dropdown_options_update_admin ON public.dropdown_options;
CREATE POLICY dropdown_options_update_admin ON public.dropdown_options
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS dropdown_options_delete_admin ON public.dropdown_options;
CREATE POLICY dropdown_options_delete_admin ON public.dropdown_options
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS procesos_select_authenticated ON public.procesos;
CREATE POLICY procesos_select_authenticated ON public.procesos
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS procesos_insert_admin ON public.procesos;
CREATE POLICY procesos_insert_admin ON public.procesos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS procesos_update_admin ON public.procesos;
CREATE POLICY procesos_update_admin ON public.procesos
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS procesos_delete_admin ON public.procesos;
CREATE POLICY procesos_delete_admin ON public.procesos
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS clientes_select_authenticated ON public.clientes;
CREATE POLICY clientes_select_authenticated ON public.clientes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS clientes_insert_admin ON public.clientes;
CREATE POLICY clientes_insert_admin ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS clientes_update_admin ON public.clientes;
CREATE POLICY clientes_update_admin ON public.clientes
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS clientes_delete_admin ON public.clientes;
CREATE POLICY clientes_delete_admin ON public.clientes
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpis_select_authenticated ON public.kpis;
CREATE POLICY kpis_select_authenticated ON public.kpis
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS kpis_insert_admin ON public.kpis;
CREATE POLICY kpis_insert_admin ON public.kpis
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpis_update_admin ON public.kpis;
CREATE POLICY kpis_update_admin ON public.kpis
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpis_delete_admin ON public.kpis;
CREATE POLICY kpis_delete_admin ON public.kpis
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS okrs_select_authenticated ON public.okrs;
CREATE POLICY okrs_select_authenticated ON public.okrs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS okrs_insert_admin ON public.okrs;
CREATE POLICY okrs_insert_admin ON public.okrs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS okrs_update_admin ON public.okrs;
CREATE POLICY okrs_update_admin ON public.okrs
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS okrs_delete_admin ON public.okrs;
CREATE POLICY okrs_delete_admin ON public.okrs
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpi_mediciones_select_authenticated ON public.kpi_mediciones;
CREATE POLICY kpi_mediciones_select_authenticated ON public.kpi_mediciones
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS kpi_mediciones_insert_admin ON public.kpi_mediciones;
CREATE POLICY kpi_mediciones_insert_admin ON public.kpi_mediciones
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpi_mediciones_update_admin ON public.kpi_mediciones;
CREATE POLICY kpi_mediciones_update_admin ON public.kpi_mediciones
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpi_mediciones_delete_admin ON public.kpi_mediciones;
CREATE POLICY kpi_mediciones_delete_admin ON public.kpi_mediciones
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpi_metas_select_authenticated ON public.kpi_metas;
CREATE POLICY kpi_metas_select_authenticated ON public.kpi_metas
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS kpi_metas_insert_admin ON public.kpi_metas;
CREATE POLICY kpi_metas_insert_admin ON public.kpi_metas
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpi_metas_update_admin ON public.kpi_metas;
CREATE POLICY kpi_metas_update_admin ON public.kpi_metas
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS kpi_metas_delete_admin ON public.kpi_metas;
CREATE POLICY kpi_metas_delete_admin ON public.kpi_metas
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS area_onepager_config_select_authenticated ON public.area_onepager_config;
CREATE POLICY area_onepager_config_select_authenticated ON public.area_onepager_config
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS area_onepager_config_insert_admin ON public.area_onepager_config;
CREATE POLICY area_onepager_config_insert_admin ON public.area_onepager_config
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS area_onepager_config_update_admin ON public.area_onepager_config;
CREATE POLICY area_onepager_config_update_admin ON public.area_onepager_config
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS area_onepager_config_delete_admin ON public.area_onepager_config;
CREATE POLICY area_onepager_config_delete_admin ON public.area_onepager_config
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

DROP POLICY IF EXISTS area_reportes_diarios_select_authenticated ON public.area_reportes_diarios;
CREATE POLICY area_reportes_diarios_select_authenticated ON public.area_reportes_diarios
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS area_reportes_diarios_insert_admin ON public.area_reportes_diarios;
CREATE POLICY area_reportes_diarios_insert_admin ON public.area_reportes_diarios
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS area_reportes_diarios_update_admin ON public.area_reportes_diarios;
CREATE POLICY area_reportes_diarios_update_admin ON public.area_reportes_diarios
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS area_reportes_diarios_delete_admin ON public.area_reportes_diarios;
CREATE POLICY area_reportes_diarios_delete_admin ON public.area_reportes_diarios
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

-- Datos auxiliares de acciones: visibles para usuarios autenticados, escritura
-- para quien puede administrar la accion relacionada.
ALTER TABLE public.accion_dependencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accion_areas_asignadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accion_flujo_cascada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accion_dependencias_select_authenticated ON public.accion_dependencias;
CREATE POLICY accion_dependencias_select_authenticated ON public.accion_dependencias
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accion_dependencias_insert_manage_accion ON public.accion_dependencias;
CREATE POLICY accion_dependencias_insert_manage_accion ON public.accion_dependencias
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_dependencias_update_manage_accion ON public.accion_dependencias;
CREATE POLICY accion_dependencias_update_manage_accion ON public.accion_dependencias
  FOR UPDATE TO authenticated
  USING (public.can_manage_accion(accion_id))
  WITH CHECK (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_dependencias_delete_manage_accion ON public.accion_dependencias;
CREATE POLICY accion_dependencias_delete_manage_accion ON public.accion_dependencias
  FOR DELETE TO authenticated
  USING (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_areas_asignadas_select_authenticated ON public.accion_areas_asignadas;
CREATE POLICY accion_areas_asignadas_select_authenticated ON public.accion_areas_asignadas
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accion_areas_asignadas_insert_manage_accion ON public.accion_areas_asignadas;
CREATE POLICY accion_areas_asignadas_insert_manage_accion ON public.accion_areas_asignadas
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_areas_asignadas_update_manage_accion ON public.accion_areas_asignadas;
CREATE POLICY accion_areas_asignadas_update_manage_accion ON public.accion_areas_asignadas
  FOR UPDATE TO authenticated
  USING (public.can_manage_accion(accion_id))
  WITH CHECK (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_areas_asignadas_delete_manage_accion ON public.accion_areas_asignadas;
CREATE POLICY accion_areas_asignadas_delete_manage_accion ON public.accion_areas_asignadas
  FOR DELETE TO authenticated
  USING (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_flujo_cascada_select_authenticated ON public.accion_flujo_cascada;
CREATE POLICY accion_flujo_cascada_select_authenticated ON public.accion_flujo_cascada
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accion_flujo_cascada_insert_manage_accion ON public.accion_flujo_cascada;
CREATE POLICY accion_flujo_cascada_insert_manage_accion ON public.accion_flujo_cascada
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_flujo_cascada_update_manage_accion ON public.accion_flujo_cascada;
CREATE POLICY accion_flujo_cascada_update_manage_accion ON public.accion_flujo_cascada
  FOR UPDATE TO authenticated
  USING (public.can_manage_accion(accion_id))
  WITH CHECK (public.can_manage_accion(accion_id));

DROP POLICY IF EXISTS accion_flujo_cascada_delete_manage_accion ON public.accion_flujo_cascada;
CREATE POLICY accion_flujo_cascada_delete_manage_accion ON public.accion_flujo_cascada
  FOR DELETE TO authenticated
  USING (public.can_manage_accion(accion_id));

-- Checklist por reporte: visible para usuarios autenticados, escritura admin.
ALTER TABLE public.checklist_items_completados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_items_completados_select_authenticated ON public.checklist_items_completados;
CREATE POLICY checklist_items_completados_select_authenticated ON public.checklist_items_completados
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS checklist_items_completados_insert_admin ON public.checklist_items_completados;
CREATE POLICY checklist_items_completados_insert_admin ON public.checklist_items_completados
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS checklist_items_completados_update_admin ON public.checklist_items_completados;
CREATE POLICY checklist_items_completados_update_admin ON public.checklist_items_completados
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS checklist_items_completados_delete_admin ON public.checklist_items_completados;
CREATE POLICY checklist_items_completados_delete_admin ON public.checklist_items_completados
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());

-- Distance helpers.
-- distance_cache is internal to the Edge Function/service role; enabling RLS
-- without client policies keeps it out of PostgREST while service role bypasses RLS.
ALTER TABLE public.distance_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.distance_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS distance_places_select_authenticated ON public.distance_places;
CREATE POLICY distance_places_select_authenticated ON public.distance_places
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS distance_places_insert_admin ON public.distance_places;
CREATE POLICY distance_places_insert_admin ON public.distance_places
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS distance_places_update_admin ON public.distance_places;
CREATE POLICY distance_places_update_admin ON public.distance_places
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalogs())
  WITH CHECK (public.can_manage_catalogs());

DROP POLICY IF EXISTS distance_places_delete_admin ON public.distance_places;
CREATE POLICY distance_places_delete_admin ON public.distance_places
  FOR DELETE TO authenticated
  USING (public.can_manage_catalogs());
