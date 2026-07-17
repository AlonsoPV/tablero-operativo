import { supabase } from '@/lib/supabase/client'
import type { AppModule, CatalogRole, CreateRoleInput, UpdateRoleInput, CatalogFilter } from '../types/catalogs.types'

const TABLE = 'catalog_roles'

export const rolesService = {
  async list(filter: CatalogFilter = {}): Promise<CatalogRole[]> {
    let q = supabase.from(TABLE).select('*, catalog_role_modules(module_key)').order('nombre')
    if (filter.activo !== undefined && filter.activo !== null) q = q.eq('activo', filter.activo)
    const { data, error } = await q
    if (error) throw error
    type Row = Omit<CatalogRole, 'module_keys'> & { catalog_role_modules?: Array<{ module_key: string }> }
    let list = ((data ?? []) as Row[]).map(({ catalog_role_modules, ...role }) => ({
      ...role,
      module_keys: (catalog_role_modules ?? []).map((item) => item.module_key),
    }))
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(r => r.nombre.toLowerCase().includes(term) || (r.descripcion?.toLowerCase().includes(term) ?? false))
    }
    return list
  },

  async getById(id: string): Promise<CatalogRole | null> {
    const { data, error } = await supabase.from(TABLE).select('*, catalog_role_modules(module_key)').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return null
    const row = data as unknown as Omit<CatalogRole, 'module_keys'> & { catalog_role_modules?: Array<{ module_key: string }> }
    const { catalog_role_modules, ...role } = row
    return { ...role, module_keys: (catalog_role_modules ?? []).map((item) => item.module_key) }
  },

  async listModules(): Promise<AppModule[]> {
    const { data, error } = await supabase
      .from('app_modules')
      .select('*')
      .eq('activo', true)
      .order('sort_order')
    if (error) throw error
    return (data ?? []) as AppModule[]
  },

  async create(input: CreateRoleInput): Promise<CatalogRole> {
    const { data, error } = await supabase.rpc('catalog_role_save', {
      p_id: null,
      p_nombre: input.nombre.trim(),
      p_descripcion: input.descripcion?.trim() ?? null,
      p_activo: input.activo ?? true,
      p_module_keys: input.module_keys ?? [],
    })
    if (error) throw error
    return data as CatalogRole
  },

  async update(id: string, input: UpdateRoleInput): Promise<CatalogRole> {
    const current = await this.getById(id)
    if (!current) throw new Error('Rol no encontrado')
    const { data, error } = await supabase.rpc('catalog_role_save', {
      p_id: id,
      p_nombre: input.nombre?.trim() ?? current.nombre,
      p_descripcion: input.descripcion === undefined ? current.descripcion : input.descripcion?.trim() ?? null,
      p_activo: input.activo ?? current.activo,
      p_module_keys: input.module_keys ?? null,
    })
    if (error) throw error
    return data as CatalogRole
  },

  async setActivo(id: string, activo: boolean): Promise<CatalogRole> {
    return this.update(id, { activo })
  },
}
