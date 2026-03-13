/**
 * Servicio de KPIs (tablas kpis, kpi_mediciones, kpi_metas).
 * Spec §12: KPIs sagrados, semáforo (umbrales), mediciones.
 */

import { supabase } from '@/lib/supabase/client'
import type { Kpi, KpiMeta } from '@/types'
import type { KpiSemaforo } from '@/types'

const TABLE_KPIS = 'kpis'
const TABLE_METAS = 'kpi_metas'
const TABLE_MEDICIONES = 'kpi_mediciones'

export const kpisService = {
  async list() {
    const { data, error } = await supabase
      .from(TABLE_KPIS)
      .select('*')
      .order('nombre_kpi')
    if (error) throw error
    return (data ?? []) as Kpi[]
  },

  async getMetas(kpiId: string) {
    const { data, error } = await supabase
      .from(TABLE_METAS)
      .select('*')
      .eq('kpi_id', kpiId)
    if (error) throw error
    return (data ?? []) as KpiMeta[]
  },

  /** Todas las metas (para semáforo: combinar con kpis y mediciones por fecha). */
  async getMetasAll() {
    const { data, error } = await supabase
      .from(TABLE_METAS)
      .select('*')
      .order('kpi_id')
    if (error) throw error
    return (data ?? []) as KpiMeta[]
  },

  /** Mediciones por fecha para semáforo. TODO: función check_kpi_compliance en backend. */
  async getMedicionesByFecha(fecha: string) {
    const { data, error } = await supabase
      .from(TABLE_MEDICIONES)
      .select('*')
      .eq('fecha', fecha)
    if (error) throw error
    return data ?? []
  },
}

/** Helper: dado valor de cumplimiento y metas, devolver color semáforo (spec §9). */
export function semaforoFromValor(
  valor: number,
  umbralAlerta: number,
  umbralCritico: number
): KpiSemaforo {
  if (valor >= umbralAlerta) return 'verde'
  if (valor >= umbralCritico) return 'amarillo'
  return 'rojo'
}
