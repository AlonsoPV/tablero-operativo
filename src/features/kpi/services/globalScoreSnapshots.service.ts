import { supabase } from '@/lib/supabase/client'
import type { GlobalScoreSnapshot } from '../types/kpi.types'

const TABLE = 'global_score_snapshots'

export type GlobalScoreSnapshotsOpts = {
  limit?: number
}

export type InsertGlobalScoreSnapshotInput = {
  score: number
  metadata?: Record<string, unknown> | null
}

/**
 * Snapshots del score global O2C (más reciente primero).
 */
export async function listGlobalScoreSnapshots(opts: GlobalScoreSnapshotsOpts = {}): Promise<GlobalScoreSnapshot[]> {
  const limit = opts.limit ?? 100
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as GlobalScoreSnapshot[]
}

/**
 * Inserta un snapshot del score global (0–1) vía tabla. Requiere `is_app_admin()` en RLS.
 * Preferir `recordGlobalScoreSnapshot` desde la app tras mediciones.
 */
export async function insertGlobalScoreSnapshot(
  input: InsertGlobalScoreSnapshotInput
): Promise<GlobalScoreSnapshot> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      score: input.score,
      metadata: input.metadata ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as GlobalScoreSnapshot
}

/**
 * Persiste un snapshot usando `record_global_score_snapshot` (SECURITY DEFINER).
 * Dedupe: mismo día UTC y mismo score no inserta fila duplicada.
 */
export async function recordGlobalScoreSnapshot(
  input: InsertGlobalScoreSnapshotInput
): Promise<string> {
  const { data, error } = await supabase.rpc('record_global_score_snapshot', {
    p_score: input.score,
    p_metadata: input.metadata ?? null,
  })
  if (error) throw error
  if (data == null) throw new Error('record_global_score_snapshot: sin id')
  return data as string
}
