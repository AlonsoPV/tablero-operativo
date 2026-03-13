import { supabase } from '@/lib/supabase/client'
import type { Area, CreateAreaInput, UpdateAreaInput, CatalogFilter } from '../types/catalogs.types'

const TABLE = 'areas'

export const areasService = {
  async list(filter: CatalogFilter = {}): Promise<Area[]> {
    let q = supabase.from(TABLE).select('*').order('nombre')
    if (filter.activo !== undefined && filter.activo !== null) q = q.eq('activo', filter.activo)
    const { data, error } = await q
    if (error) throw error
    let list = (data ?? []) as Area[]
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(a => a.nombre.toLowerCase().includes(term) || (a.descripcion?.toLowerCase().includes(term) ?? false))
    }
    return list
  },

  async getById(id: string): Promise<Area | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as Area | null
  },

  async create(input: CreateAreaInput): Promise<Area> {
    const { data, error } = await supabase.from(TABLE).insert({
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() ?? null,
      activo: input.activo ?? true,
    }).select().single()
    if (error) throw error
    return data as Area
  },

  async update(id: string, input: UpdateAreaInput): Promise<Area> {
    const payload: Record<string, unknown> = { ...input }
    if (payload.nombre !== undefined) payload.nombre = (payload.nombre as string).trim()
    if (payload.descripcion !== undefined) payload.descripcion = (payload.descripcion as string)?.trim() ?? null
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as Area
  },

  async setActivo(id: string, activo: boolean): Promise<Area> {
    return this.update(id, { activo })
  },
}
