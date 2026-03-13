import { supabase } from '@/lib/supabase/client'
import type { DropdownOption, CreateDropdownOptionInput, UpdateDropdownOptionInput } from '../types/catalogs.types'

const TABLE = 'dropdown_options'

export const dropdownOptionsService = {
  async listByCatalogId(catalogId: string): Promise<DropdownOption[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('catalog_id', catalogId)
      .order('orden')
      .order('label')
    if (error) throw error
    return (data ?? []) as DropdownOption[]
  },

  async getById(id: string): Promise<DropdownOption | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as DropdownOption | null
  },

  async create(input: CreateDropdownOptionInput): Promise<DropdownOption> {
    const { data, error } = await supabase.from(TABLE).insert({
      catalog_id: input.catalog_id,
      label: input.label.trim(),
      value: input.value.trim(),
      orden: input.orden ?? 0,
      activo: input.activo ?? true,
    }).select().single()
    if (error) throw error
    return data as DropdownOption
  },

  async update(id: string, input: UpdateDropdownOptionInput): Promise<DropdownOption> {
    const payload: Record<string, unknown> = { ...input }
    if (payload.label !== undefined) payload.label = (payload.label as string).trim()
    if (payload.value !== undefined) payload.value = (payload.value as string).trim()
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as DropdownOption
  },

  async setActivo(id: string, activo: boolean): Promise<DropdownOption> {
    return this.update(id, { activo })
  },
}
