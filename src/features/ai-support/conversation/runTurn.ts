import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import type { OperationalSnapshot } from '@/features/ai-support/operationalContext/types'
import {
  DEFAULT_RESPONSE_FORMAT,
  parseFormatDirective,
  type ResponseFormat,
} from '@/features/ai-support/responseFormat'
import { applyConversationTurn } from './applyTurn'
import { executeConversationQuery } from './executeQuery'
import { renderConversationReply } from './renderReply'
import { initialConversationState, type ConversationQueryState, type ConversationReply } from './types'

export type RunConversationTurnResult =
  | { handled: true; reply: ConversationReply }
  | { handled: false; state: ConversationQueryState; reason: string }

/**
 * Un turno completo del copiloto Kanban (interpretar → ejecutar → renderizar).
 */
export function runConversationTurn(input: {
  message: string
  previous: ConversationQueryState | null
  snapshot: OperationalSnapshot
  people: NamedPerson[]
  /** Formato elegido en la UI. Si no es Automático, se delega al orquestador para no duplicar la consulta. */
  responseFormat?: ResponseFormat
  /**
   * Cuando el orquestador R1 está activo, las consultas Kanban/OKR y las referencias
   * se delegan al servidor (incluido Auto) para no mantener dos motores de contexto.
   */
  orchestratorEnabled?: boolean
}): RunConversationTurnResult {
  const selected = input.responseFormat ?? DEFAULT_RESPONSE_FORMAT
  const directive = parseFormatDirective(input.message)
  if (directive || selected !== DEFAULT_RESPONSE_FORMAT) {
    const prev = input.previous ?? initialConversationState()
    return {
      handled: false,
      state: { ...prev, entity: 'none', intent: 'handoff', pendingClarification: null },
      reason: directive ? 'format_directive' : 'format_selected',
    }
  }

  if (input.orchestratorEnabled) {
    const prev = input.previous ?? initialConversationState()
    return {
      handled: false,
      state: { ...prev, entity: 'none', intent: 'handoff', pendingClarification: null },
      reason: 'orchestrator',
    }
  }

  const prevScope = input.previous?.scope ?? null
  const applied = applyConversationTurn({
    message: input.message,
    previous: input.previous,
    people: input.people,
    canSeeTeam: input.snapshot.viewer.canSeeTeam,
  })

  if (applied.kind === 'handoff') {
    return { handled: false, state: applied.state, reason: applied.reason }
  }

  if (applied.kind === 'clarify') {
    const emptyExec = {
      items: [],
      total: 0,
      truncated: false,
      scopeLabel: applied.state.person
        ? `Acciones de ${applied.state.person.nombre}`
        : 'Aclaracion',
      asOf: input.snapshot.fetchedAt,
      sources: ['kanban_acciones', 'operational_snapshot'],
      limitations: ['Aclaracion pendiente; sin ejecucion de consulta.'],
    }
    // Sin candidatos = persona no encontrada
    if (applied.clarification.options.length === 0) {
      const reply = renderConversationReply({
        state: { ...applied.state, responseMode: 'empty' },
        execution: emptyExec,
        prevScope,
        clarification: applied.clarification,
      })
      return { handled: true, reply }
    }
    const reply = renderConversationReply({
      state: applied.state,
      execution: emptyExec,
      prevScope,
      clarification: applied.clarification,
    })
    return { handled: true, reply }
  }

  const execution = executeConversationQuery(input.snapshot, applied.state)
  const reply = renderConversationReply({
    state: applied.state,
    execution,
    prevScope,
  })

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[conversation]', reply.debug)
  }

  return { handled: true, reply }
}
