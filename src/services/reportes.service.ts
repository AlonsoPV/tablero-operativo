/**
 * Servicio de reportes históricos (spec §5.8).
 * Filtrado por líder/responsable, tendencias de cumplimiento, exportación PDF/Excel.
 * Por ahora solo prepara datos para consultas; exportación se implementará en feature reports.
 */

import { supabase } from '@/lib/supabase/client'

// TODO: definir vistas o funciones en Supabase para reportes agregados
// (por responsable, por fecha, tendencia cumplimiento). Spec no detalla esquema exacto.

export const reportesService = {
  /** Placeholder: obtener datos base para reportes (acciones en rango). */
  async getAccionesRango(desde: string, hasta: string, responsableId?: string) {
    let q = supabase
      .from('acciones_diarias')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (responsableId) q = q.eq('responsable', responsableId)
    const { data, error } = await q.limit(1000)
    if (error) throw error
    return data ?? []
  },
}
