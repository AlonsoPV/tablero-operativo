/**
 * Servicio de orígenes para el módulo de distancias (catálogo distance_origins).
 */

import { supabase } from '@/lib/supabase/client'
import type { DistanceOrigin } from '../types/distance.types'

const TABLE = 'distance_origins'

export interface DistanceOriginFilter {
  activo?: boolean | null
  search?: string
}

export const originsService = {
  async list(activoOnlyOrFilter: boolean | DistanceOriginFilter = true): Promise<DistanceOrigin[]> {
    const filter =
      typeof activoOnlyOrFilter === 'boolean'
        ? { activo: activoOnlyOrFilter }
        : activoOnlyOrFilter
    let q = supabase.from(TABLE).select('*').order('nombre')
    if (filter.activo !== undefined && filter.activo !== null) {
      q = q.eq('activo', filter.activo)
    }
    const { data, error } = await q
    if (error) throw error
    let list = (data ?? []) as DistanceOrigin[]
    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(
        (o) =>
          o.nombre.toLowerCase().includes(term) ||
          (o.ubicacion?.toLowerCase().includes(term) ?? false)
      )
    }
    return list
  },

  async getById(id: string): Promise<DistanceOrigin | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as DistanceOrigin | null
  },

  async create(input: { nombre: string; ubicacion: string; latitud?: number | null; longitud?: number | null; activo?: boolean }): Promise<DistanceOrigin> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        nombre: input.nombre.trim(),
        ubicacion: input.ubicacion.trim(),
        latitud: input.latitud ?? null,
        longitud: input.longitud ?? null,
        activo: input.activo ?? true,
      })
      .select()
      .single()
    if (error) throw error
    return data as DistanceOrigin
  },

  async update(
    id: string,
    input: { nombre?: string; ubicacion?: string; latitud?: number | null; longitud?: number | null; activo?: boolean }
  ): Promise<DistanceOrigin> {
    const payload: Record<string, unknown> = {}
    if (input.nombre !== undefined) payload.nombre = input.nombre.trim()
    if (input.ubicacion !== undefined) payload.ubicacion = input.ubicacion.trim()
    if (input.latitud !== undefined) payload.latitud = input.latitud
    if (input.longitud !== undefined) payload.longitud = input.longitud
    if (input.activo !== undefined) payload.activo = input.activo
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as DistanceOrigin
  },

  async setActivo(id: string, activo: boolean): Promise<DistanceOrigin> {
    return this.update(id, { activo })
  },
}
