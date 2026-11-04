import type { AssistantIntent } from './types'

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
 */
export function detectAssistantIntent(
  message: string,
  options: {
    hasSelectedAction?: boolean
    hasSelectedOkr?: boolean
  } = {}
): AssistantIntent {
  const text = normalize(message)
  if (!text) return 'general'

  const asksTeam =
    /(equipo|companeros|colegas|colega|retrasando al equipo|cuello de botella del equipo|tablero completo)/.test(
      text
    ) || /que (esta|estan) retrasando/.test(text)

  const asksOkrs =
    /(okr|okrs|objetivo|objetivos|key result|\bkr\b|iniciativa|iniciativas|estrategia)/.test(text) ||
    /como van mis (okr|objetivos)/.test(text)

  const asksPriority =
    /(prioriz|priorid|urgente|urgencia|atender primero|que (deberia|debo) (hacer|atender|prioriz)|impacto|bloqueo|bloqueada|bloqueadas)/.test(
      text
    )

  const asksPending =
    /(pendiente|pendientes|que tengo|mis acciones|abiertas|por hacer|compromiso|compromisos|vencid|vence|vencer|atrasad|retraso|sin actualiz)/.test(
      text
    ) || /que me falta/.test(text)

  const asksSelectedTask =
    options.hasSelectedAction &&
    (/(esta (tarea|accion)|esta tarjeta|ayudame con|como (cierro|avanzo|desbloqueo)|checklist|evidencia)/.test(
      text
    ) ||
      text.length < 80)

  if (asksSelectedTask) return 'selected_action'
  if (options.hasSelectedOkr && asksOkrs) return 'selected_okr'
  if (asksTeam) return 'team_delay'
  if (asksOkrs) return 'okrs'
  if (asksPriority) return 'prioritize'
  if (asksPending) return 'pending'
  if (options.hasSelectedAction) return 'selected_action'
  if (options.hasSelectedOkr) return 'selected_okr'
  return 'general'
}
