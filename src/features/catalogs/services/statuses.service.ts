import { supabase } from '@/lib/supabase/client'
import type { Status, CreateStatusInput, UpdateStatusInput, CatalogFilter } from '../types/catalogs.types'

const TABLE = 'statuses'

export const statusesService = {
  async list(filter: CatalogFilter = {}): Promise<Status[]> {
    let q = supabase.from(TABLE).select('*').order('orden').order('nombre')
    if (filter.activo !== undefined && filter.activo !== null) q = q.eq('activo', filter.activo)
    const { data, error } = await q
    if (error) throw error
    let list = (data ?? []) as Status[]
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(s => s.nombre.toLowerCase().includes(term) || (s.descripcion?.toLowerCase().includes(term) ?? false))
    }
    return list
  },

  async getById(id: string): Promise<Status | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as Status | null
  },

  async create(input: CreateStatusInput): Promise<Status> {
    const { data, error } = await supabase.from(TABLE).insert({
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() ?? null,
      color: input.color?.trim() ?? null,
      orden: input.orden ?? 0,
      es_cierre: input.es_cierre ?? false,
      activo: input.activo ?? true,
    }).select().single()
    if (error) throw error
    return data as Status
  },

  async update(id: string, input: UpdateStatusInput): Promise<Status> {
    const payload: Record<string, unknown> = { ...input }
    if (payload.nombre !== undefined) payload.nombre = (payload.nombre as string).trim()
    if (payload.descripcion !== undefined) payload.descripcion = (payload.descripcion as string)?.trim() ?? null
    if (payload.color !== undefined) payload.color = (payload.color as string)?.trim() ?? null
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as Status
  },

  async setActivo(id: string, activo: boolean): Promise<Status> {
    return this.update(id, { activo })
  },
}
