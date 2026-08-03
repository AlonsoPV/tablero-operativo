import { supabase } from '@/lib/supabase/client'
import type { AccionComentario } from '@/types/accionComentario'
import type { AccionCheckpoint } from '@/types'
import type { AccionEvidencia } from '@/services/accionEvidencias.service'
import type { AccionFechaCompromisoCambio } from '@/services/accionFechaCompromisoCambios.service'

const ACTION_ID_CHUNK_SIZE = 100

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

async function loadForActionChunks<T>(
  actionIds: string[],
  loader: (ids: string[]) => Promise<T[]>
): Promise<T[]> {
  const pages = await Promise.all(chunks(actionIds).map(loader))
  return pages.flat()
}

export const kanbanExportService = {
  async loadDetails(actionIds: string[]): Promise<KanbanExportDetails> {
    const uniqueIds = [...new Set(actionIds.filter(Boolean))]
    if (uniqueIds.length === 0) {
      return { comentarios: [], checkpoints: [], evidencias: [], cambiosFecha: [] }
    }

    const [comentarios, checkpoints, evidencias, cambiosFecha] = await Promise.all([
      loadForActionChunks(uniqueIds, async (ids) => {
        const { data, error } = await supabase
          .from('accion_comentarios')
          .select('id,accion_id,contenido,created_by,tipo_comentario,asignado,etiquetas,adjuntos,created_at')
          .in('accion_id', ids)
          .order('created_at', { ascending: true })
        if (error) throw error
        return (data ?? []) as AccionComentario[]
      }),
      loadForActionChunks(uniqueIds, async (ids) => {
        const { data, error } = await supabase
          .from('accion_checkpoints')
          .select('id,accion_id,texto,orden,obligatorio,activo,completado,checked_at,checked_by,responsable_id,created_by,created_at,updated_at')
          .in('accion_id', ids)
          .order('orden', { ascending: true })
        if (error) throw error
        return (data ?? []) as AccionCheckpoint[]
      }),
      loadForActionChunks(uniqueIds, async (ids) => {
        const { data, error } = await supabase
          .from('accion_evidencias')
          .select('id,accion_id,storage_path,file_name,content_type,uploaded_at,uploaded_by')
          .in('accion_id', ids)
          .order('uploaded_at', { ascending: true })
        if (error) throw error
        return (data ?? []) as AccionEvidencia[]
      }),
      loadForActionChunks(uniqueIds, async (ids) => {
        const { data, error } = await supabase
          .from('accion_fecha_compromiso_cambios')
          .select('id,origen,accion_id,accion_titulo,motivo_key,motivo_label,fecha_anterior,fecha_nueva,changed_by,changed_by_nombre,created_at')
          .eq('origen', 'kanban')
          .in('accion_id', ids)
          .order('created_at', { ascending: true })
        if (error) throw error
        return (data ?? []) as AccionFechaCompromisoCambio[]
      }),
    ])

    return { comentarios, checkpoints, evidencias, cambiosFecha }
  },
}
