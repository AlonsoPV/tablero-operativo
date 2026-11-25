import { classifyConsultation } from '../consultation/classifyConsultation'
import type { AssistantIntent } from './types'
import { findTermsInText } from '../operationalSemantics/operationalDictionary'

function normalize(text: string) {
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

/**
 * Clasifica la consulta para cargar solo el contexto necesario.
 * El foco explicito (accion/OKR seleccionado) tiene prioridad cuando la pregunta apunta a el.
 * Aliases de negocio alineados al diccionario semántico SSOT.
 */
export function detectAssistantIntent(
  message: string,
  options: {
    hasSelectedAction?: boolean
    hasSelectedOkr?: boolean
    priorUserMessages?: string[]
  } = {}
): AssistantIntent {
  const text = normalize(message)
  if (!text) return 'general'

  if (classifyConsultation(message, { priorUserMessages: options.priorUserMessages }).kind === 'concept') {
    return 'concept'
  }

  const termIds = new Set(findTermsInText(text).map((t) => t.id))

  const asksTeam =
    termIds.has('role_team') ||
    /(equipo|companeros|colegas|colega|retrasando al equipo|cuello de botella del equipo|tablero completo)/.test(
      text
    ) ||
    /que (esta|estan) retrasando/.test(text)

  const asksOkrs =
    termIds.has('okr_objective') ||
    termIds.has('okr_key_result') ||
    termIds.has('okr_initiative') ||
    /(okr|okrs|objetivo|objetivos|key result|\bkr\b|iniciativa|iniciativas|estrategia)/.test(text) ||
    /como van mis (okr|objetivos)/.test(text)

  const asksPriority =
    termIds.has('visual_priority_red') ||
    /(prioriz|priorid|urgente|urgencia|atender primero|que (deberia|debo) (hacer|atender|prioriz)|impacto|bloqueo|bloqueada|bloqueadas)/.test(
      text
    )

  const asksPending =
    termIds.has('kanban_action') ||
    termIds.has('role_responsable') ||
    termIds.has('visual_board_red') ||
    termIds.has('visual_overdue') ||
    /(pendiente|pendientes|que tengo|mis acciones|abiertas|por hacer|compromiso|compromisos|vencid|vence|vencer|atrasad|retraso|sin actualiz|\ben rojo\b)/.test(
      text
    ) ||
    /que me falta/.test(text)

  const asksSelectedTask =
    options.hasSelectedAction &&
    (/(esta (tarea|accion)|esta tarjeta|ayudame con|como (cierro|avanzo|desbloqueo)|checklist|evidencia)/.test(
      text
    ) ||
      text.length < 80)

  if (asksSelectedTask) return 'selected_action'
  if (options.hasSelectedOkr && asksOkrs) return 'selected_okr'
  // «OKRs de equipo / objetivos team» es consulta OKR, no retrasos del tablero.
  if (asksOkrs) return 'okrs'
  if (asksTeam) return 'team_delay'
  if (asksPriority) return 'prioritize'
  if (asksPending) return 'pending'
  if (options.hasSelectedAction) return 'selected_action'
  if (options.hasSelectedOkr) return 'selected_okr'
  return 'general'
}
