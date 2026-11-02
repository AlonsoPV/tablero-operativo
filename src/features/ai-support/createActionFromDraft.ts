import { accionCheckpointsService } from '@/services/accionCheckpoints.service'
import { accionesService } from '@/services/acciones.service'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import type { AssistantActionDraft } from '@/lib/assistantAudioClient'
import type { AccionDiaria, PrioridadNc } from '@/types'

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function mapPriority(priority: AssistantActionDraft['priority']): PrioridadNc {
  if (priority === 'P1_Alta') return 'P1_Critica'
  if (priority === 'P3_Baja') return 'P3_Baja'
  return 'P2_Media'
}

function buildDescription(draft: AssistantActionDraft) {
  const text = [
    draft.description,
    draft.objective ? `Objetivo: ${draft.objective}` : '',
    draft.leanWaste ? `Desperdicio Lean: ${draft.leanWaste}` : '',
    draft.eosComponent ? `Componente EOS: ${draft.eosComponent}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
  // chk_accion_descripcion_length: >= 10
  if (text.length >= 10) return text.slice(0, 4000)
  const fallback = `${draft.title.trim() || 'Accion del asistente'}. Generada desde Guia/voz.`
  return fallback.slice(0, 4000)
}

function buildEvidence(draft: AssistantActionDraft) {
  const text = draft.evidenceExpected?.trim() || ''
  // chk_accion_evidencia_esperada_length: >= 5
  if (text.length >= 5) return text.slice(0, 2000)
  return 'Evidencia de avance o cierre acordada'
}

export async function createActionFromDraft(
  draft: AssistantActionDraft,
  createdBy: string | null
): Promise<AccionDiaria> {
  if (!createdBy) {
    throw new Error('No hay usuario activo para asignar la accion.')
  }

  const tomorrow = addDaysYmd(todayWallClockCDMX(), 1)
  const title = draft.title.trim().slice(0, 70) || 'Accion del asistente'

  // En este tablero `responsable` es NOT NULL (no hay taskpool nulo como en What2Do).
  const created = await accionesService.create({
    titulo_accion: title,
    descripcion_accion: buildDescription(draft),
    evidencia_esperada: buildEvidence(draft),
    fecha: tomorrow,
    hora_limite: '17:00',
    estado: 'Pendiente',
    responsable: createdBy,
    prioridad: mapPriority(draft.priority),
    created_by: createdBy,
    tipo_accion: 'operativa',
  })

  const checkpointTexts = [
    title,
    ...draft.activities.map((activity) => activity.trim()).filter((activity) => activity.length >= 3),
  ]

  if (checkpointTexts.length > 0) {
    await accionCheckpointsService.insertMany(
      created.id,
      checkpointTexts.map((texto, orden) => ({
        texto: texto.slice(0, 280),
        orden,
        obligatorio: orden === 0,
      })),
      createdBy
    )
  }

  return created
}
