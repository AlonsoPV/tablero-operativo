import { supabase } from '@/lib/supabase/client'
import type { DropdownCatalog, CreateDropdownCatalogInput, UpdateDropdownCatalogInput, CatalogFilter } from '../types/catalogs.types'

const TABLE = 'dropdown_catalogs'

export const dropdownCatalogsService = {
  async list(filter: CatalogFilter = {}): Promise<DropdownCatalog[]> {
    let q = supabase.from(TABLE).select('*').order('nombre')
    if (filter.activo !== undefined && filter.activo !== null) q = q.eq('activo', filter.activo)
    const { data, error } = await q
    if (error) throw error
    let list = (data ?? []) as DropdownCatalog[]
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(c => c.key.toLowerCase().includes(term) || c.nombre.toLowerCase().includes(term) || (c.descripcion?.toLowerCase().includes(term) ?? false))
    }
    return list
  },

  async getById(id: string): Promise<DropdownCatalog | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as DropdownCatalog | null
  },

  async getByKey(key: string): Promise<DropdownCatalog | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('key', key.trim())
      .maybeSingle()
    if (error) throw error
    return data as DropdownCatalog | null
  },

  async create(input: CreateDropdownCatalogInput): Promise<DropdownCatalog> {
    const { data, error } = await supabase.from(TABLE).insert({
      key: input.key.trim(),
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() ?? null,
      activo: input.activo ?? true,
    }).select().single()
    if (error) throw error
    return data as DropdownCatalog
  },

  async update(id: string, input: UpdateDropdownCatalogInput): Promise<DropdownCatalog> {
    const payload: Record<string, unknown> = { ...input }
    if (payload.key !== undefined) payload.key = (payload.key as string).trim()
    if (payload.nombre !== undefined) payload.nombre = (payload.nombre as string).trim()
    if (payload.descripcion !== undefined) payload.descripcion = (payload.descripcion as string)?.trim() ?? null
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as DropdownCatalog
  },

  async setActivo(id: string, activo: boolean): Promise<DropdownCatalog> {
    return this.update(id, { activo })
  },
}
