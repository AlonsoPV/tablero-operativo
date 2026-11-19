/**
 * Intención del turno (CV-01). Reglas deterministas primero; si el mensaje no es
 * una consulta operativa reconocible devuelve 'unknown' y el canal usa su LLM.
 */
import { interpretOperationalMessage } from '../operationalInterpret.js'
import type {
  ActionActiveQuery,
  ActionQueryScope,
  ActionQueryStatusGroup,
  ActionQueryVisual,
} from '../../../src/features/ai-support/actionQuery/types.js'

export type AgentIntent =
  | {
      kind: 'query_actions'
      scope: ActionQueryScope
      statusGroup: ActionQueryStatusGroup
      visual: ActionQueryVisual
      focusToday: boolean
      limit?: number
      personHint?: string
      /** El usuario pidió explícitamente datos fuera de su ámbito (otro equipo, privadas). */
      restrictedRequest: boolean
    }
  | { kind: 'query_okrs'; period: 'current_quarter' | 'all_active' }
  | {
      kind: 'aggregate_execution'
      groupBy: 'area' | 'responsable' | 'estado'
      statusGroup: 'open' | 'overdue' | 'blocked'
    }
  | { kind: 'analyze_risk' }
  | { kind: 'who_most_urgent' }
  | { kind: 'unsupported_metric'; domain: 'finance' }
  | { kind: 'write_request'; operation: 'create_action' | 'update_action'; request: string }
  | { kind: 'clarify'; question: string }
  | { kind: 'unknown' }

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const OPERATIONAL_TERMS =
  /\b(accion(es)?|tarea(s)?|pendiente(s)?|vencid[ao]s?|atrasad[ao]s?|retraso|bloquead[ao]s?|bloqueo(s)?|ejecucion|prioridad(es)?|urgente(s)?|asigne|asignad[ao]s?|responsable|kanban|okrs?|objetivo(s)?|kr|key results?|iniciativa(s)?|verificar|verificacion|tengo|cuales|todas?|en rojo)\b/

const FINANCE = /\b(dinero|pesos|dolares|costo(s)?|cuesta|perdiendo|perdida(s)?|ingreso(s)?|ventas?|presupuesto|margen|utilidad(es)?|financier[ao]s?)\b|\$/

const NOT_A_PERSON =
  /^(mi|mis|yo|el|la|los|las|una|un|equipo|tablero|org|hoy|manana|semana|pendiente|pendientes|todas?|todos?|ellas?|ellos?|alguien|nadie|que|cual|cuales|prioridad|retraso)$/

function extractPersonHint(text: string): string | undefined {
  const m =
    text.match(/\b(?:tiene|tienen)\s+([a-z]{3,}(?:\s+[a-z]{3,})?)\s*[?.!]*$/) ||
    text.match(/\ba cargo de\s+([a-z]{3,}(?:\s+[a-z]{3,})?)/) ||
    text.match(/\bacciones de\s+([a-z]{3,}(?:\s+[a-z]{3,})?)/)
  const name = m?.[1]?.trim()
  if (!name || NOT_A_PERSON.test(name.split(' ')[0] ?? '')) return undefined
  return name
}

export function classifyAgentIntent(
  utterance: string,
  previous: ActionActiveQuery | null
): AgentIntent {
  const text = normalize(utterance)
  if (!text) return { kind: 'unknown' }

  if (FINANCE.test(text) && /\b(cuant[oa]s?|monto|calcula|estima|impacto)\b|\$/.test(text)) {
    return { kind: 'unsupported_metric', domain: 'finance' }
  }

  if (/\b(riesgo|en peligro|amenaza|comprometiendo|poniendo en riesgo)\b/.test(text)) {
    return { kind: 'analyze_risk' }
  }

  if (/\bquien\b/.test(text) && /\b(mas urgente|mas critica|mas atrasada|mas vencida|esa|esta|la primera)\b/.test(text)) {
    return { kind: 'who_most_urgent' }
  }

  const interpreted = interpretOperationalMessage(utterance, { activeQuery: previous })

  if (interpreted.intent === 'clarify' && interpreted.ambiguity) {
    return { kind: 'clarify', question: interpreted.ambiguity.question }
  }
  if (interpreted.intent === 'propose_create_kanban') {
    return { kind: 'write_request', operation: 'create_action', request: utterance.slice(0, 500) }
  }
  if (/\b(marca|marcar|actualiza|actualizar|cambia|cambiar|cierra|cerrar|reprograma|mueve)\b/.test(text) &&
    /\b(accion|tarea|esa|esta)\b/.test(text)) {
    return { kind: 'write_request', operation: 'update_action', request: utterance.slice(0, 500) }
  }

  if (!OPERATIONAL_TERMS.test(text)) return { kind: 'unknown' }

  const groupBy = /\bpor (area|areas|departamento)s?\b/.test(text)
    ? 'area'
    : /\bpor (responsable|persona|colaborador)(es|s)?\b/.test(text)
      ? 'responsable'
      : /\bpor estado(s)?\b/.test(text)
        ? 'estado'
        : null
  if (groupBy && /\b(accion(es)?|tareas?|vencid[ao]s?|atrasad[ao]s?|bloquead[ao]s?|bloqueos?|pendientes?|abiertas?|ejecucion)\b/.test(text)) {
    return {
      kind: 'aggregate_execution',
      groupBy,
      statusGroup: /\b(vencid|atrasad|retraso)/.test(text) ? 'overdue' : /\bbloque/.test(text) ? 'blocked' : 'open',
    }
  }

  if (interpreted.intent === 'query' && interpreted.module === 'okrs') {
    return {
      kind: 'query_okrs',
      period: /\b(trimestre|trimestral|q[1-4])\b/.test(text) ? 'current_quarter' : 'all_active',
    }
  }

  const boardActionsCount = interpreted.module === 'org' && /\b(accion(es)?|tareas?)\b/.test(text)
  if (interpreted.intent !== 'query' || (interpreted.module !== 'kanban' && !boardActionsCount)) {
    return { kind: 'unknown' }
  }

  const filters = boardActionsCount ? { scope: 'board_authorized' as const } : interpreted.filters ?? {}
  const restrictedRequest = /\b(otro equipo|otra area|otros equipos|privad[ao]s?|ajen[ao]s?|de los demas)\b/.test(text)
  let scope: ActionQueryScope = filters.scope ?? previous?.scope ?? 'assigned_to_me'
  if (restrictedRequest) scope = 'team_authorized'
  const personHint = restrictedRequest
    ? undefined
    : extractPersonHint(text) ?? (interpreted.identity.kind === 'named' ? interpreted.identity.hint : undefined)
  if (personHint) scope = 'board_authorized'

  return {
    kind: 'query_actions',
    scope,
    statusGroup: filters.status_group ?? 'open',
    visual: filters.visual ?? 'none',
    focusToday: /\bhoy\b/.test(text),
    limit: filters.limit,
    personHint,
    restrictedRequest,
  }
}
