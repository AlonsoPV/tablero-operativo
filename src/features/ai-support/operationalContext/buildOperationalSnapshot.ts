import { buildBoardAssistantContext } from '@/features/ai-support/buildBoardAssistantContext'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import type { OkrData } from '@/features/okrs/model'
import type { AccionDiaria } from '@/types'
import type { OperationalActionItem, OperationalSnapshot } from './types'

const STALE_DAYS = 3
const MAX_MINE = 14
const MAX_VERIFY = 8
const MAX_TEAM = 10

function daysSinceIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000))
}

function addDays(today: string, days: number): string {
  const base = Date.parse(`${today}T12:00:00`)
  if (!Number.isFinite(base)) return today
  const next = new Date(base + days * 86_400_000)
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dueBucket(fecha: string, today: string): OperationalActionItem['dueBucket'] {
  if (!fecha) return 'unknown'
  if (fecha < today) return 'overdue'
  if (fecha === today) return 'today'
  const weekEnd = addDays(today, 7)
  if (fecha <= weekEnd) return 'week'
  return 'later'
}

function actionColor(action: AccionDiaria, priorities: Priority[]) {
  const priority = findPriorityForAccion(action, priorities)
  return priorityColorFor(priority?.nombre ?? action.prioridad, priority?.color)
}

function toItem(
  action: AccionDiaria,
  priorities: Priority[],
  today: string,
  nowMs: number,
  usuarioId: string
): OperationalActionItem {
  return {
    id: action.id,
    titulo: action.titulo_accion || action.descripcion_accion || 'Accion sin titulo',
    estado: action.estado,
    prioridad: action.prioridad,
    color: actionColor(action, priorities),
    fecha: action.fecha,
    hora: action.hora_limite,
    esOkr: action.es_okr === true,
    okrImpactado: action.okr_impactado?.trim() || '',
    area: action.area?.trim() || '',
    daysSinceUpdate: daysSinceIso(action.updated_at, nowMs),
    dueBucket:
      action.estado === 'Retraso' ? 'overdue' : dueBucket(action.fecha, today),
    mine: action.responsable === usuarioId,
  }
}

function sortHot(items: OperationalActionItem[]) {
  const rank = (item: OperationalActionItem) => {
    if (item.dueBucket === 'overdue' || item.estado === 'Retraso') return 0
    if (item.estado === 'Bloqueado') return 1
    if (item.color === 'rojo') return 2
    if (item.dueBucket === 'today') return 3
    if (item.dueBucket === 'week') return 4
    if ((item.daysSinceUpdate ?? 0) >= STALE_DAYS) return 5
    return 6
  }
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`)
  })
}

function isOpen(action: AccionDiaria) {
  return action.estado !== 'Hecho' && action.estado !== 'Verificado'
}

function isPendingVerification(action: AccionDiaria, usuarioId: string) {
  if (action.estado !== 'Hecho') return false
  return (
    action.verificador_dato === usuarioId ||
    action.verificador_gobierno === usuarioId ||
    action.responsable === usuarioId
  )
}

function isStale(action: AccionDiaria, nowMs: number) {
  if (!isOpen(action)) return false
  const days = daysSinceIso(action.updated_at, nowMs)
  return days != null && days >= STALE_DAYS
}

export function buildOperationalSnapshot(input: {
  usuarioId: string
  rol: string | null
  areas: string[]
  seesAllBoard: boolean
  canSeeOkrs: boolean
  openActions: AccionDiaria[]
  pendingVerificationActions?: AccionDiaria[]
  priorities: Priority[]
  okrData: OkrData | null | undefined
  today: string
  fetchedAt?: string
  nowMs?: number
}): OperationalSnapshot {
  const nowMs = input.nowMs ?? Date.now()
  const fetchedAt = input.fetchedAt ?? new Date(nowMs).toISOString()
  const open = input.openActions.filter(isOpen)
  const mineOpen = input.seesAllBoard
    ? open.filter((action) => action.responsable === input.usuarioId)
    : open
  const scopeActions = input.seesAllBoard ? open : mineOpen

  const weekEnd = addDays(input.today, 7)
  const overdue = scopeActions.filter(
    (a) => a.estado === 'Retraso' || (a.fecha && a.fecha < input.today)
  )
  const dueThisWeek = scopeActions.filter(
    (a) =>
      a.estado !== 'Retraso' &&
      a.fecha &&
      a.fecha >= input.today &&
      a.fecha <= weekEnd
  )
  const blocked = scopeActions.filter((a) => a.estado === 'Bloqueado')
  const red = scopeActions.filter(
    (a) => a.estado === 'Retraso' || actionColor(a, input.priorities) === 'rojo'
  )
  const stale = scopeActions.filter((a) => isStale(a, nowMs))
  const taggedOkr = scopeActions.filter((a) => a.es_okr === true)

  const pendingVerification = (input.pendingVerificationActions ?? [])
    .filter((a) => isPendingVerification(a, input.usuarioId))
    .map((a) => toItem(a, input.priorities, input.today, nowMs, input.usuarioId))

  const teamPool = input.seesAllBoard
    ? open.filter((a) => a.responsable !== input.usuarioId)
    : []
  const teamOverdue = teamPool.filter(
    (a) => a.estado === 'Retraso' || (a.fecha && a.fecha < input.today)
  )
  const teamBlocked = teamPool.filter((a) => a.estado === 'Bloqueado')
  const teamHot = sortHot(
    teamPool
      .filter(
        (a) =>
          a.estado === 'Retraso' ||
          a.estado === 'Bloqueado' ||
          actionColor(a, input.priorities) === 'rojo' ||
          isStale(a, nowMs)
      )
      .map((a) => toItem(a, input.priorities, input.today, nowMs, input.usuarioId))
  ).slice(0, MAX_TEAM)

  const mine = sortHot(
    (input.seesAllBoard ? mineOpen : scopeActions).map((a) =>
      toItem(a, input.priorities, input.today, nowMs, input.usuarioId)
    )
  ).slice(0, MAX_MINE)

  const board = buildBoardAssistantContext(
    scopeActions,
    input.priorities,
    input.canSeeOkrs ? input.okrData : null,
    input.today
  )

  return {
    fetchedAt,
    today: input.today,
    viewer: {
      usuarioId: input.usuarioId,
      rol: input.rol,
      areas: input.areas.filter(Boolean),
      scope: input.seesAllBoard ? 'board' : 'own',
      canSeeOkrs: input.canSeeOkrs,
      canSeeTeam: input.seesAllBoard,
    },
    counts: {
      open: scopeActions.length,
      overdue: overdue.length,
      dueThisWeek: dueThisWeek.length,
      blocked: blocked.length,
      red: red.length,
      stale: stale.length,
      pendingVerification: pendingVerification.length,
      taggedOkr: taggedOkr.length,
      teamOverdue: teamOverdue.length,
      teamBlocked: teamBlocked.length,
    },
    mine,
    pendingVerification: sortHot(pendingVerification).slice(0, MAX_VERIFY),
    teamHot,
    board,
  }
}

export const __operationalDateHelpers = { addDays, STALE_DAYS }
