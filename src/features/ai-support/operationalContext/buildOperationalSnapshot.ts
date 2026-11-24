import { buildBoardAssistantContext } from '@/features/ai-support/buildBoardAssistantContext'
import {
  isCorporateBlocked,
  isCorporateOpen,
  isCorporateOverdue,
} from '@/features/metrics/corporateActionMetrics'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import type { OkrData } from '@/features/okrs/model'
import type { AccionDiaria } from '@/types'
import type { OperationalActionItem, OperationalSnapshot } from './types'

const STALE_DAYS = 3
const MAX_MINE = 40
const MAX_CREATED = 40
const MAX_BOARD = 60
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

function dueBucket(
  action: AccionDiaria,
  today: string,
  now: Date
): OperationalActionItem['dueBucket'] {
  if (isCorporateOverdue(action, now)) return 'overdue'
  if (!action.fecha) return 'unknown'
  if (action.fecha === today) return 'today'
  const weekEnd = addDays(today, 7)
  if (action.fecha <= weekEnd && action.fecha > today) return 'week'
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
  usuarioId: string,
  nameById?: Record<string, string>
): OperationalActionItem {
  const responsableId = action.responsable || ''
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
    dueBucket: dueBucket(action, today, new Date(nowMs)),
    mine: action.responsable === usuarioId,
    createdByMe: action.created_by === usuarioId,
    responsableId,
    responsableNombre: (responsableId && nameById?.[responsableId]) || '',
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
  const okrLinked = (item: OperationalActionItem) => (item.esOkr || item.okrImpactado ? 0 : 1)
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    const okr = okrLinked(a) - okrLinked(b)
    if (okr !== 0) return okr
    return `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`)
  })
}

function isOpen(action: AccionDiaria) {
  return isCorporateOpen(action)
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
  listsTruncated?: boolean
  priorities: Priority[]
  okrData: OkrData | null | undefined
  today: string
  fetchedAt?: string
  nowMs?: number
  /** Mapa usuarios.id → nombre para filtrar «acciones de Jorge». */
  usuarioNombreById?: Record<string, string>
}): OperationalSnapshot {
  const nowMs = input.nowMs ?? Date.now()
  const now = new Date(nowMs)
  const fetchedAt = input.fetchedAt ?? new Date(nowMs).toISOString()
  const names = input.usuarioNombreById
  const open = input.openActions.filter(isOpen)
  // Personal = responsable; board-wide solo con permiso. Antes counts usaba el tablero y
  // la lista solo "mias", por eso "9 en rojo" con "Mostrando 3 de 3".
  const mineOpen = open.filter((action) => action.responsable === input.usuarioId)
  const createdOpen = open.filter((action) => action.created_by === input.usuarioId)
  const scopeActions = input.seesAllBoard ? open : mineOpen

  const weekEnd = addDays(input.today, 7)
  const mineOverdue = mineOpen.filter((a) => isCorporateOverdue(a, now))
  const mineDueThisWeek = mineOpen.filter(
    (a) =>
      !isCorporateOverdue(a, now) &&
      a.fecha &&
      a.fecha >= input.today &&
      a.fecha <= weekEnd
  )
  const mineBlocked = mineOpen.filter((a) => isCorporateBlocked(a))
  const mineRed = mineOpen.filter(
    (a) =>
      isCorporateOverdue(a, now) ||
      a.estado === 'Retraso' ||
      actionColor(a, input.priorities) === 'rojo'
  )
  const mineStale = mineOpen.filter((a) => isStale(a, nowMs))
  const mineTaggedOkr = mineOpen.filter((a) => a.es_okr === true)

  const asItem = (a: AccionDiaria) =>
    toItem(a, input.priorities, input.today, nowMs, input.usuarioId, names)

  const pendingVerification = (input.pendingVerificationActions ?? [])
    .filter((a) => isPendingVerification(a, input.usuarioId))
    .map(asItem)

  const teamPool = input.seesAllBoard
    ? open.filter((a) => a.responsable !== input.usuarioId)
    : []
  const teamOverdue = teamPool.filter((a) => isCorporateOverdue(a, now))
  const teamBlocked = teamPool.filter((a) => isCorporateBlocked(a))
  const teamHot = sortHot(
    teamPool
      .filter(
        (a) =>
          isCorporateOverdue(a, now) ||
          isCorporateBlocked(a) ||
          actionColor(a, input.priorities) === 'rojo' ||
          isStale(a, nowMs)
      )
      .map(asItem)
  ).slice(0, MAX_TEAM)

  const mineItems = sortHot(mineOpen.map(asItem))
  const createdItems = sortHot(createdOpen.map(asItem))
  const boardItems = input.seesAllBoard ? sortHot(scopeActions.map(asItem)) : mineItems
  const mine = mineItems.slice(0, MAX_MINE)
  const created = createdItems.slice(0, MAX_CREATED)
  const boardOpenItems = boardItems.slice(0, MAX_BOARD)

  const board = buildBoardAssistantContext(
    scopeActions,
    input.priorities,
    input.canSeeOkrs ? input.okrData : null,
    input.today,
    now
  )

  const truncated =
    input.listsTruncated === true ||
    mineOpen.length > MAX_MINE ||
    createdOpen.length > MAX_CREATED ||
    (input.seesAllBoard && scopeActions.length > MAX_BOARD) ||
    input.openActions.length >= 1000 ||
    (input.pendingVerificationActions?.length ?? 0) >= 40

  return {
    fetchedAt,
    today: input.today,
    truncated,
    viewer: {
      usuarioId: input.usuarioId,
      rol: input.rol,
      areas: input.areas.filter(Boolean),
      scope: input.seesAllBoard ? 'board' : 'own',
      canSeeOkrs: input.canSeeOkrs,
      canSeeTeam: input.seesAllBoard,
    },
    counts: {
      open: mineOpen.length,
      overdue: mineOverdue.length,
      dueThisWeek: mineDueThisWeek.length,
      blocked: mineBlocked.length,
      red: mineRed.length,
      stale: mineStale.length,
      pendingVerification: pendingVerification.length,
      taggedOkr: mineTaggedOkr.length,
      createdOpen: createdOpen.length,
      boardOpen: scopeActions.length,
      teamOverdue: teamOverdue.length,
      teamBlocked: teamBlocked.length,
    },
    mine,
    created,
    boardOpenItems,
    pendingVerification: sortHot(pendingVerification).slice(0, MAX_VERIFY),
    teamHot,
    board,
  }
}

export const __operationalDateHelpers = { addDays, STALE_DAYS }
