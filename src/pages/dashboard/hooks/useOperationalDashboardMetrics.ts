import { useMemo } from 'react'
import type { AccionDiaria } from '@/types'
import type { UserProfile } from '@/features/users/types/user.types'
import type { Priority, Status } from '@/features/catalogs/types/catalogs.types'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import {
  priorityColorFor,
  type PriorityColor,
} from '@/features/operations/utils/priorityColors'

const DAY_MS = 86_400_000
const CLOSED_FALLBACK = new Set(['hecho', 'verificado', 'cerrado', 'realizado'])
/** Cierre operativo para edad/ciclo de rojos: solo Verificado (Hecho sigue abierto). */
const VERIFIED_FALLBACK = new Set(['verificado'])
const BLOCKED_FALLBACK = new Set(['bloqueado'])

export type MetricTone = 'green' | 'yellow' | 'red' | 'neutral'
export type TrendDirection = 'up' | 'down' | 'flat'

export type DashboardTrend = {
  current: number
  previous: number
  delta: number
  direction: TrendDirection
  isGood: boolean | null
}

export type DashboardMetric = {
  value: number
  previous: number
  trend: DashboardTrend
}

export type DashboardAreaMetric = {
  area: string
  value: number
  total?: number
  actions: AccionDiaria[]
}

export type DashboardAgingBucket = {
  label: string
  min: number
  max: number | null
  count: number
  actions: AccionDiaria[]
}

export type OperationalDashboardMetrics = {
  today: string
  totalFiltered: number
  totalActions: AccionDiaria[]
  openActions: AccionDiaria[]
  closedActions: AccionDiaria[]
  redClosedActions: AccionDiaria[]
  overdueActions: AccionDiaria[]
  blockedActions: AccionDiaria[]
  redActions: AccionDiaria[]
  yellowActions: AccionDiaria[]
  greenActions: AccionDiaria[]
  redOpenActions: AccionDiaria[]
  otherOpenActions: AccionDiaria[]
  otherClosedActions: AccionDiaria[]
  dueTodayActions: AccionDiaria[]
  avgOpenAgeDays: DashboardMetric
  avgOpenAgeRedDays: DashboardMetric
  avgOpenAgeOthersDays: DashboardMetric
  avgCloseDays: DashboardMetric
  redClosedOnTimePct: DashboardMetric
  ico: DashboardMetric
  icoByArea: DashboardAreaMetric[]
  icoByUser: DashboardAreaMetric[]
  avgCloseDaysByUser: DashboardAreaMetric[]
  /** Edad abierta promedio por responsable (creación → hoy). */
  avgOpenAgeByUser: DashboardAreaMetric[]
  overdueByPriority: DashboardAreaMetric[]
  overdueByArea: DashboardAreaMetric[]
  blockedByArea: DashboardAreaMetric[]
  backlogByArea: DashboardAreaMetric[]
  complianceByArea: DashboardAreaMetric[]
  agingBuckets: DashboardAgingBucket[]
  redClosedOnTimeTarget: number
}

type Period = {
  start: string
  end: string
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function toDateOnly(value: string | null | undefined): string {
  return (value ?? '').slice(0, 10)
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const start = parseDateMs(from)
  const end = parseDateMs(to)
  if (start == null || end == null) return null
  return Math.max(0, (end - start) / DAY_MS)
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function inPeriod(action: AccionDiaria, period: Period): boolean {
  const date = action.fecha
  return date >= period.start && date <= period.end
}

function mapById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

function statusByKey(statuses: Status[]): Map<string, Status> {
  const map = new Map<string, Status>()
  for (const status of statuses) {
    map.set(clean(status.estado_key ?? status.nombre), status)
    map.set(clean(status.nombre), status)
  }
  return map
}

function statusKey(action: AccionDiaria, statusesByKey: Map<string, Status>): string {
  const status = statusesByKey.get(clean(action.estado))
  return clean(status?.estado_key ?? status?.nombre ?? action.estado)
}

function isClosed(action: AccionDiaria, statusesByKey: Map<string, Status>): boolean {
  const status = statusesByKey.get(clean(action.estado))
  return Boolean(status?.es_cierre) || CLOSED_FALLBACK.has(clean(action.estado))
}

/** Solo Verificado cierra el reloj de edad promedio de rojos; Hecho sigue abierto. */
function isVerified(action: AccionDiaria, statusesByKey: Map<string, Status>): boolean {
  return VERIFIED_FALLBACK.has(statusKey(action, statusesByKey))
}

function isBlocked(action: AccionDiaria, statusesByKey: Map<string, Status>): boolean {
  return BLOCKED_FALLBACK.has(statusKey(action, statusesByKey))
}

function priorityColorForAction(action: AccionDiaria, priorities: Priority[]): PriorityColor {
  const priority = findPriorityForAccion(action, priorities)
  return priorityColorFor(priority?.nombre ?? action.prioridad, priority?.color)
}

function isRedPriority(action: AccionDiaria, priorities: Priority[]): boolean {
  return priorityColorForAction(action, priorities) === 'rojo'
}

function areaForAction(action: AccionDiaria, usersById: Map<string, UserProfile>): string {
  return action.area?.trim() || usersById.get(action.responsable)?.area?.trim() || 'Sin area'
}

function userForAction(action: AccionDiaria, usersById: Map<string, UserProfile>): string {
  return usersById.get(action.responsable)?.nombre?.trim() || 'Sin responsable'
}

function completedAt(action: AccionDiaria): string | null {
  return action.completed_at ?? action.verified_at ?? action.updated_at ?? null
}

/** Fin del ciclo de un rojo: primera vez en Verificado. */
function verifiedAt(action: AccionDiaria): string | null {
  return action.verified_at ?? action.updated_at ?? null
}

function closedOnTime(action: AccionDiaria): boolean {
  const closed = toDateOnly(completedAt(action))
  return Boolean(closed) && closed <= action.fecha
}

function trend(current: number, previous: number, higherIsGood = true): DashboardTrend {
  const delta = round(current - previous, 1)
  const direction: TrendDirection = Math.abs(delta) < 0.1 ? 'flat' : delta > 0 ? 'up' : 'down'
  const isGood = direction === 'flat' ? null : higherIsGood ? delta > 0 : delta < 0
  return { current, previous, delta, direction, isGood }
}

function groupActions(
  actions: AccionDiaria[],
  getKey: (action: AccionDiaria) => string
): DashboardAreaMetric[] {
  const map = new Map<string, AccionDiaria[]>()
  for (const action of actions) {
    const key = getKey(action)
    map.set(key, [...(map.get(key) ?? []), action])
  }
  return [...map.entries()]
    .map(([area, grouped]) => ({ area, value: grouped.length, actions: grouped }))
    .sort((a, b) => b.value - a.value || a.area.localeCompare(b.area))
}

function valueMetric(current: number, previous: number, higherIsGood = true): DashboardMetric {
  return { value: current, previous, trend: trend(current, previous, higherIsGood) }
}

function calculateCoreMetrics(
  actions: AccionDiaria[],
  users: UserProfile[],
  priorities: Priority[],
  statuses: Status[],
  today: string
) {
  const usersById = mapById(users)
  const statusesByKey = statusByKey(statuses)
  const openActions = actions.filter((action) => !isClosed(action, statusesByKey))
  const closedActions = actions.filter((action) => isClosed(action, statusesByKey))
  const actionsByPriorityColor = {
    rojo: [] as AccionDiaria[],
    amarillo: [] as AccionDiaria[],
    verde: [] as AccionDiaria[],
  }
  for (const action of actions) {
    actionsByPriorityColor[priorityColorForAction(action, priorities)].push(action)
  }
  const redActions = actionsByPriorityColor.rojo
  /** Rojas cerradas para edad: solo Verificado (Hecho sigue contando como abierto). */
  const redClosedActions = redActions.filter((action) => isVerified(action, statusesByKey))
  const otherClosedActions = closedActions.filter((action) => !isRedPriority(action, priorities))
  const overdueActions = openActions.filter((action) => action.fecha < today)
  const blockedActions = openActions.filter((action) => isBlocked(action, statusesByKey))
  const redOpenActions = redActions.filter((action) => !isVerified(action, statusesByKey))
  const otherOpenActions = openActions.filter((action) => !isRedPriority(action, priorities))
  const dueTodayActions = openActions.filter((action) => action.fecha === today)
  const openAgeDays = (action: AccionDiaria) =>
    daysBetween(action.created_at, `${today}T00:00:00`) ?? 0
  const closeAgeDays = (action: AccionDiaria) =>
    daysBetween(action.created_at, completedAt(action)) ?? 0
  const redVerifiedAgeDays = (action: AccionDiaria) =>
    daysBetween(action.created_at, verifiedAt(action)) ?? 0
  const avgOpenAgeDays = round(avg(openActions.map(openAgeDays)))
  const avgOpenAgeRedDays = round(avg(redClosedActions.map(redVerifiedAgeDays)))
  const avgOpenAgeOthersDays = round(avg(otherClosedActions.map(closeAgeDays)))
  const avgCloseDays = round(avg(closedActions.map((action) => daysBetween(action.created_at, completedAt(action)) ?? 0)))
  const redClosedOnTime = (action: AccionDiaria) => {
    const closed = toDateOnly(verifiedAt(action))
    return Boolean(closed) && closed <= action.fecha
  }
  const redClosedOnTimePct = pct(redClosedActions.filter(redClosedOnTime).length, redClosedActions.length)
  const ico = pct(closedActions.filter(closedOnTime).length, closedActions.length)

  return {
    usersById,
    statusesByKey,
    openActions,
    closedActions,
    overdueActions,
    blockedActions,
    redActions,
    yellowActions: actionsByPriorityColor.amarillo,
    greenActions: actionsByPriorityColor.verde,
    redOpenActions,
    otherOpenActions,
    otherClosedActions,
    dueTodayActions,
    avgOpenAgeDays,
    avgOpenAgeRedDays,
    avgOpenAgeOthersDays,
    avgCloseDays,
    redClosedOnTimePct,
    ico,
  }
}

export function toneForDays(value: number): MetricTone {
  if (value <= 3) return 'green'
  if (value <= 7) return 'yellow'
  return 'red'
}

export function toneForPercent(value: number, yellow = 85, green = 95): MetricTone {
  if (value >= green) return 'green'
  if (value >= yellow) return 'yellow'
  return 'red'
}

export function useOperationalDashboardMetrics(input: {
  actions: AccionDiaria[]
  previousActions: AccionDiaria[]
  users: UserProfile[]
  priorities: Priority[]
  statuses: Status[]
  today: string
  currentPeriod: Period
  redClosedOnTimeTarget?: number
}): OperationalDashboardMetrics {
  return useMemo(() => {
    const target = input.redClosedOnTimeTarget ?? 95
    const currentPeriodActions = input.actions.filter((action) => inPeriod(action, input.currentPeriod))
    const current = calculateCoreMetrics(input.actions, input.users, input.priorities, input.statuses, input.today)
    const currentPeriodCore = calculateCoreMetrics(
      currentPeriodActions,
      input.users,
      input.priorities,
      input.statuses,
      input.today
    )
    const previous = calculateCoreMetrics(input.previousActions, input.users, input.priorities, input.statuses, input.today)
    const areaName = (action: AccionDiaria) => areaForAction(action, current.usersById)
    const priorityName = (action: AccionDiaria) =>
      findPriorityForAccion(action, input.priorities)?.nombre || action.prioridad || 'Sin prioridad'

    const closedForCompliance = currentPeriodCore.closedActions
    const committedByArea = groupActions(currentPeriodActions, areaName)
    const closedOnTimeByArea = groupActions(closedForCompliance.filter(closedOnTime), areaName)
    const onTimeMap = new Map(closedOnTimeByArea.map((item) => [item.area, item]))
    const complianceByArea = committedByArea
      .map((item) => {
        const onTime = onTimeMap.get(item.area)?.value ?? 0
        return { ...item, value: pct(onTime, item.actions.length), total: item.actions.length }
      })
      .sort((a, b) => b.value - a.value || a.area.localeCompare(b.area))

    const icoByArea = groupActions(currentPeriodCore.closedActions, areaName)
      .map((item) => ({ ...item, value: pct(item.actions.filter(closedOnTime).length, item.actions.length), total: item.actions.length }))
      .sort((a, b) => b.value - a.value || a.area.localeCompare(b.area))

    const icoByUser = groupActions(currentPeriodCore.closedActions, (action) => userForAction(action, current.usersById))
      .map((item) => ({ ...item, value: pct(item.actions.filter(closedOnTime).length, item.actions.length), total: item.actions.length }))
      .sort((a, b) => b.value - a.value || a.area.localeCompare(b.area))

    const avgCloseDaysByUser = groupActions(
      currentPeriodCore.closedActions,
      (action) => userForAction(action, current.usersById)
    )
      .map((item) => {
        const ages = item.actions
          .map((action) => daysBetween(action.created_at, completedAt(action)))
          .filter((value): value is number => value != null)
        return {
          ...item,
          value: round(avg(ages)),
          total: item.actions.length,
        }
      })
      .filter((item) => (item.total ?? 0) > 0)
      .sort((a, b) => a.value - b.value || a.area.localeCompare(b.area))

    const avgOpenAgeByUser = groupActions(
      current.openActions,
      (action) => userForAction(action, current.usersById)
    )
      .map((item) => {
        const ages = item.actions.map(
          (action) => daysBetween(action.created_at, `${input.today}T00:00:00`) ?? 0
        )
        return {
          ...item,
          value: round(avg(ages)),
          total: item.actions.length,
        }
      })
      .filter((item) => (item.total ?? 0) > 0)
      .sort((a, b) => b.value - a.value || a.area.localeCompare(b.area))

    const agingBuckets: DashboardAgingBucket[] = [
      { label: '0-2 dias', min: 0, max: 2, count: 0, actions: [] },
      { label: '3-5 dias', min: 3, max: 5, count: 0, actions: [] },
      { label: '6-10 dias', min: 6, max: 10, count: 0, actions: [] },
      { label: '+10 dias', min: 11, max: null, count: 0, actions: [] },
    ]
    for (const action of current.openActions) {
      const age = Math.floor(daysBetween(action.created_at, `${input.today}T00:00:00`) ?? 0)
      const bucket = agingBuckets.find((item) => age >= item.min && (item.max == null || age <= item.max)) ?? agingBuckets[0]
      bucket.actions.push(action)
      bucket.count += 1
    }

    return {
      today: input.today,
      totalFiltered: input.actions.length,
      totalActions: input.actions,
      openActions: current.openActions,
      closedActions: currentPeriodCore.closedActions,
      redClosedActions: currentPeriodActions.filter(
        (action) =>
          isRedPriority(action, input.priorities) && isVerified(action, current.statusesByKey)
      ),
      otherClosedActions: currentPeriodCore.closedActions.filter(
        (action) => !isRedPriority(action, input.priorities)
      ),
      overdueActions: current.overdueActions,
      blockedActions: current.blockedActions,
      redActions: current.redActions,
      yellowActions: current.yellowActions,
      greenActions: current.greenActions,
      redOpenActions: current.redOpenActions,
      otherOpenActions: current.otherOpenActions,
      dueTodayActions: current.dueTodayActions,
      avgOpenAgeDays: valueMetric(current.avgOpenAgeDays, previous.avgOpenAgeDays, false),
      avgOpenAgeRedDays: valueMetric(
        currentPeriodCore.avgOpenAgeRedDays,
        previous.avgOpenAgeRedDays,
        false
      ),
      avgOpenAgeOthersDays: valueMetric(
        currentPeriodCore.avgOpenAgeOthersDays,
        previous.avgOpenAgeOthersDays,
        false
      ),
      avgCloseDays: valueMetric(currentPeriodCore.avgCloseDays, previous.avgCloseDays, false),
      redClosedOnTimePct: valueMetric(currentPeriodCore.redClosedOnTimePct, previous.redClosedOnTimePct, true),
      ico: valueMetric(currentPeriodCore.ico, previous.ico, true),
      icoByArea,
      icoByUser,
      avgCloseDaysByUser,
      avgOpenAgeByUser,
      overdueByPriority: groupActions(current.overdueActions, priorityName),
      overdueByArea: groupActions(current.overdueActions, areaName),
      blockedByArea: groupActions(current.blockedActions, areaName),
      backlogByArea: groupActions(current.openActions, areaName),
      complianceByArea,
      agingBuckets,
      redClosedOnTimeTarget: target,
    }
  }, [input])
}
