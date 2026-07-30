import { supabase } from '@/lib/supabase/client'
import type { ComentarioAdjunto } from '@/types/accionComentario'

const TABLE = 'equipo_accion_comentarios'
const SELECT_FIELDS =
  'id,accion_id,contenido,created_by,created_by_nombre,asignado,etiquetas,adjuntos,created_at'
const BUCKET = 'evidencias'

export type TeamActionComentario = {
  id: string
  accion_id: string
  contenido: string
  created_by: string | null
  created_by_nombre: string | null
  asignado: string | null
  etiquetas: string[]
  adjuntos: ComentarioAdjunto[]
  created_at: string
}

function normalizeAdjuntos(value: unknown): ComentarioAdjunto[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const storage_path = typeof row.storage_path === 'string' ? row.storage_path : ''
      const file_name = typeof row.file_name === 'string' ? row.file_name : ''
      if (!storage_path || !file_name) return null
      return { storage_path, file_name }
    })
    .filter((item): item is ComentarioAdjunto => item !== null)
}

function normalizeComment(row: Record<string, unknown>): TeamActionComentario {
  return {
    id: String(row.id),
    accion_id: String(row.accion_id),
    contenido: String(row.contenido ?? ''),
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    created_by_nombre:
      typeof row.created_by_nombre === 'string' ? row.created_by_nombre : null,
    asignado: typeof row.asignado === 'string' ? row.asignado : null,
    etiquetas: Array.isArray(row.etiquetas)
      ? row.etiquetas.filter((tag): tag is string => typeof tag === 'string')
      : [],
    adjuntos: normalizeAdjuntos(row.adjuntos),
    created_at: String(row.created_at ?? new Date().toISOString()),
  }
}

export const teamActionComentariosService = {
  async countByActionIds(actionIds: string[]): Promise<Record<string, number>> {
    const ids = [...new Set(actionIds)].filter(Boolean)
    if (ids.length === 0) return {}

    const { data, error } = await supabase.from(TABLE).select('accion_id').in('accion_id', ids)

    if (error) throw error

    const counts: Record<string, number> = {}
    for (const id of ids) counts[id] = 0
    for (const row of data ?? []) {
      const actionId = (row as { accion_id: string }).accion_id
      if (actionId in counts) counts[actionId] += 1
    }
    return counts
  },

  async listByAction(actionId: string): Promise<TeamActionComentario[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT_FIELDS)
      .eq('accion_id', actionId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []).map((row) => normalizeComment(row as Record<string, unknown>))
  },

  async create(input: {
    accion_id: string
    contenido: string
    created_by?: string | null
    created_by_nombre?: string | null
    asignado?: string | null
    etiquetas?: string[]
    adjuntos?: ComentarioAdjunto[]
  }): Promise<TeamActionComentario> {
    const content = input.contenido.trim()
    if (!content) throw new Error('Escribe un comentario.')

    let createdBy = input.created_by ?? null
    let createdByNombre = input.created_by_nombre?.trim().slice(0, 160) || null

    if (!createdBy) {
      const { data: authData } = await supabase.auth.getUser()
      const authUserId = authData.user?.id
      if (authUserId) {
        const { data: profile } = await supabase
          .from('usuarios')
          .select('id,nombre')
          .eq('user_id', authUserId)
          .maybeSingle()

        createdBy = profile?.id ?? null
        createdByNombre = createdByNombre ?? profile?.nombre?.trim().slice(0, 160) ?? null
      }
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        accion_id: input.accion_id,
        contenido: content,
        created_by: createdBy,
        created_by_nombre: createdByNombre,
        asignado: input.asignado ?? null,
        etiquetas: input.etiquetas ?? [],
        adjuntos: input.adjuntos ?? [],
      })
      .select(SELECT_FIELDS)
      .single()

    if (error) throw error
    return normalizeComment(data as Record<string, unknown>)
  },

  async update(
    id: string,
    patch: { contenido?: string; asignado?: string | null; etiquetas?: string[] }
  ): Promise<TeamActionComentario> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select(SELECT_FIELDS)
      .single()

    if (error) throw error
    return normalizeComment(data as Record<string, unknown>)
  },

  async delete(id: string): Promise<void> {
    const { data: row, error: readError } = await supabase
      .from(TABLE)
      .select('adjuntos')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw readError

    const adjuntos = normalizeAdjuntos((row as { adjuntos?: unknown } | null)?.adjuntos)
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
