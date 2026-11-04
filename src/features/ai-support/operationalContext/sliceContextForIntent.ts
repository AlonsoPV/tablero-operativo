import type { BoardAssistantContextPayload } from '@/features/ai-support/buildBoardAssistantContext'
import { estimateContextChars, estimateTokensFromChars } from './estimateTokens'
import type { AssistantIntent, OperationalSnapshot, SlicedAssistantContexts } from './types'

const ITEM_CAPS: Record<AssistantIntent, number> = {
  pending: 10,
  prioritize: 8,
  okrs: 4,
  team_delay: 10,
  selected_action: 4,
  selected_okr: 4,
  general: 8,
}

function emptyBoard(today: string): BoardAssistantContextPayload {
  return {
    today,
    actions: {
      totalOpen: 0,
      delayed: 0,
      blocked: 0,
      red: 0,
      taggedOkr: 0,
      byEstado: [],
      items: [],
    },
    okrs: null,
  }
}

function itemsFromSnapshot(
  snapshot: OperationalSnapshot,
  intent: AssistantIntent
): BoardAssistantContextPayload['actions']['items'] {
  const cap = ITEM_CAPS[intent]
  const source =
    intent === 'team_delay'
      ? snapshot.teamHot
      : intent === 'pending' || intent === 'prioritize' || intent === 'general'
        ? snapshot.mine
        : snapshot.mine.slice(0, Math.min(4, snapshot.mine.length))

  return source.slice(0, cap).map((item) => ({
    titulo: item.titulo,
    estado: item.estado,
    prioridad: item.prioridad,
    color: item.color,
    fecha: item.fecha,
    hora: item.hora,
    esOkr: item.esOkr,
    okrImpactado: item.okrImpactado,
  }))
}

/**
 * Recorta el contexto enviado a Gemini segun la intencion.
 * El contexto explicito (accion/OKR seleccionado) se maneja aparte y tiene prioridad.
 */
export function sliceContextForIntent(
  snapshot: OperationalSnapshot,
  intent: AssistantIntent,
  options: {
    /** Si hay accion/OKR seleccionado, no hace falta el tablero completo. */
    hasExplicitFocus?: boolean
  } = {}
): SlicedAssistantContexts {
  const includeOkrs =
    (intent === 'okrs' || intent === 'selected_okr' || intent === 'general' || intent === 'prioritize') &&
    snapshot.viewer.canSeeOkrs

  if (options.hasExplicitFocus && (intent === 'selected_action' || intent === 'selected_okr')) {
    const lean: BoardAssistantContextPayload = {
      ...emptyBoard(snapshot.today),
      fetchedAt: snapshot.fetchedAt,
      viewer: {
        rol: snapshot.viewer.rol,
        areas: snapshot.viewer.areas,
        scope: snapshot.viewer.scope,
      },
      actions: {
        ...emptyBoard(snapshot.today).actions,
        totalOpen: snapshot.counts.open,
        delayed: snapshot.counts.overdue,
        blocked: snapshot.counts.blocked,
        red: snapshot.counts.red,
        taggedOkr: snapshot.counts.taggedOkr,
        items: itemsFromSnapshot(snapshot, intent),
      },
      okrs: includeOkrs ? snapshot.board.okrs : null,
    }
    const boardChars = estimateContextChars(lean)
    return {
      intent,
      boardContext: lean,
      includeOkrs,
      tokenEstimate: { boardChars, approxTokens: estimateTokensFromChars(boardChars) },
    }
  }

  if (intent === 'okrs') {
    const lean: BoardAssistantContextPayload = {
      today: snapshot.today,
      actions: {
        totalOpen: snapshot.counts.open,
        delayed: snapshot.counts.overdue,
        blocked: snapshot.counts.blocked,
        red: snapshot.counts.red,
        taggedOkr: snapshot.counts.taggedOkr,
        byEstado: snapshot.board.actions.byEstado.slice(0, 4),
        items: snapshot.mine
          .filter((item) => item.esOkr)
          .slice(0, 6)
          .map((item) => ({
            titulo: item.titulo,
            estado: item.estado,
            prioridad: item.prioridad,
            color: item.color,
            fecha: item.fecha,
            hora: item.hora,
            esOkr: item.esOkr,
            okrImpactado: item.okrImpactado,
          })),
      },
      okrs: snapshot.board.okrs,
    }
    const boardChars = estimateContextChars(lean)
    return {
      intent,
      boardContext: lean,
      includeOkrs: true,
      tokenEstimate: { boardChars, approxTokens: estimateTokensFromChars(boardChars) },
    }
  }

  if (intent === 'team_delay' && !snapshot.viewer.canSeeTeam) {
    const lean = {
      ...snapshot.board,
      actions: {
        ...snapshot.board.actions,
        items: itemsFromSnapshot(snapshot, 'pending'),
      },
      okrs: null,
    }
    const boardChars = estimateContextChars(lean)
    return {
      intent,
      boardContext: lean,
      includeOkrs: false,
      tokenEstimate: { boardChars, approxTokens: estimateTokensFromChars(boardChars) },
    }
  }

  const sliced: BoardAssistantContextPayload = {
    today: snapshot.today,
    actions: {
      totalOpen: snapshot.counts.open,
      delayed: snapshot.counts.overdue,
      blocked: snapshot.counts.blocked,
      red: snapshot.counts.red,
      taggedOkr: snapshot.counts.taggedOkr,
      byEstado: snapshot.board.actions.byEstado,
      items: itemsFromSnapshot(snapshot, intent),
    },
    okrs: includeOkrs ? snapshot.board.okrs : null,
  }

  const enriched: BoardAssistantContextPayload = {
    ...sliced,
    fetchedAt: snapshot.fetchedAt,
    viewer: {
      rol: snapshot.viewer.rol,
      areas: snapshot.viewer.areas,
      scope: snapshot.viewer.scope,
    },
    operational: {
      dueThisWeek: snapshot.counts.dueThisWeek,
      stale: snapshot.counts.stale,
      pendingVerification: snapshot.counts.pendingVerification,
      teamOverdue: snapshot.viewer.canSeeTeam ? snapshot.counts.teamOverdue : 0,
      teamBlocked: snapshot.viewer.canSeeTeam ? snapshot.counts.teamBlocked : 0,
      mineTitles: snapshot.mine.slice(0, ITEM_CAPS[intent]).map((item) => ({
        titulo: item.titulo,
        estado: item.estado,
        fecha: item.fecha,
        dueBucket: item.dueBucket,
        daysSinceUpdate: item.daysSinceUpdate,
      })),
      pendingVerificationTitles: snapshot.pendingVerification.slice(0, 6).map((item) => ({
        titulo: item.titulo,
        fecha: item.fecha,
      })),
      teamHotTitles:
        intent === 'team_delay'
          ? snapshot.teamHot.slice(0, 10).map((item) => ({
              titulo: item.titulo,
              estado: item.estado,
              fecha: item.fecha,
            }))
          : [],
    },
  }

  const boardChars = estimateContextChars(enriched)
  return {
    intent,
    boardContext: enriched,
    includeOkrs,
    tokenEstimate: { boardChars, approxTokens: estimateTokensFromChars(boardChars) },
  }
}
