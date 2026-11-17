import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import type { OperationalSnapshot } from '@/features/ai-support/operationalContext/types'
import { applyConversationTurn } from './applyTurn'
import { executeConversationQuery } from './executeQuery'
import { renderConversationReply } from './renderReply'
import type { ConversationQueryState, ConversationReply } from './types'

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
}): RunConversationTurnResult {
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
