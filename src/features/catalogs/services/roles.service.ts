import { supabase } from '@/lib/supabase/client'
import type { CatalogRole, CreateRoleInput, UpdateRoleInput, CatalogFilter } from '../types/catalogs.types'

const TABLE = 'catalog_roles'

export const rolesService = {
  async list(filter: CatalogFilter = {}): Promise<CatalogRole[]> {
    let q = supabase.from(TABLE).select('*').order('nombre')
    if (filter.activo !== undefined && filter.activo !== null) q = q.eq('activo', filter.activo)
    const { data, error } = await q
    if (error) throw error
    let list = (data ?? []) as CatalogRole[]
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(r => r.nombre.toLowerCase().includes(term) || (r.descripcion?.toLowerCase().includes(term) ?? false))
    }
    return list
  },

  async getById(id: string): Promise<CatalogRole | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as CatalogRole | null
  },

  async create(input: CreateRoleInput): Promise<CatalogRole> {
    const { data, error } = await supabase.from(TABLE).insert({
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() ?? null,
      activo: input.activo ?? true,
    }).select().single()
    if (error) throw error
    return data as CatalogRole
  },

  async update(id: string, input: UpdateRoleInput): Promise<CatalogRole> {
    const payload: Record<string, unknown> = { ...input }
    if (payload.nombre !== undefined) payload.nombre = (payload.nombre as string).trim()
    if (payload.descripcion !== undefined) payload.descripcion = (payload.descripcion as string)?.trim() ?? null
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as CatalogRole
  },

  async setActivo(id: string, activo: boolean): Promise<CatalogRole> {
    return this.update(id, { activo })
  },
}
