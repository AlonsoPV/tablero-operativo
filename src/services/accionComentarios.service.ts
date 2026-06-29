/**
 * Comentarios de acciones (tabla accion_comentarios).
 */

import { supabase } from '@/lib/supabase/client'
import type { AccionComentario, ComentarioAdjunto } from '@/types/accionComentario'

const TABLE = 'accion_comentarios'
const COMENTARIO_SELECT = 'id,accion_id,contenido,created_by,asignado,etiquetas,adjuntos,created_at'
const COMENTARIO_VISIBILITY_SELECT = 'accion_id,asignado,etiquetas'
const BUCKET = 'evidencias'

export type AccionComentarioVisibility = Pick<AccionComentario, 'accion_id' | 'asignado' | 'etiquetas'>

export const accionComentariosService = {
  /** Cuenta comentarios por cada accion_id. Útil para badges en cards. */
  async countByAccionIds(accionIds: string[]): Promise<Record<string, number>> {
    if (accionIds.length === 0) return {}
    const { data, error } = await supabase
      .from(TABLE)
      .select('accion_id')
      .in('accion_id', accionIds)
    if (error) throw error
    const counts: Record<string, number> = {}
    for (const id of accionIds) counts[id] = 0
    for (const row of data ?? []) {
      const aid = (row as { accion_id: string }).accion_id
      if (aid in counts) counts[aid]++
    }
    return counts
  },

  async listByAccion(accionId: string): Promise<AccionComentario[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(COMENTARIO_SELECT)
      .eq('accion_id', accionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as AccionComentario[]
  },

  async listByAccionIds(accionIds: string[]): Promise<AccionComentario[]> {
    if (accionIds.length === 0) return []
    const { data, error } = await supabase
      .from(TABLE)
      .select(COMENTARIO_SELECT)
      .in('accion_id', accionIds)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as AccionComentario[]
  },

  async listVisibilityByAccionIds(accionIds: string[]): Promise<AccionComentarioVisibility[]> {
    if (accionIds.length === 0) return []
    const { data, error } = await supabase
      .from(TABLE)
      .select(COMENTARIO_VISIBILITY_SELECT)
      .in('accion_id', accionIds)
    if (error) throw error
    return (data ?? []) as AccionComentarioVisibility[]
  },

  async create(input: {
    accion_id: string
    contenido: string
    created_by?: string | null
    asignado?: string | null
    etiquetas?: string[]
    adjuntos?: { storage_path: string; file_name: string }[]
  }): Promise<AccionComentario> {
    const now = new Date().toISOString()
    const fallback: AccionComentario = {
      id: crypto.randomUUID(),
      accion_id: input.accion_id,
      contenido: input.contenido.trim(),
      created_by: input.created_by ?? null,
      asignado: input.asignado ?? null,
      etiquetas: input.etiquetas ?? [],
      adjuntos: input.adjuntos ?? [],
      created_at: now,
    }
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        ...fallback,
      })
      .select(COMENTARIO_SELECT)
      .maybeSingle()
    if (error) throw error
    return (data ?? fallback) as AccionComentario
  },

  async update(
    id: string,
    patch: { contenido?: string; asignado?: string | null; etiquetas?: string[] }
  ): Promise<AccionComentario> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select(COMENTARIO_SELECT)
      .maybeSingle()
    if (error) throw error
    return data as AccionComentario
  },

  async delete(id: string): Promise<void> {
    const { data: row, error: readError } = await supabase
      .from(TABLE)
      .select('adjuntos')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw readError

    const adjuntos = ((row as { adjuntos?: ComentarioAdjunto[] } | null)?.adjuntos ?? [])
      .map((adjunto) => adjunto.storage_path)
      .filter(Boolean)

    if (adjuntos.length > 0) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove(adjuntos)
      if (storageError) throw storageError
    }

    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
  },
}
