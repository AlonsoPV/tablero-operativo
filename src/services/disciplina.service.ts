/**
 * Servicio de métricas de disciplina (tabla medicion_disciplina).
 * Spec §12: acciones_asignadas, acciones_cerradas_en_tiempo, porcentaje_cumplimiento,
 * acciones_sin_evidencia, reincidencias, dias_consecutivos_en_verde.
 * TODO: Spec §16.8 — la tabla existe pero no hay trigger/función que la llene automáticamente.
 */

import { supabase } from '@/lib/supabase/client'
import type { MedicionDisciplina } from '@/types'

const TABLE = 'medicion_disciplina'

export const disciplinaService = {
  async getByUsuarioAndFecha(usuarioId: string, fecha: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('usuario_id', usuarioId)
      .eq('fecha', fecha)
      .maybeSingle()
    if (error) throw error
    return data as MedicionDisciplina | null
  },

  /** Listar mediciones de un usuario en rango de fechas (para tendencias). */
  async listByUsuario(usuarioId: string, desde: string, hasta: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('usuario_id', usuarioId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (error) throw error
    return (data ?? []) as MedicionDisciplina[]
  },
}
