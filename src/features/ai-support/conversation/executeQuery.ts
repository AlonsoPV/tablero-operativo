import type { OperationalActionItem, OperationalSnapshot } from '@/features/ai-support/operationalContext/types'
import type { ConversationQueryState } from './types'

function sortHot(items: OperationalActionItem[]) {
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

function matchesStatus(item: OperationalActionItem, state: ConversationQueryState) {
  if (state.status_group === 'blocked') return item.estado === 'Bloqueado'
  if (state.status_group === 'overdue') {
    return item.dueBucket === 'overdue' || item.estado === 'Retraso'
  }
  if (state.status_group === 'due_week') return item.dueBucket === 'week' || item.dueBucket === 'today'
  if (state.status_group === 'verification') return false // pendingVerification pool aparte
  return true // open
}

function matchesVisual(item: OperationalActionItem, state: ConversationQueryState) {
  if (state.visual === 'none') return true
  if (state.visual === 'priority_red') return item.color === 'rojo'
  if (state.visual === 'overdue') {
    return item.dueBucket === 'overdue' || item.estado === 'Retraso'
  }
  if (state.visual === 'board_red') {
    return item.color === 'rojo' || item.dueBucket === 'overdue' || item.estado === 'Retraso'
  }
  return true
}

function poolForState(
  snapshot: OperationalSnapshot,
  state: ConversationQueryState
): OperationalActionItem[] {
  if (state.status_group === 'verification') {
    return snapshot.pendingVerification
  }
  if (state.person) {
    const pool = snapshot.viewer.canSeeTeam ? snapshot.boardOpenItems : snapshot.mine
    return pool.filter((item) => item.responsableId === state.person!.id)
  }
  if (state.scope === 'created_by_me') return snapshot.created
  if (state.scope === 'board_authorized' || state.scope === 'team_authorized') {
    if (!snapshot.viewer.canSeeTeam) return snapshot.mine
    if (state.scope === 'team_authorized') {
      return snapshot.boardOpenItems.filter((item) => !item.mine)
    }
    return snapshot.boardOpenItems
  }
  if (state.scope === 'assigned_to_me_or_created') {
    const byId = new Map<string, OperationalActionItem>()
    for (const item of [...snapshot.mine, ...snapshot.created]) byId.set(item.id, item)
    return [...byId.values()]
  }
  return snapshot.mine
}

export type QueryExecution = {
  items: OperationalActionItem[]
  total: number
  truncated: boolean
  scopeLabel: string
}

export function scopeLabelFor(state: ConversationQueryState): string {
  if (state.person) return `Acciones de ${state.person.nombre}`
  if (state.scope === 'created_by_me') return 'Acciones que tu asignaste o creaste'
  if (state.scope === 'board_authorized') return 'Acciones abiertas del tablero'
  if (state.scope === 'team_authorized') return 'Acciones del equipo (ajenas)'
  if (state.scope === 'assigned_to_me_or_created') return 'Asignadas a ti o creadas por ti'
  return 'Acciones asignadas a ti'
}

/**
 * Ejecuta el contrato de consulta contra el snapshot local.
 * Recalcula siempre; no reutiliza lastResultIds si el contrato cambió.
 */
export function executeConversationQuery(
  snapshot: OperationalSnapshot,
  state: ConversationQueryState
): QueryExecution {
  const pool = poolForState(snapshot, state)
  const filtered = sortHot(
    pool.filter((item) => matchesStatus(item, state) && matchesVisual(item, state))
  )
  const limit = state.responseMode === 'count' ? filtered.length : Math.min(40, filtered.length)
  const items = filtered.slice(0, Math.max(limit, state.responseMode === 'list' ? 40 : filtered.length))

  // Totales de conteo: para assigned/created usar counts del snapshot cuando no hay visual extra
  let total = filtered.length
  if (
    !state.person &&
    state.visual === 'none' &&
    state.status_group === 'open' &&
    state.scope === 'assigned_to_me'
  ) {
    total = snapshot.counts.open
  } else if (
    !state.person &&
    state.visual === 'none' &&
    state.status_group === 'open' &&
    state.scope === 'created_by_me'
  ) {
    total = snapshot.counts.createdOpen
  } else if (
    !state.person &&
    state.visual === 'none' &&
    state.status_group === 'open' &&
    state.scope === 'board_authorized'
  ) {
    total = snapshot.counts.boardOpen
  } else if (!state.person && state.visual === 'board_red' && state.scope === 'assigned_to_me') {
    total = snapshot.counts.red
  } else if (!state.person && state.status_group === 'overdue' && state.scope === 'assigned_to_me') {
    total = snapshot.counts.overdue
  } else if (!state.person && state.status_group === 'blocked' && state.scope === 'assigned_to_me') {
    total = snapshot.counts.blocked
  }

  return {
    items,
    total: Math.max(total, filtered.length),
    truncated: Boolean(snapshot.truncated) || filtered.length > items.length,
    scopeLabel: scopeLabelFor(state),
  }
}
