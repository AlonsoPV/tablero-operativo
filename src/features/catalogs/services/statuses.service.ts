import { supabase } from '@/lib/supabase/client'
import type { Status, CreateStatusInput, UpdateStatusInput, CatalogFilter } from '../types/catalogs.types'
import { updateCatalogRow } from './catalogUpdate'
import { inferStatusCatalogKeyFromNombre } from '@/features/operations/utils/statusCatalog'

const TABLE = 'statuses'
const SELECT_FIELDS =
  'id,estado_key,nombre,descripcion,color,orden,es_cierre,activo,created_at,updated_at'

export const statusesService = {
  async list(filter: CatalogFilter = {}): Promise<Status[]> {
    let q = supabase.from(TABLE).select(SELECT_FIELDS).order('orden').order('nombre')
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
    const { data, error } = await supabase.from(TABLE).select(SELECT_FIELDS).eq('id', id).maybeSingle()
    if (error) throw error
    return data as Status | null
  },

  async create(input: CreateStatusInput): Promise<Status> {
    const nombre = input.nombre.trim()
    const estadoKey = inferStatusCatalogKeyFromNombre(nombre)
    const { data, error } = await supabase.from(TABLE).insert({
      nombre,
      descripcion: input.descripcion?.trim() ?? null,
      color: input.color?.trim() ?? null,
      orden: input.orden ?? 0,
      es_cierre: input.es_cierre ?? false,
      activo: input.activo ?? true,
      ...(estadoKey ? { estado_key: estadoKey } : {}),
    }).select(SELECT_FIELDS).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No se pudo crear el estatus. Verifica permisos de Super Admin.')
    return data as Status
  },

  async update(id: string, input: UpdateStatusInput): Promise<Status> {
    const existing = await this.getById(id)
    if (!existing) {
      throw new Error('Estatus no encontrado. Recarga el catálogo e inténtalo de nuevo.')
    }

    const payload: Record<string, unknown> = { ...input }
    if (payload.nombre !== undefined) payload.nombre = (payload.nombre as string).trim()
    if (payload.descripcion !== undefined) payload.descripcion = (payload.descripcion as string)?.trim() ?? null
    if (payload.color !== undefined) payload.color = (payload.color as string)?.trim() ?? null
    delete payload.estado_key

    if (!existing.estado_key?.trim()) {
      const nombre = String(payload.nombre ?? existing.nombre)
      const inferred = inferStatusCatalogKeyFromNombre(nombre)
      if (inferred) payload.estado_key = inferred
    }

    return updateCatalogRow<Status>(TABLE, id, payload, 'Estatus')
  },

  async setActivo(id: string, activo: boolean): Promise<Status> {
    return this.update(id, { activo })
  },
}
