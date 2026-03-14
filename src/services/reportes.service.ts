/**
 * Servicio de reportes históricos (spec §5.8).
 * Filtrado por responsable, rango de fechas; datos para tendencias y exportación.
 */

import { supabase } from '@/lib/supabase/client'
import type { AccionDiaria } from '@/types'

export const reportesService = {
  /** Acciones en rango de fechas (campo fecha), opcionalmente por responsable. */
  async getAccionesRango(
    desde: string,
    hasta: string,
    responsableId?: string | null
  ): Promise<AccionDiaria[]> {
    let q = supabase
      .from('acciones_diarias')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('hora_limite', { ascending: true })
    if (responsableId) q = q.eq('responsable', responsableId)
    const { data, error } = await q.limit(2000)
    if (error) throw error
    return (data ?? []) as AccionDiaria[]
  },
}
