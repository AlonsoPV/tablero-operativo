import { supabase } from '@/lib/supabase/client'
import type { AccionComentario } from '@/types/accionComentario'
import type { AccionCheckpoint } from '@/types'
import type { AccionEvidencia } from '@/services/accionEvidencias.service'
import type { AccionFechaCompromisoCambio } from '@/services/accionFechaCompromisoCambios.service'

const ACTION_ID_CHUNK_SIZE = 100
const EXPORT_PAGE_SIZE = 500

export interface KanbanExportDetails {
  comentarios: AccionComentario[]
  checkpoints: AccionCheckpoint[]
  evidencias: AccionEvidencia[]
  cambiosFecha: AccionFechaCompromisoCambio[]
}

function chunks<T>(values: T[], size = ACTION_ID_CHUNK_SIZE): T[][] {
  const output: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size))
  }
  return output
}

interface ExportPage<T> {
  data: T[] | null
  error: unknown
  count: number | null
}

export async function loadAllExportRows<T>(
  loader: (from: number, to: number) => Promise<ExportPage<T>>,
  pageSize = EXPORT_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const page = await loader(from, from + pageSize - 1)
    if (page.error) throw page.error

    const pageRows = page.data ?? []
    rows.push(...pageRows)

    if (pageRows.length === 0 || (page.count !== null && rows.length >= page.count)) {
      return rows
    }

    if (page.count === null && pageRows.length < pageSize) {
      return rows
    }

    // Advance by the rows actually returned because the API may enforce a
    // smaller response limit than the requested page size.
    from += pageRows.length
  }
}

async function loadForActionChunks<T>(
  actionIds: string[],
  loader: (ids: string[]) => Promise<T[]>
): Promise<T[]> {
  const rows: T[] = []
  for (const actionIdChunk of chunks(actionIds)) {
    rows.push(...await loader(actionIdChunk))
  }
  return rows
}

export const kanbanExportService = {
  async loadDetails(actionIds: string[]): Promise<KanbanExportDetails> {
    const uniqueIds = [...new Set(actionIds.filter(Boolean))]
    if (uniqueIds.length === 0) {
      return { comentarios: [], checkpoints: [], evidencias: [], cambiosFecha: [] }
    }

    const [comentarios, checkpoints, evidencias, cambiosFecha] = await Promise.all([
      loadForActionChunks(uniqueIds, async (ids) => {
        return loadAllExportRows<AccionComentario>(async (from, to) => {
          const { data, error, count } = await supabase
            .from('accion_comentarios')
            .select('id,accion_id,contenido,created_by,tipo_comentario,asignado,etiquetas,adjuntos,created_at', { count: 'exact' })
            .in('accion_id', ids)
            .order('accion_id', { ascending: true })
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
          return { data: (data ?? []) as AccionComentario[], error, count }
        })
      }),
      loadForActionChunks(uniqueIds, async (ids) => {
        return loadAllExportRows<AccionCheckpoint>(async (from, to) => {
          const { data, error, count } = await supabase
            .from('accion_checkpoints')
            .select('id,accion_id,texto,orden,obligatorio,activo,completado,checked_at,checked_by,responsable_id,created_by,created_at,updated_at', { count: 'exact' })
            .in('accion_id', ids)
            .order('accion_id', { ascending: true })
            .order('orden', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
          return { data: (data ?? []) as AccionCheckpoint[], error, count }
        })
      }),
      loadForActionChunks(uniqueIds, async (ids) => {
        return loadAllExportRows<AccionEvidencia>(async (from, to) => {
          const { data, error, count } = await supabase
            .from('accion_evidencias')
            .select('id,accion_id,storage_path,file_name,content_type,uploaded_at,uploaded_by', { count: 'exact' })
            .in('accion_id', ids)
            .order('accion_id', { ascending: true })
            .order('uploaded_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
          return { data: (data ?? []) as AccionEvidencia[], error, count }
        })
      }),
      loadForActionChunks(uniqueIds, async (ids) => {
        return loadAllExportRows<AccionFechaCompromisoCambio>(async (from, to) => {
          const { data, error, count } = await supabase
            .from('accion_fecha_compromiso_cambios')
            .select('id,origen,accion_id,accion_titulo,motivo_key,motivo_label,fecha_anterior,fecha_nueva,changed_by,changed_by_nombre,created_at', { count: 'exact' })
            .eq('origen', 'kanban')
            .in('accion_id', ids)
            .order('accion_id', { ascending: true })
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
          return { data: (data ?? []) as AccionFechaCompromisoCambio[], error, count }
        })
      }),
    ])

    return { comentarios, checkpoints, evidencias, cambiosFecha }
  },
}
