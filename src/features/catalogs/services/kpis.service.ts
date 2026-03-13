import { supabase } from '@/lib/supabase/client'
import type { CatalogKpi, CreateKpiInput, UpdateKpiInput, CatalogFilter } from '../types/catalogs.types'

const TABLE = 'catalog_kpis'

export const catalogKpisService = {
  async list(filter: CatalogFilter = {}): Promise<CatalogKpi[]> {
    let q = supabase.from(TABLE).select('*').order('orden').order('nombre')
    if (filter.activo !== undefined && filter.activo !== null) q = q.eq('activo', filter.activo)
    const { data, error } = await q
    if (error) throw error
    let list = (data ?? []) as CatalogKpi[]
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(k => k.nombre.toLowerCase().includes(term) || (k.descripcion?.toLowerCase().includes(term) ?? false))
    }
    return list
  },

  async getById(id: string): Promise<CatalogKpi | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as CatalogKpi | null
  },

  async create(input: CreateKpiInput): Promise<CatalogKpi> {
    const { data, error } = await supabase.from(TABLE).insert({
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() ?? null,
      unidad: input.unidad ?? 'porcentaje',
      tipo: input.tipo ?? 'manual',
      meta_objetivo: input.meta_objetivo ?? null,
      periodicidad: input.periodicidad ?? 'mensual',
      orden: input.orden ?? 0,
      activo: input.activo ?? true,
    }).select().single()
    if (error) throw error
    return data as CatalogKpi
  },

  async update(id: string, input: UpdateKpiInput): Promise<CatalogKpi> {
    const payload: Record<string, unknown> = { ...input }
    if (payload.nombre !== undefined) payload.nombre = (payload.nombre as string).trim()
    if (payload.descripcion !== undefined) payload.descripcion = (payload.descripcion as string)?.trim() ?? null
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as CatalogKpi
  },

  async setActivo(id: string, activo: boolean): Promise<CatalogKpi> {
    return this.update(id, { activo })
  },
}
