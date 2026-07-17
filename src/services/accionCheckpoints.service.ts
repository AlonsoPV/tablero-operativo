/**
 * CRUD de checkpoints (puntos a validar) por acción.
 * Tabla: accion_checkpoints.
 */

import { supabase } from '@/lib/supabase/client'
import type { AccionCheckpoint } from '@/types'

const TABLE = 'accion_checkpoints'
const CHECKPOINT_SELECT =
  'id,accion_id,texto,orden,obligatorio,activo,completado,checked_at,checked_by,responsable_id,created_by,created_at,updated_at'

export type AccionCheckpointInsert = {
  accion_id: string
  texto: string
  orden: number
  obligatorio?: boolean
  responsable_id?: string | null
  created_by?: string | null
}

function normalizeCheckpointError(error: unknown): Error {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === '42501'
  ) {
    return new Error(
      'No tienes permiso para modificar este checklist. La persona asignada puede marcar checks y agregar puntos; la estructura la editan quien administra la accion, Direccion o super_admin.'
    )
  }
  return error instanceof Error ? error : new Error('No se pudo guardar el checklist.')
}

function isMissingRpcError(error: unknown, functionName: string): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  const message = e.message?.toLowerCase() ?? ''
  return e.code === 'PGRST202' || message.includes(`could not find the function public.${functionName}`)
}

export const accionCheckpointsService = {
  async listByAccionId(accionId: string): Promise<AccionCheckpoint[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(CHECKPOINT_SELECT)
      .eq('accion_id', accionId)
      .eq('activo', true)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as AccionCheckpoint[]
  },

  /**
   * true si la acción no puede pasar a Hecho (checkpoints activos sin completar).
   * @param onlyObligatorio — fase 2: si true, solo filas con obligatorio=true cuentan como bloqueo.
   */
  async hasPendingBlockingHecho(
    accionId: string,
    opts?: { onlyObligatorio?: boolean }
  ): Promise<boolean> {
    let q = supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('accion_id', accionId)
      .eq('activo', true)
      .eq('completado', false)
    if (opts?.onlyObligatorio) {
      q = q.eq('obligatorio', true)
    }
    const { count, error } = await q
    if (error) throw error
    return (count ?? 0) > 0
  },

  /** Mapa accion_id → true si tiene pendientes que bloquean Hecho. */
  async pendingBlockingHechoByAccionIds(
    accionIds: string[],
    opts?: { onlyObligatorio?: boolean }
  ): Promise<Record<string, boolean>> {
    const map: Record<string, boolean> = {}
    if (accionIds.length === 0) return map
    for (const id of accionIds) map[id] = false

    let q = supabase
      .from(TABLE)
      .select('accion_id')
      .in('accion_id', accionIds)
      .eq('activo', true)
      .eq('completado', false)
    if (opts?.onlyObligatorio) {
      q = q.eq('obligatorio', true)
    }
    const { data, error } = await q
    if (error) throw error
    for (const row of data ?? []) {
      const aid = (row as { accion_id: string }).accion_id
      map[aid] = true
    }
    return map
  },

  /** Conteo de checkpoints activos por acción (para UI de progreso). */
  async progressByAccionIds(
    accionIds: string[]
  ): Promise<Record<string, { total: number; completed: number }>> {
    const out: Record<string, { total: number; completed: number }> = {}
    if (accionIds.length === 0) return out
    for (const id of accionIds) {
      out[id] = { total: 0, completed: 0 }
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select('accion_id, completado')
      .in('accion_id', accionIds)
      .eq('activo', true)
    if (error) throw error
    for (const row of data ?? []) {
      const r = row as { accion_id: string; completado: boolean }
      const slot = out[r.accion_id]
      if (!slot) continue
      slot.total += 1
      if (r.completado) slot.completed += 1
    }
    return out
  },

  async insert(row: AccionCheckpointInsert): Promise<void> {
    void row.created_by
    const { error } = await supabase.rpc('add_accion_checkpoint', {
      p_accion_id: row.accion_id,
      p_texto: row.texto.trim(),
      p_orden: row.orden,
      p_obligatorio: row.obligatorio ?? true,
      p_responsable_id: row.responsable_id ?? null,
    })
    if (error) throw normalizeCheckpointError(error)
  },

  async insertMany(
    accionId: string,
    rows: Omit<AccionCheckpointInsert, 'accion_id'>[],
    createdByUsuarioId?: string | null
  ): Promise<void> {
    if (rows.length === 0) return
    const payload = rows.map((r, i) => ({
      accion_id: accionId,
      texto: r.texto.trim(),
      orden: r.orden ?? i,
      obligatorio: r.obligatorio ?? true,
      responsable_id: r.responsable_id ?? null,
      created_by: r.created_by ?? createdByUsuarioId ?? null,
      activo: true,
      completado: false,
    }))
    const { error } = await supabase.from(TABLE).insert(payload)
    if (error) throw normalizeCheckpointError(error)
  },

  async getById(id: string): Promise<AccionCheckpoint> {
    const { data, error } = await supabase.from(TABLE).select(CHECKPOINT_SELECT).eq('id', id).single()
    if (error) throw error
    return data as AccionCheckpoint
  },

  async update(
    id: string,
    patch: Partial<Pick<AccionCheckpoint, 'texto' | 'orden' | 'obligatorio' | 'responsable_id'>>
  ): Promise<void> {
    const body: Record<string, unknown> = {}
    if (patch.texto !== undefined) body.texto = String(patch.texto).trim()
    if (patch.orden !== undefined) body.orden = patch.orden
    if (patch.obligatorio !== undefined) body.obligatorio = patch.obligatorio
    if (patch.responsable_id !== undefined) body.responsable_id = patch.responsable_id
    if (Object.keys(body).length === 0) return
    const { error } = await supabase.from(TABLE).update(body).eq('id', id)
    if (error) throw normalizeCheckpointError(error)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_accion_checkpoint', {
      p_checkpoint_id: id,
    })
    if (!error) return

    if (!isMissingRpcError(error, 'delete_accion_checkpoint')) {
      throw normalizeCheckpointError(error)
    }

    const { error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('activo', true)
      .eq('completado', false)
    if (deleteError) {
      throw new Error(
        'Falta aplicar la migracion delete_accion_checkpoint en Supabase o no tienes permiso para eliminar este check.'
      )
    }
  },

  async setCompletado(
    id: string,
    completado: boolean,
    checkedByUsuarioId: string | null
  ): Promise<void> {
    void checkedByUsuarioId
    const { error } = await supabase.rpc('set_accion_checkpoint_completado', {
      p_checkpoint_id: id,
      p_completado: completado,
    })
    if (error) throw normalizeCheckpointError(error)
  },
}
