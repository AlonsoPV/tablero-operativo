/**
 * Servicio de acciones diarias (tabla acciones_diarias).
 * Spec §7: CRUD por dueño/admin; filtros por fecha, estado, responsable.
 */

import { supabase } from '@/lib/supabase/client'
import type { AccionDiaria, ActionStatus, PrioridadNc } from '@/types'

const TABLE = 'acciones_diarias'

export interface AccionesFilter {
  fecha?: string // YYYY-MM-DD
  estado?: ActionStatus | ActionStatus[]
  prioridad?: PrioridadNc | PrioridadNc[]
  area?: string
  responsable?: string
  /** Búsqueda en descripcion_accion y evidencia_esperada */
  search?: string
}

export const accionesService = {
  async listByDate(fecha: string): Promise<AccionDiaria[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('fecha', fecha)
      .order('hora_limite', { ascending: true })
    if (error) throw error
    return (data ?? []) as AccionDiaria[]
  },

  async list(filter: AccionesFilter = {}) {
    let q = supabase.from(TABLE).select('*')
    if (filter.fecha) q = q.eq('fecha', filter.fecha)
    if (filter.estado) {
      const statuses = Array.isArray(filter.estado)
        ? filter.estado
        : [filter.estado]
      q = q.in('estado', statuses)
    }
    if (filter.prioridad) {
      const prioridades = Array.isArray(filter.prioridad)
        ? filter.prioridad
        : [filter.prioridad]
      q = q.in('prioridad', prioridades)
    }
    if (filter.area != null && filter.area !== '') q = q.eq('area', filter.area)
    if (filter.responsable) q = q.eq('responsable', filter.responsable)
    q = q.order('hora_limite', { ascending: true })
    const { data, error } = await q
    if (error) throw error
    let list = (data ?? []) as AccionDiaria[]
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(
        (a) =>
          a.descripcion_accion.toLowerCase().includes(term) ||
          (a.evidencia_esperada?.toLowerCase().includes(term) ?? false)
      )
    }
    return list
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as AccionDiaria
  },

  async create(payload: Partial<AccionDiaria>) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data as AccionDiaria
  },

  async update(id: string, payload: Partial<AccionDiaria>) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as AccionDiaria
  },

  async updateEstado(id: string, estado: ActionStatus, extra?: Partial<AccionDiaria>) {
    return this.update(id, { estado, ...extra })
  },

  async delete(id: string) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
  },
}
