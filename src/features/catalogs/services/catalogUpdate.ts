import { supabase } from '@/lib/supabase/client'

function isPostgrestNoRowsError(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST116'
}

/** Update + select resilient to RLS-blocked 0-row updates (avoids raw PGRST116). */
export async function updateCatalogRow<T extends { id: string }>(
  table: string,
  id: string,
  payload: Record<string, unknown>,
  resourceLabel: string
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error && !isPostgrestNoRowsError(error)) throw error
  if (data) return data as T

  const { data: existing, error: readError } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (readError) throw readError
  if (!existing) {
    throw new Error(`${resourceLabel} no encontrado. Recarga el catálogo e inténtalo de nuevo.`)
  }

  throw new Error(
    `No se pudo actualizar ${resourceLabel.toLowerCase()}. Tu usuario necesita permiso de Super Admin o administración de catálogos.`
  )
}
