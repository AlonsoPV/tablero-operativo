import { actionRecordLink } from '@/features/ai-support/assistantBriefing'
import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import type { CopilotClarification } from '@/features/ai-support/copilot/types'
import type { OperationalActionItem } from '@/features/ai-support/operationalContext/types'
import type { QueryExecution } from './executeQuery'
import type { ConversationQueryState, ConversationReply } from './types'

function toRow(item: OperationalActionItem) {
  const link = actionRecordLink(item.id, item.titulo)
  const owner =
    !item.mine && item.responsableNombre ? ` · ${item.responsableNombre}` : ''
  return {
    id: item.id,
    title: item.titulo,
    estado: `${item.estado}${owner}`,
    prioridad: item.prioridad || null,
    fecha: item.fecha || null,
    href: link.href,
  }
}

function countSentence(state: ConversationQueryState, total: number): string {
  if (state.person) {
    return total > 0
      ? `${state.person.nombre} tiene ${total} accion(es) abierta(s) en el alcance actual.`
      : `No encontre acciones abiertas de ${state.person.nombre} con esos filtros.`
  }
  // status_group before generic scope returns so team+stale stays reachable
  if (state.status_group === 'stale') {
    if (state.scope === 'team_authorized') {
      return total > 0
        ? `Hay ${total} accion(es) del equipo sin seguimiento reciente (sin actualizacion >= 3 dias).`
        : 'No hay acciones del equipo sin seguimiento reciente.'
    }
    return total > 0
      ? `Tienes ${total} accion(es) sin seguimiento reciente (sin actualizacion >= 3 dias).`
      : 'No tienes acciones sin seguimiento reciente.'
  }
  if (state.scope === 'created_by_me') {
    return total > 0
      ? `Tienes ${total} accion(es) abierta(s) que tu asignaste o creaste.`
      : 'No encontré acciones abiertas asignadas/creadas por ti.'
  }
  if (state.scope === 'board_authorized') {
    return total > 0
      ? `En el tablero hay ${total} acciones abiertas.`
      : 'No hay acciones abiertas en el tablero (muestra actual).'
  }
  if (state.scope === 'team_authorized') {
    return total > 0
      ? `Hay ${total} acciones ajenas abiertas en tu vista de equipo.`
      : 'No hay acciones ajenas abiertas en la muestra.'
  }
  if (state.visual === 'board_red') {
    return total > 0
      ? `Tienes ${total} accion(es) en rojo asignadas a ti.`
      : 'No tienes acciones en rojo asignadas a ti.'
  }
  if (state.status_group === 'overdue') {
    return total > 0
      ? `Tienes ${total} accion(es) vencida(s) o en retraso asignadas a ti.`
      : 'No tienes acciones vencidas asignadas a ti.'
  }
  if (state.status_group === 'blocked') {
    return total > 0
      ? `Tienes ${total} accion(es) bloqueada(s).`
      : 'No tienes acciones bloqueadas.'
  }
  if (state.status_group === 'due_week') {
    return total > 0
      ? `Tienes ${total} accion(es) que vencen en los proximos 7 dias.`
      : 'No tienes acciones por vencer en los proximos 7 dias.'
  }
  return total > 0
    ? `Tienes ${total} acciones abiertas asignadas a ti.`
    : 'No tienes acciones abiertas asignadas a ti.'
}

function provenanceFooter(execution: QueryExecution): string {
  const when = execution.asOf
    ? new Date(execution.asOf).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
    : 'corte local'
  const sources = execution.sources.join(', ')
  const limits = execution.limitations.length ? ` Limitaciones: ${execution.limitations.join(' ')}` : ''
  return `\n\nCorte: ${when} · Fuentes: ${sources}.${limits}`
}

function listIntro(state: ConversationQueryState, total: number): string {
  if (state.person) {
    return total > 0
      ? `Estas son las ${total} acciones abiertas de ${state.person.nombre}:`
      : `No encontre acciones abiertas de ${state.person.nombre}.`
  }
  if (state.scope === 'created_by_me') {
    return total > 0
      ? `Estas son las ${total} acciones abiertas que tu asignaste o creaste:`
      : 'No encontré acciones abiertas que tu hayas asignado o creado.'
  }
  if (state.scope === 'board_authorized') {
    return total > 0
      ? `Estas son ${Math.min(total, 40)} de ${total} acciones abiertas del tablero:`
      : 'No hay acciones abiertas en el tablero.'
  }
  if (state.scope === 'assigned_to_me' && state.status_group === 'overdue') {
    return total > 0
      ? `Estas son tus ${total} acciones vencidas o en retraso:`
      : 'No tienes acciones vencidas.'
  }
  if (state.scope === 'assigned_to_me' && state.status_group === 'due_week') {
    return total > 0
      ? `Estas son tus ${total} acciones que vencen en los proximos 7 dias:`
      : 'No tienes acciones por vencer en los proximos 7 dias.'
  }
  if (state.scope === 'assigned_to_me' && state.status_group === 'blocked') {
    return total > 0 ? `Estas son tus ${total} acciones bloqueadas:` : 'No tienes acciones bloqueadas.'
  }
  if (state.status_group === 'stale') {
    return total > 0
      ? `Estas son ${total} accion(es) sin seguimiento reciente (corte >= 3 dias sin actualizacion):`
      : 'No hay acciones sin seguimiento reciente en el alcance actual.'
  }
  return total > 0
    ? `Estas son las ${total} acciones abiertas de las que eres responsable:`
    : 'No tienes acciones abiertas asignadas a ti.'
}

export function renderConversationReply(input: {
  state: ConversationQueryState
  execution: QueryExecution
  prevScope?: ConversationQueryState['scope'] | null
  clarification?: CopilotClarification
}): ConversationReply {
  const { state, execution, clarification } = input
  const rows = execution.items.map(toRow)

  if (clarification || state.responseMode === 'clarify') {
    const question = clarification?.question || 'Necesito una aclaracion.'
    const ui: AssistantUiPayload = {
      summary: question,
      views: [{ type: 'empty', message: question, scope: execution.scopeLabel }],
    }
    return {
      content: question,
      ui,
      clarification,
      state,
      debug: {
        intent: state.intent,
        scope: state.scope,
        personId: state.person?.id ?? null,
        prevScope: input.prevScope ?? null,
        resultCount: 0,
      },
    }
  }

  if (state.responseMode === 'count') {
    const summary = countSentence(state, execution.total)
    const footer = provenanceFooter(execution)
    const ui: AssistantUiPayload = {
      summary,
      asOf: execution.asOf,
      sources: execution.sources,
      limitations: execution.limitations,
      views: [
        {
          type: 'brief',
          summary,
          scope: execution.scopeLabel,
          metrics: [
            {
              id: 'main',
              label:
                state.scope === 'board_authorized'
                  ? 'Abiertas tablero'
                  : state.scope === 'created_by_me'
                    ? 'Asignadas/creadas por ti'
                    : 'Abiertas',
              value: execution.total,
              tone: execution.total > 0 ? 'warning' : 'ok',
              scope: execution.scopeLabel,
            },
          ],
        },
      ],
    }
    return {
      content: `${summary}${footer}`,
      ui,
      state: { ...state, lastResultIds: execution.items.map((i) => i.id) },
      debug: {
        intent: state.intent,
        scope: state.scope,
        personId: state.person?.id ?? null,
        prevScope: input.prevScope ?? null,
        resultCount: execution.total,
      },
    }
  }

  // list / analysis
  const summary = listIntro(state, execution.total)
  const footer = provenanceFooter(execution)
  if (execution.total === 0) {
    const ui: AssistantUiPayload = {
      summary,
      asOf: execution.asOf,
      sources: execution.sources,
      limitations: execution.limitations,
      views: [{ type: 'empty', message: summary, scope: execution.scopeLabel }],
    }
    return {
      content: `${summary}${footer}`,
      ui,
      state: { ...state, lastResultIds: [] },
      debug: {
        intent: state.intent,
        scope: state.scope,
        personId: state.person?.id ?? null,
        prevScope: input.prevScope ?? null,
        resultCount: 0,
      },
    }
  }

  const visible = rows.slice(0, 40)
  const truncated = execution.truncated || visible.length < execution.total
  const truncNote = truncated
    ? '\n\nLista parcial de la muestra cargada; abre el kanban para ver el resto.'
    : ''
  const ui: AssistantUiPayload = {
    summary,
    asOf: execution.asOf,
    sources: execution.sources,
    limitations: execution.limitations,
    views: [
      {
        type: 'action_list',
        summary,
        total: execution.total,
        visible: visible.length,
        truncated,
        scope: execution.scopeLabel,
        actions: visible,
      },
      ...(state.responseMode === 'analysis' && execution.items[0]
        ? [
            {
              type: 'recommendation' as const,
              text: `Empieza por "${execution.items[0].titulo}".`,
              nextAction: `Abrir "${execution.items[0].titulo}".`,
            },
          ]
        : []),
    ],
  }

  const scopeChangeNote =
    input.prevScope && input.prevScope !== state.scope
      ? state.scope === 'created_by_me'
        ? 'Ahora te muestro las que tu asignaste o creaste.\n\n'
        : state.scope === 'board_authorized'
          ? 'Ahora te muestro el tablero completo.\n\n'
          : state.scope === 'assigned_to_me'
            ? 'Ahora te muestro las asignadas a ti.\n\n'
            : ''
      : ''

  return {
    content: `${scopeChangeNote}${summary}${truncNote}${footer}`,
    ui,
    state: { ...state, lastResultIds: execution.items.map((i) => i.id) },
    debug: {
      intent: state.intent,
      scope: state.scope,
      personId: state.person?.id ?? null,
      prevScope: input.prevScope ?? null,
      resultCount: execution.total,
    },
  }
}
