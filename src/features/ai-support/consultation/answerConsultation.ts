import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import { buildAssistantUiFromSnapshot } from '@/features/ai-support/chatViews/buildViewsFromSnapshot'
import { runConversationTurn } from '@/features/ai-support/conversation/runTurn'
import type { ConversationQueryState } from '@/features/ai-support/conversation/types'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import type { CopilotClarification } from '@/features/ai-support/copilot/types'
import { tryFactualAssistantReply } from '@/features/ai-support/operationalContext/tryFactualAssistantReply'
import { detectAssistantIntent } from '@/features/ai-support/operationalContext/detectAssistantIntent'
import type { OperationalSnapshot } from '@/features/ai-support/operationalContext/types'
import {
  classifyConsultation,
  conceptExplanation,
  INITIATIVE_LATENESS_LIMIT,
  proposalWithoutExecution,
  shouldAnswerConsultation,
  type ConsultationTopic,
} from './classifyConsultation'
import { isMethodQuestion, isWhoLags, practiceReply } from './speechAct'

type OkrItem = NonNullable<OperationalSnapshot['board']['okrs']>['items'][number]

export type ConsultationAnswer = {
  content: string
  ui: AssistantUiPayload
}

function textReply(content: string, views: AssistantUiPayload['views'] = []): ConsultationAnswer {
  return { content, ui: { summary: content, views } }
}

function okrBoard(snapshot: OperationalSnapshot | null) {
  if (!snapshot?.viewer.canSeeOkrs || !snapshot.board.okrs) return null
  return snapshot.board.okrs
}

function leastProgress(items: OkrItem[]) {
  const measurable = items.filter((item) => typeof item.progress === 'number')
  if (measurable.length === 0) return null
  return [...measurable].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0))[0] ?? null
}

function noOkrAccessReply(): ConsultationAnswer {
  const content = 'No tienes acceso a OKRs en este perfil o no hay datos cargados.'
  return textReply(content, [{ type: 'empty', message: content }])
}

function okrListAnswer(message: string, snapshot: OperationalSnapshot, finding: string): ConsultationAnswer {
  const ui = buildAssistantUiFromSnapshot({
    message,
    snapshot,
    intent: 'okrs',
    finding,
  })
  const list = ui.views.find((view) => view.type === 'okr_list')
  if (list?.type === 'okr_list' && list.okrs.length === 0) {
    return textReply(finding, [{ type: 'empty', message: finding }])
  }
  return { content: finding, ui: { ...ui, summary: finding } }
}

function analysisAnswer(message: string, snapshot: OperationalSnapshot): ConsultationAnswer {
  const board = okrBoard(snapshot)
  if (!board) return noOkrAccessReply()
  const items = board.items
  const focus = leastProgress(items)
  const behind = items.filter((item) => typeof item.progress === 'number' && item.progress < 40)
  const finding = !items.length
    ? 'No hay OKRs en la muestra autorizada.'
    : !focus
      ? `Hay ${items.length} objetivo(s) visible(s), pero ninguno tiene avance calculable. No estimo un porcentaje.`
      : `El objetivo que pide más atención es «${focus.nombre}», con ${Math.round(focus.progress!)}% de avance${
          behind.length ? `. ${behind.length} objetivo(s) están por debajo de 40%.` : '.'
        }`
  if (!items.length) return textReply(finding, [{ type: 'empty', message: finding }])

  const list = okrListAnswer(message, snapshot, finding)
  const okrView = list.ui.views.find((view) => view.type === 'okr_list')
  const next = focus
    ? `Revisar los resultados clave de «${focus.nombre}». Puedes pedir qué hacer para mejorarlo; no creo la acción sola.`
    : 'Completar el avance de los resultados clave que no tienen datos.'
  return {
    content: finding,
    ui: {
      summary: finding,
      views: [
        {
          type: 'brief',
          summary: finding,
          scope: 'OKRs autorizados en tu alcance',
          metrics: [
            { id: 'objectives', label: 'Objetivos', value: items.length, tone: 'neutral' },
            {
              id: 'behind',
              label: 'Bajo 40%',
              value: behind.length,
              tone: behind.length ? 'warning' : 'ok',
            },
          ],
        },
        ...(okrView ? [okrView] : []),
        { type: 'recommendation', text: next },
      ],
    },
  }
}

function okrAdvice(snapshot: OperationalSnapshot): ConsultationAnswer {
  const board = okrBoard(snapshot)
  if (!board) return noOkrAccessReply()
  const focus = leastProgress(board.items)
  const subject = !board.items.length
    ? 'no hay objetivos en la muestra autorizada, así que no propongo un foco inventado.'
    : !focus
      ? 'primero hay que cargar el avance de los resultados clave. Sin esa cifra no elijo un objetivo.'
      : `revisar «${focus.nombre}» (${Math.round(focus.progress!)}% de avance) y definir una iniciativa o una acción.`
  const content = proposalWithoutExecution(subject)
  const list = focus
    ? okrListAnswer('objetivo que pide atencion', snapshot, content).ui.views.find((view) => view.type === 'okr_list')
    : undefined
  const focusedList =
    list?.type === 'okr_list'
      ? { ...list, okrs: list.okrs.filter((row) => row.id === focus?.id), total: 1, visible: 1, truncated: false }
      : null
  return {
    content,
    ui: {
      summary: content,
      views: [
        { type: 'recommendation', text: content },
        ...(focusedList && focusedList.okrs.length ? [focusedList] : []),
      ],
    },
  }
}

function initiativeGap(snapshot: OperationalSnapshot): ConsultationAnswer {
  const board = okrBoard(snapshot)
  if (!board) return noOkrAccessReply()
  const focus = leastProgress(board.items)
  const verifiable = !board.items.length
    ? 'Tampoco hay objetivos en la muestra autorizada.'
    : !focus
      ? `Sí hay ${board.items.length} objetivo(s) y ${board.initiatives} iniciativa(s) en la muestra, pero ningún objetivo tiene avance calculable.`
      : `Lo verificable es el avance de los objetivos: «${focus.nombre}» va en ${Math.round(focus.progress!)}%. Eso no dice que una iniciativa esté atrasada.`
  const content = `${INITIATIVE_LATENESS_LIMIT} ${verifiable}`
  if (!board.items.length) return textReply(content, [{ type: 'empty', message: content }])
  const list = okrListAnswer('avance de objetivos', snapshot, verifiable)
  const okrView = list.ui.views.find((view) => view.type === 'okr_list')
  return {
    content,
    ui: {
      summary: content,
      views: [
        {
          type: 'brief',
          summary: content,
          scope: 'Sin estado de atraso por iniciativa',
          metrics: [
            { id: 'objectives', label: 'Objetivos', value: board.objectives, tone: 'neutral' },
            { id: 'initiatives', label: 'Iniciativas', value: board.initiatives, tone: 'neutral' },
          ],
        },
        ...(okrView ? [{ ...okrView, scope: 'Avance de objetivos, no estado de la iniciativa' }] : []),
      ],
    },
  }
}

function lateItems(snapshot: OperationalSnapshot) {
  const pool = snapshot.viewer.canSeeTeam ? snapshot.boardOpenItems : snapshot.mine
  return pool.filter((item) => item.dueBucket === 'overdue' || item.estado === 'Retraso')
}

function rankLags(snapshot: OperationalSnapshot) {
  const counts = new Map<string, number>()
  for (const item of lateItems(snapshot)) {
    const nombre = item.responsableNombre.trim()
    if (!nombre) continue
    counts.set(nombre, (counts.get(nombre) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([nombre, count]) => ({ nombre, count }))
    .sort((a, b) => b.count - a.count || a.nombre.localeCompare(b.nombre))
}

function whoLagsAnswer(snapshot: OperationalSnapshot | null): ConsultationAnswer {
  if (!snapshot) {
    const content = 'No tengo el tablero cargado, así que no invento quién concentra los retrasos.'
    return textReply(content, [{ type: 'empty', message: content }])
  }
  const late = lateItems(snapshot)
  const ranks = rankLags(snapshot)
  if (!snapshot.viewer.canSeeTeam) {
    const content = late.length
      ? `En tus acciones hay ${late.length} en retraso. Este perfil no ve el tablero del resto del equipo, así que no nombro a otras personas.`
      : 'En tus acciones no hay retrasos. Este perfil no ve el tablero del resto del equipo.'
    return textReply(content, [
      {
        type: 'brief',
        summary: content,
        scope: 'Solo tus acciones',
        metrics: [{ id: 'overdue', label: 'En retraso', value: late.length, tone: late.length ? 'warning' : 'ok' }],
      },
    ])
  }
  if (!late.length) {
    const content = 'En los datos autorizados no hay acciones en retraso.'
    return textReply(content, [{ type: 'empty', message: content }])
  }
  const top = ranks.slice(0, 3).map((row) => `${row.nombre} (${row.count})`).join(', ')
  const content = top
    ? `En los datos autorizados hay ${late.length} acción(es) en retraso. Quien concentra más es ${top}.`
    : `En los datos autorizados hay ${late.length} acción(es) en retraso, sin nombre de responsable en la muestra.`
  return textReply(content, [
    {
      type: 'brief',
      summary: content,
      scope: 'Tablero autorizado',
      metrics: [
        { id: 'overdue', label: 'En retraso', value: late.length, tone: 'warning' },
        ...ranks.slice(0, 3).map((row) => ({
          id: row.nombre,
          label: row.nombre,
          value: row.count,
          tone: 'warning' as const,
        })),
      ],
    },
  ])
}

function practiceAnswer(
  message: string,
  priorUserMessages: string[] | undefined,
  snapshot: OperationalSnapshot | null
): ConsultationAnswer {
  const prior = priorUserMessages ?? []
  const asksFirst = /\bque (harias|hariamos)\b/.test(
    message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX')
  )
  const sawLags = prior.some((line) => isWhoLags(line))
  let lead = ''
  if (asksFirst && sawLags && snapshot) {
    const top = rankLags(snapshot)[0]
    if (!snapshot.viewer.canSeeTeam) {
      const mine = lateItems(snapshot).length
      lead = mine
        ? `Primero revisaría tus ${mine} acción(es) en retraso. `
        : 'En tus acciones no veo retrasos, así que el primer paso es de hábito. '
    } else if (top) {
      lead = `Primero atendería a ${top.nombre}: concentra ${top.count} retraso(s) en el alcance autorizado. `
    }
  }
  const content = `${lead}${practiceReply(message, prior)}`
  return textReply(content)
}

function kanbanAdvice(snapshot: OperationalSnapshot | null): ConsultationAnswer {
  const top = snapshot?.mine[0]
  if (!snapshot || !top) {
    const content = proposalWithoutExecution(
      snapshot
        ? 'no hay una acción abierta para poner primero.'
        : 'cuando tenga tus acciones cargadas te digo por cuál empezar.'
    )
    return textReply(content, [{ type: 'recommendation', text: content }])
  }
  const content = proposalWithoutExecution(
    `empezar por «${top.titulo}» (${top.estado}, ${top.fecha}).`
  )
  const listed = buildAssistantUiFromSnapshot({
    message: 'que deberiamos priorizar',
    snapshot,
    intent: 'prioritize',
    finding: 'Acciones abiertas, empezando por la más urgente.',
  })
  const views = listed.views.map((view) =>
    view.type === 'operational_summary' ? { ...view, recommendation: undefined } : view
  )
  return {
    content,
    ui: {
      summary: content,
      views: [{ type: 'recommendation', text: content }, ...views],
    },
  }
}

/**
 * Respuesta local de consulta. Null cuando el turno sigue al copiloto Kanban o al modelo.
 * No llama herramientas de negocio.
 */
export function answerConsultation(input: {
  message: string
  snapshot: OperationalSnapshot | null
  priorUserMessages?: string[]
  priorTopic?: ConsultationTopic | null
}): ConsultationAnswer | null {
  const turn = classifyConsultation(input.message, {
    priorUserMessages: input.priorUserMessages,
    priorTopic: input.priorTopic,
  })
  if (!shouldAnswerConsultation(turn, input.message)) return null

  if (turn.kind === 'concept') {
    return textReply(conceptExplanation(turn.topic))
  }

  if (isWhoLags(input.message)) return whoLagsAnswer(input.snapshot)

  if (turn.kind === 'data' && turn.topic === 'scrumban') {
    return textReply(
      'Scrumban es la forma de trabajo, no un listado. Pregunta cuáles son los OKRs o qué acciones tienes pendientes si quieres registros.'
    )
  }

  const snapshot = input.snapshot
  if ((turn.topic === 'okr' || turn.topic === 'kr') && !snapshot) {
    const content = 'No tengo cargados los OKRs de tu alcance en este momento. No invento la lista.'
    return textReply(content, [{ type: 'empty', message: content }])
  }

  if (isMethodQuestion(input.message) && turn.topic !== 'initiative') {
    if (turn.topic === 'okr' || turn.topic === 'kr') {
      if (!snapshot) {
        const content = 'No tengo cargados los OKRs de tu alcance en este momento. No invento la lista.'
        return textReply(content, [{ type: 'empty', message: content }])
      }
      return okrAdvice(snapshot)
    }
    return practiceAnswer(input.message, input.priorUserMessages, snapshot)
  }

  if (turn.topic === 'initiative' && turn.kind === 'analysis') {
    if (!snapshot) {
      const content = `${INITIATIVE_LATENESS_LIMIT} Tampoco tengo el tablero de objetivos cargado.`
      return textReply(content, [{ type: 'empty', message: content }])
    }
    return initiativeGap(snapshot)
  }

  if ((turn.topic === 'okr' || turn.topic === 'kr') && snapshot) {
    if (turn.kind === 'analysis') return analysisAnswer(input.message, snapshot)
    if (turn.kind === 'recommendation') return okrAdvice(snapshot)
    const factual = tryFactualAssistantReply(input.message, snapshot, 'okrs', {
      priorUserMessages: input.priorUserMessages,
    })
    if (!factual) return null
    const list = factual.ui.views.find((view) => view.type === 'okr_list')
    if (list?.type === 'okr_list' && list.okrs.length === 0) {
      return textReply(factual.content, [{ type: 'empty', message: factual.content }])
    }
    return { content: factual.content, ui: factual.ui }
  }

  if (turn.kind === 'recommendation') return kanbanAdvice(snapshot)
  return null
}

export type ResolvedAssistantTurn = {
  handled: boolean
  content?: string
  ui?: AssistantUiPayload
  clarification?: CopilotClarification
  conversationState: ConversationQueryState | null
}

/**
 * Mismo orden que el chat: consulta conceptual/OKR, luego copiloto Kanban, luego hechos de equipo.
 * Si no maneja el turno, el chat puede seguir al modelo.
 */
export function resolveAssistantTurn(input: {
  message: string
  snapshot: OperationalSnapshot | null
  priorUserMessages?: string[]
  previousConversation?: ConversationQueryState | null
  people?: NamedPerson[]
}): ResolvedAssistantTurn {
  const local = answerConsultation({
    message: input.message,
    snapshot: input.snapshot,
    priorUserMessages: input.priorUserMessages,
  })
  if (local) {
    return { handled: true, content: local.content, ui: local.ui, conversationState: null }
  }

  if (!input.snapshot) {
    return { handled: false, conversationState: input.previousConversation ?? null }
  }

  const turn = runConversationTurn({
    message: input.message,
    previous: input.previousConversation ?? null,
    snapshot: input.snapshot,
    people: input.people ?? [],
  })
  if (turn.handled) {
    return {
      handled: true,
      content: turn.reply.content,
      ui: turn.reply.ui,
      clarification: turn.reply.clarification,
      conversationState: turn.reply.state,
    }
  }

  const intent = detectAssistantIntent(input.message, { priorUserMessages: input.priorUserMessages })
  if (intent === 'okrs' || intent === 'team_delay') {
    const factual = tryFactualAssistantReply(input.message, input.snapshot, intent, {
      priorUserMessages: input.priorUserMessages,
    })
    if (factual) {
      return {
        handled: true,
        content: factual.content,
        ui: factual.ui,
        conversationState: turn.state.entity === 'none' ? null : turn.state,
      }
    }
  }

  return {
    handled: false,
    conversationState: turn.state.entity === 'none' ? null : turn.state,
  }
}
