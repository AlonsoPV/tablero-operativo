import type { PriorityColor } from '@/features/operations/utils/priorityColors'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'
import type { TeamAction, TeamBoard } from '../types'

export type TeamDashboardPeriod = '7d' | '30d' | 'month'
export type TeamDashboardAlertType = 'vencida' | 'bloqueada' | 'roja_hoy'

export type TeamDashboardAttentionItem = {
  action: TeamAction
  assigneeName: string
  stateName: string
  alertType: TeamDashboardAlertType
}

export type TeamDashboardAgingBucket = {
  label: string
  min: number
  max: number | null
  count: number
  actions: TeamAction[]
}

export type TeamDashboardGroupMetric = {
  label: string
  value: number
  actions: TeamAction[]
  assigneeId?: string
}

export type TeamDashboardMetrics = {
  activeActions: number
  overdueActions: number
  overduePercent: number
  blockedActions: number
  onTimeCompliancePercent: number | null
  closedActionsInPeriod: number
  loadByMember: Array<{ userId: string; name: string; activeCount: number }>
  attentionItems: TeamDashboardAttentionItem[]
  attentionScopeActions: TeamAction[]
  overdueActionList: TeamAction[]
  redActions: TeamAction[]
  yellowActions: TeamAction[]
  greenActions: TeamAction[]
  redClosedActions: TeamAction[]
  otherClosedActions: TeamAction[]
  agingBuckets: TeamDashboardAgingBucket[]
  overdueByMember: TeamDashboardGroupMetric[]
  avgCloseAgeRedDays: number | null
  avgCloseAgeOthersDays: number | null
}

export type TeamDashboardDrillDown = {
  title: string
  alert?: 'attention' | 'overdue' | 'active'
  assigneeId?: string
}

function priorityBucket(action: TeamAction): PriorityColor {
  return priorityColorFor(action.prioridad, null)
}

function daysBetween(start: string, end: string | Date) {
  const from = new Date(start).getTime()
  const to = typeof end === 'string' ? new Date(end).getTime() : end.getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

function average(values: number[]) {
  if (!values.length) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function isAttentionScopeAction(action: TeamAction, board: TeamBoard, now: Date) {
  if (!isTeamActionOpen(action, board)) return false
  return isTeamActionOverdue(action, board, now) || isTeamActionDueToday(action, now)
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')
}

export function isTeamActionOpen(action: TeamAction, board: TeamBoard) {
  if (action.completed_at) return false
  const state = board.states.find((item) => item.id === action.estado_id)
  return !state?.es_final
}

export function isTeamActionOverdue(action: TeamAction, board: TeamBoard, now = new Date()) {
  if (!action.fecha_limite || !isTeamActionOpen(action, board)) return false
  return new Date(action.fecha_limite).getTime() < now.getTime()
}

export function isTeamActionBlocked(action: TeamAction, board: TeamBoard) {
  if (!isTeamActionOpen(action, board)) return false
  if (action.bloqueada) return true
  const state = board.states.find((item) => item.id === action.estado_id)
  return normalize(state?.nombre).includes('bloque')
}

export function isTeamActionCritical(action: TeamAction) {
  const priority = normalize(action.prioridad)
  return priority.includes('rojo') || priority.includes('crit') || priority.includes('p1') || priority.includes('alta')
}

export function isTeamActionDueToday(action: TeamAction, now = new Date()) {
  if (!action.fecha_limite) return false
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
  const due = new Date(action.fecha_limite).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
  return today === due
}

export function periodStartDate(period: TeamDashboardPeriod, now = new Date()) {
  const start = new Date(now)
  if (period === '7d') {
    start.setDate(start.getDate() - 7)
    return start
  }
  if (period === 'month') {
    return new Date(start.getFullYear(), start.getMonth(), 1)
  }
  start.setDate(start.getDate() - 30)
  return start
}

function stateName(action: TeamAction, board: TeamBoard) {
  return board.states.find((item) => item.id === action.estado_id)?.nombre ?? 'Sin estado'
}

function assigneeName(action: TeamAction, board: TeamBoard) {
  return (
    action.asignado_nombre?.trim() ||
    board.members.find((member) => member.id === action.asignado_a)?.nombre ||
    'Sin responsable'
  )
}

function attentionWeight(item: TeamDashboardAttentionItem) {
  if (item.alertType === 'vencida') return 0
  if (item.alertType === 'bloqueada') return 1
  return 2
}

export function buildTeamDashboardMetrics(
  board: TeamBoard,
  period: TeamDashboardPeriod,
  now = new Date()
): TeamDashboardMetrics {
  const active = board.actions.filter((action) => isTeamActionOpen(action, board))
  const overdue = active.filter((action) => isTeamActionOverdue(action, board, now))
  const blocked = active.filter((action) => isTeamActionBlocked(action, board))
  const periodStart = periodStartDate(period, now).getTime()
  const closedInPeriod = board.actions.filter((action) => {
    if (!action.completed_at) return false
    const closedAt = new Date(action.completed_at).getTime()
    return Number.isFinite(closedAt) && closedAt >= periodStart && closedAt <= now.getTime()
  })
  const closedOnTime = closedInPeriod.filter((action) => {
    if (!action.fecha_limite) return false
    return new Date(action.completed_at!).getTime() <= new Date(action.fecha_limite).getTime()
  })
  const loadByMember = [...board.members]
    .map((member) => ({
      userId: member.id,
      name: member.nombre,
      activeCount: active.filter((action) => action.asignado_a === member.id).length,
    }))
    .filter((item) => item.activeCount > 0)
    .sort((a, b) => b.activeCount - a.activeCount || a.name.localeCompare(b.name, 'es'))

  const attentionMap = new Map<string, TeamDashboardAttentionItem>()
  for (const action of overdue) {
    attentionMap.set(action.id, {
      action,
      assigneeName: assigneeName(action, board),
      stateName: stateName(action, board),
      alertType: 'vencida',
    })
  }
  for (const action of blocked) {
    if (!attentionMap.has(action.id)) {
      attentionMap.set(action.id, {
        action,
        assigneeName: assigneeName(action, board),
        stateName: stateName(action, board),
        alertType: 'bloqueada',
      })
    }
  }
  for (const action of active.filter((item) => isTeamActionCritical(item) && isTeamActionDueToday(item, now))) {
    if (!attentionMap.has(action.id)) {
      attentionMap.set(action.id, {
        action,
        assigneeName: assigneeName(action, board),
        stateName: stateName(action, board),
        alertType: 'roja_hoy',
      })
    }
  }

  const attentionItems = [...attentionMap.values()]
    .sort((a, b) => {
      const weight = attentionWeight(a) - attentionWeight(b)
      if (weight !== 0) return weight
      return new Date(a.action.fecha_limite ?? a.action.created_at).getTime() -
        new Date(b.action.fecha_limite ?? b.action.created_at).getTime()
    })
    .slice(0, 5)

  const attentionScopeActions = active.filter((action) => isAttentionScopeAction(action, board, now))
  const redActions = active.filter((action) => priorityBucket(action) === 'rojo')
  const yellowActions = active.filter((action) => priorityBucket(action) === 'amarillo')
  const greenActions = active.filter((action) => priorityBucket(action) === 'verde')

  const agingBucketDefs: Array<{ label: string; min: number; max: number | null }> = [
    { label: '0-3 días', min: 0, max: 3 },
    { label: '4-7 días', min: 4, max: 7 },
    { label: '8-14 días', min: 8, max: 14 },
    { label: '15+ días', min: 15, max: null },
  ]
  const agingBuckets = agingBucketDefs.map((bucket) => {
    const actions = active.filter((action) => {
      const age = daysBetween(action.created_at, now)
      if (bucket.max == null) return age >= bucket.min
      return age >= bucket.min && age <= bucket.max
    })
    return { ...bucket, count: actions.length, actions }
  })

  const overdueByMemberMap = new Map<string, TeamDashboardGroupMetric>()
  for (const action of overdue) {
    const label = assigneeName(action, board)
    const existing = overdueByMemberMap.get(label)
    if (existing) {
      existing.actions.push(action)
      existing.value += 1
    } else {
      overdueByMemberMap.set(label, {
        label,
        value: 1,
        actions: [action],
        assigneeId: action.asignado_a ?? undefined,
      })
    }
  }
  const overdueByMember = [...overdueByMemberMap.values()].sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es')
  )

  const redClosedActions = closedInPeriod.filter((action) => priorityBucket(action) === 'rojo')
  const otherClosedActions = closedInPeriod.filter((action) => priorityBucket(action) !== 'rojo')
  const avgCloseAgeRedDays = average(
    redClosedActions
      .filter((action) => action.completed_at)
      .map((action) => daysBetween(action.created_at, action.completed_at!))
  )
  const avgCloseAgeOthersDays = average(
    otherClosedActions
      .filter((action) => action.completed_at)
      .map((action) => daysBetween(action.created_at, action.completed_at!))
  )

  return {
    activeActions: active.length,
    overdueActions: overdue.length,
    overduePercent: active.length ? Math.round((overdue.length / active.length) * 100) : 0,
    blockedActions: blocked.length,
    onTimeCompliancePercent: closedInPeriod.length
      ? Math.round((closedOnTime.length / closedInPeriod.length) * 100)
      : null,
    closedActionsInPeriod: closedInPeriod.length,
    loadByMember,
    attentionItems,
    attentionScopeActions,
    overdueActionList: overdue,
    redActions,
    yellowActions,
    greenActions,
    redClosedActions,
    otherClosedActions,
    agingBuckets,
    overdueByMember,
    avgCloseAgeRedDays,
    avgCloseAgeOthersDays,
  }
}
