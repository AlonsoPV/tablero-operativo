import type { SupabaseClient } from '@supabase/supabase-js'
import { matchPeopleByName, type NamedPerson } from '../../src/features/ai-support/copilot/matching.js'

function escapeIlike(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Busca usuarios activos por nombre (ilike + matchPeopleByName).
 * No usa un limit(80) ciego: filtra en DB para que personas como "Gerardo Puga" no queden fuera.
 */
export async function searchActivePeopleByName(
  supabase: SupabaseClient,
  name: string,
  limit = 40
): Promise<NamedPerson[]> {
  const needle = name.trim()
  if (!needle) return []

  const runIlike = async (pattern: string) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id,nombre,rol,area')
      .eq('activo', true)
      .ilike('nombre', pattern)
      .limit(limit)
    if (error) throw error
    return ((data ?? []) as NamedPerson[]).filter((u) => u?.id)
  }

  const full = await runIlike(`%${escapeIlike(needle)}%`)
  const matched = matchPeopleByName(full, needle)
  if (matched.length > 0) return matched
  if (full.length > 0) return full

  const parts = needle.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return []

  const last = parts[parts.length - 1]!
  const byLast = await runIlike(`%${escapeIlike(last)}%`)
  return matchPeopleByName(byLast, needle)
}
