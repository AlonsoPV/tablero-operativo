import { ROUTES } from '@/constants'
import { actionRecordLink } from '@/features/ai-support/assistantBriefing'
import type { AssistantIntent, OperationalActionItem, OperationalSnapshot } from '@/features/ai-support/operationalContext/types'
import type {
  AssistantActionRowView,
  AssistantMetric,
  AssistantOkrRowView,
  AssistantUiPayload,
} from './types'
import {
  extractPersonNameQuery,
  isAssignedByMeRequest,
  isAssignedToMeRequest,
  isBoardScopeRequest,
  isBriefCountRequest,
  isCreatedByMeRequest,
  isListRequest,
  resolveFollowUpScope,
} from './queryScope'

export {
  isListRequest,
  isBriefCountRequest,
  isCreatedByMeRequest,
  isAssignedToMeRequest,
  isAssignedByMeRequest,
  isBoardScopeRequest,
  extractPersonNameQuery,
  resolveFollowUpScope,
} from './queryScope'

function normalize(text: string) {
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

function foldName(value: string) {
  return normalize(value).replace(/\s+/g, ' ')
}

function toActionRow(item: OperationalActionItem): AssistantActionRowView {
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

function filterByPerson(items: OperationalActionItem[], personQuery: string) {
  const needle = foldName(personQuery)
  return items.filter((item) => {
    const name = foldName(item.responsableNombre || '')
    if (!name) return false
    return name === needle || name.startsWith(needle) || name.split(' ').some((part) => part === needle)
  })
}

export function selectActions(
  message: string,
  snapshot: OperationalSnapshot,
  intent: AssistantIntent,
  options: { priorUserMessages?: string[] } = {}
): { actions: OperationalActionItem[]; scope: string; label: string; totalHint?: number } {
  const t = normalize(message)
  const followUp = resolveFollowUpScope(message, options.priorUserMessages)
  const personQuery = extractPersonNameQuery(message) || followUp?.person || null
  const wantCreated =
    isCreatedByMeRequest(message) ||
    isAssignedByMeRequest(message) ||
    followUp?.scope === 'created'
  const wantAssigned = isAssignedToMeRequest(message) || followUp?.scope === 'mine'
  const wantBoard =
    isBoardScopeRequest(message) || followUp?.scope === 'board' || intent === 'team_delay'
  const wantBoth = wantCreated && wantAssigned

  if (personQuery) {
    const pool = snapshot.viewer.canSeeTeam ? snapshot.boardOpenItems : snapshot.mine
    const actions = filterByPerson(pool, personQuery)
    return {
      actions,
      scope: `Acciones de ${personQuery}`,
      label: 'persona',
      totalHint: actions.length,
    }
  }

  if (/verificacion/.test(t)) {
    return {
      actions: snapshot.pendingVerification,
      scope: 'Pendientes de verificacion',
      label: 'verificacion',
      totalHint: snapshot.counts.pendingVerification,
    }
  }
  if (/bloquead/.test(t) && !wantCreated && !wantBoard) {
    return {
      actions: snapshot.mine.filter((item) => item.estado === 'Bloqueado'),
      scope: 'Acciones bloqueadas (asignadas a ti)',
      label: 'bloqueadas',
      totalHint: snapshot.counts.blocked,
    }
  }
  if (/vencid|retraso|atrasad/.test(t) && !wantCreated && !wantBoard) {
    return {
      actions: snapshot.mine.filter(
        (item) => item.dueBucket === 'overdue' || item.estado === 'Retraso'
      ),
      scope: 'Acciones vencidas o en retraso (asignadas a ti)',
      label: 'vencidas',
      totalHint: snapshot.counts.overdue,
    }
  }
  if (/\ben rojo\b|rojas?\b/.test(t) && !wantCreated && !wantBoard) {
    return {
      actions: snapshot.mine.filter(
        (item) => item.color === 'rojo' || item.dueBucket === 'overdue' || item.estado === 'Retraso'
      ),
      scope: 'Acciones en rojo (asignadas a ti)',
      label: 'en rojo',
      totalHint: snapshot.counts.red,
    }
  }
  if (wantBoard && snapshot.viewer.canSeeTeam) {
    if (intent === 'team_delay' && !isBoardScopeRequest(message) && followUp?.scope !== 'board') {
      return {
        actions: snapshot.teamHot,
        scope: 'Focos del equipo',
        label: 'equipo',
        totalHint: snapshot.teamHot.length,
      }
    }
    return {
      actions: snapshot.boardOpenItems,
      scope: 'Acciones abiertas del tablero',
      label: 'tablero',
      totalHint: snapshot.counts.boardOpen,
    }
  }
  if (wantBoth) {
    const byId = new Map<string, OperationalActionItem>()
    for (const item of [...snapshot.mine, ...snapshot.created]) byId.set(item.id, item)
    const actions = sortMerged([...byId.values()])
    return {
      actions,
      scope: 'Asignadas a ti o creadas/asignadas por ti',
      label: 'mias_o_creadas',
      totalHint: byId.size,
    }
  }
  if (wantCreated) {
    return {
      actions: snapshot.created,
      scope: 'Acciones que tu asignaste o creaste',
      label: 'creadas',
      totalHint: snapshot.counts.createdOpen,
    }
  }
  return {
    actions: snapshot.mine,
    scope: 'Acciones asignadas a ti',
    label: 'abiertas',
    totalHint: snapshot.counts.open,
  }
}

function sortMerged(items: OperationalActionItem[]) {
  const rank = (item: OperationalActionItem) => {
    if (item.dueBucket === 'overdue' || item.estado === 'Retraso') return 0
    if (item.estado === 'Bloqueado') return 1
    if (item.color === 'rojo') return 2
    if (item.dueBucket === 'today') return 3
    if (item.dueBucket === 'week') return 4
    return 5
  }
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`)
  })
}

function metricsFromCounts(snapshot: OperationalSnapshot, scope: string): AssistantMetric[] {
  const c = snapshot.counts
  return [
    { id: 'open', label: 'Abiertas', value: c.open, tone: 'neutral', scope },
    {
      id: 'overdue',
      label: 'Vencidas',
      value: c.overdue,
      tone: c.overdue > 0 ? 'danger' : 'ok',
      scope,
    },
    {
      id: 'blocked',
      label: 'Bloqueadas',
      value: c.blocked,
      tone: c.blocked > 0 ? 'warning' : 'ok',
      scope,
    },
    {
      id: 'week',
      label: 'Vencen en 7d',
      value: c.dueThisWeek,
      tone: c.dueThisWeek > 0 ? 'warning' : 'neutral',
      scope,
    },
  ]
}

function normalizeOkrMessage(message: string) {
  return message
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

/** Filtro de alcance OKR desde el mensaje (equipo / empresa / todos). */
export function resolveOkrScopeFilter(message: string): 'team' | 'company' | 'all' {
  const t = normalizeOkrMessage(message)
  if (/\b(de equipo|del equipo|team|area|de mi area)\b/.test(t) && !/\b(empresa|company|corporativ)\b/.test(t)) {
    return 'team'
  }
  if (/\b(de empresa|company|corporativ|de la org)\b/.test(t)) {
    return 'company'
  }
  return 'all'
}

function okrsFromSnapshot(
  snapshot: OperationalSnapshot,
  scopeFilter: 'team' | 'company' | 'all' = 'all'
): AssistantOkrRowView[] {
  const items = snapshot.board.okrs?.items ?? []
  const filtered =
    scopeFilter === 'all'
      ? items
      : items.filter((item) => String(item.scope || '').toLowerCase() === scopeFilter)
  return filtered.slice(0, 12).map((item) => ({
    id: item.id,
    nombre: item.nombre,
    progress: typeof item.progress === 'number' ? item.progress : null,
    krCount: typeof item.krCount === 'number' ? item.krCount : 0,
    pace: item.periodStatus || null,
    scope: item.scope || null,
    initiativesHint:
      typeof item.initiativeCount === 'number' && item.initiativeCount === 0
        ? 'Sin iniciativas'
        : item.initiativeCount > 0
          ? `${item.initiativeCount} iniciativa(s)`
          : null,
    href: `${ROUTES.OKRS}?objective=${encodeURIComponent(item.id)}`,
  }))
}

/**
 * Construye vistas UI a partir del snapshot local (camino factual, sin Gemini).
 */
export function buildAssistantUiFromSnapshot(input: {
  message: string
  snapshot: OperationalSnapshot
  intent: AssistantIntent
  finding: string
  recommendation?: string
  nextAction?: string
  priorUserMessages?: string[]
}): AssistantUiPayload {
  const { message, snapshot, intent, finding, recommendation, nextAction, priorUserMessages } =
    input
  const scopePersonal = 'Alcance: acciones asignadas a ti'
  const listMode = isListRequest(message)
  const briefMode = isBriefCountRequest(message) && !listMode
  const boardAsk = isBoardScopeRequest(message)

  if (intent === 'okrs') {
    if (!snapshot.viewer.canSeeOkrs || !snapshot.board.okrs) {
      return {
        summary: finding,
        views: [
          {
            type: 'empty',
            message: 'No tienes acceso a OKRs en este perfil o no hay datos cargados.',
          },
        ],
      }
    }
    const scopeFilter = resolveOkrScopeFilter(message)
    const okrs = okrsFromSnapshot(snapshot, scopeFilter)
    const board = snapshot.board.okrs
    const scopeLabel =
      scopeFilter === 'team'
        ? 'OKRs de equipo'
        : scopeFilter === 'company'
          ? 'OKRs de empresa'
          : 'OKRs visibles'
    return {
      summary: finding,
      views: [
        {
          type: 'okr_list',
          summary:
            scopeFilter === 'all'
              ? `${okrs.length} de ${board.objectives} objetivos · ${board.keyResults} KRs · ${board.initiatives} iniciativas`
              : `${okrs.length} objetivo(s) · alcance ${scopeLabel}`,
          total: scopeFilter === 'all' ? board.objectives : okrs.length,
          visible: okrs.length,
          truncated: scopeFilter === 'all' ? board.objectives > okrs.length : false,
          scope: scopeLabel,
          okrs,
        },
        ...(recommendation
          ? [{ type: 'recommendation' as const, text: recommendation, nextAction }]
          : []),
      ],
    }
  }

  const selected = selectActions(message, snapshot, intent, { priorUserMessages })
  const rows = selected.actions.map(toActionRow)
  const total = Math.max(selected.totalHint ?? rows.length, rows.length)
  const listTruncated = rows.length < total || Boolean(snapshot.truncated)

  if (briefMode && intent !== 'team_delay') {
    const c = snapshot.counts
    const t = normalize(message)
    let value = c.open
    let label = 'Abiertas'
    let scope = scopePersonal
    if (boardAsk && snapshot.viewer.canSeeTeam) {
      value = c.boardOpen
      label = 'Abiertas tablero'
      scope = 'Alcance: tablero completo'
    } else if (
      (isCreatedByMeRequest(message) || isAssignedByMeRequest(message)) &&
      !isAssignedToMeRequest(message)
    ) {
      value = c.createdOpen
      label = 'Asignadas/creadas por ti'
      scope = 'Alcance: acciones que tu asignaste o creaste'
    } else if (/vencid|retraso/.test(t)) {
      value = c.overdue
      label = 'Vencidas'
    } else if (/bloquead/.test(t)) {
      value = c.blocked
      label = 'Bloqueadas'
    } else if (/verificacion/.test(t)) {
      value = c.pendingVerification
      label = 'Por verificar'
    } else if (/\ben rojo\b|rojas?\b/.test(t)) {
      value = c.red
      label = 'En rojo'
    }
    return {
      summary: finding,
      views: [
        {
          type: 'brief',
          summary: finding,
          scope,
          metrics: [{ id: 'main', label, value, tone: value > 0 ? 'warning' : 'ok', scope }],
        },
        ...(recommendation
          ? [{ type: 'recommendation' as const, text: recommendation, nextAction }]
          : []),
      ],
    }
  }

  // Resumen mixto solo para priorización o pedido explícito de resumen (no "muestra todas").
  if (
    intent === 'prioritize' ||
    /\bresumen (operativo|completo|general)\b|\bmuéstrame todo\b|\bmuestra todo\b/.test(
      normalize(message)
    )
  ) {
    return {
      summary: finding,
      views: [
        {
          type: 'operational_summary',
          summary: finding,
          scope: selected.scope,
          metrics: metricsFromCounts(snapshot, selected.scope),
          actions: rows.slice(0, 6),
          okrs: intent === 'prioritize' ? undefined : okrsFromSnapshot(snapshot).slice(0, 3),
          recommendation: recommendation
            ? { text: recommendation, nextAction }
            : undefined,
        },
      ],
    }
  }

  if (total === 0) {
    return {
      summary: finding,
      views: [
        {
          type: 'empty',
          message: finding,
          scope: selected.scope,
        },
      ],
    }
  }

  const visibleRows = rows.slice(0, 40)
  return {
    summary: finding,
    views: [
      {
        type: 'action_list',
        summary: finding,
        total,
        visible: visibleRows.length,
        truncated: listTruncated || rows.length > visibleRows.length,
        scope: selected.scope,
        actions: visibleRows,
      },
      ...(recommendation
        ? [{ type: 'recommendation' as const, text: recommendation, nextAction }]
        : []),
    ],
  }
}
