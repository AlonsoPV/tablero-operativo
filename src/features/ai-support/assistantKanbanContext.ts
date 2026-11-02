import type { AccionDiaria } from '@/types'
import type { BoardAssistantContextPayload } from '@/features/ai-support/buildBoardAssistantContext'

const HEADER = 'Contexto del tablero Kanban actual.'

/** Serializa acciones abiertas + resumen de tablero para el prompt de voz. */
export function serializeAssistantKanbanContext(
  actions: AccionDiaria[],
  board?: BoardAssistantContextPayload | null
): string {
  const lines: string[] = [HEADER]

  if (board) {
    lines.push(
      `Hoy: ${board.today}. Abiertas: ${board.actions.totalOpen}. Retraso: ${board.actions.delayed}. Bloqueadas: ${board.actions.blocked}. Rojas: ${board.actions.red}.`
    )
  }

  const openWithOwner = actions.filter((action) => action.estado !== 'Hecho' && action.estado !== 'Verificado')
  if (openWithOwner.length === 0) {
    lines.push('No hay acciones abiertas en el alcance del usuario.')
    return lines.join('\n')
  }

  lines.push(`Acciones activas (${Math.min(openWithOwner.length, 20)}):`)
  for (const action of openWithOwner.slice(0, 20)) {
    const title = action.titulo_accion || action.descripcion_accion || 'Sin titulo'
    lines.push(
      `- ${title} | estado=${action.estado} | prioridad=${action.prioridad} | fecha=${action.fecha} ${action.hora_limite} | responsable=${action.responsable ? 'asignado' : 'taskpool'}`
    )
  }

  return lines.join('\n')
}
