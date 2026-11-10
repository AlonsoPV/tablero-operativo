import { getAppNow } from '../../lib/clock.js'
import { getAccionKanbanColumn } from '../operations/utils/accionUtils.js'
import type { AccionDiaria, ActionStatus } from '../../types'

export const CORPORATE_TIMEZONE = 'America/Mexico_City'
export const CORPORATE_POPULATION = 'acciones_corporativas'
/** Tope de filas abiertas que carga el resumen del agente. */
export const CORPORATE_OPEN_READ_LIMIT = 400

export type CorporateMetricScope = 'organizacion' | 'area' | 'responsable' | 'periodo'

export type CorporateActionLike = {
  id: string
  estado: string
  fecha: string
  hora_limite?: string | null
  area?: string | null
}

const CLOSED = new Set(['Hecho', 'Verificado'])

export function readWasTruncated(loadedCount: number, limit: number): boolean {
  return loadedCount >= limit
}

export function isCorporateOpen(action: { estado: string }): boolean {
  return !CLOSED.has(action.estado)
}

export function isPendingVerification(action: { estado: string }): boolean {
  return action.estado === 'Hecho'
}

export function isCorporateVerified(action: { estado: string }): boolean {
  return action.estado === 'Verificado'
}

export function isCorporateBlocked(action: { estado: string }): boolean {
  return isCorporateOpen(action) && action.estado === 'Bloqueado'
}

function asAccion(action: CorporateActionLike): AccionDiaria {
  return {
    id: action.id,
    estado: action.estado as ActionStatus,
    fecha: action.fecha.slice(0, 10),
    hora_limite: action.hora_limite ?? '23:59',
  } as AccionDiaria
}

/** Abierta y en columna Retraso. Bloqueado no cuenta como vencida. */
export function isCorporateOverdue(action: CorporateActionLike, now = getAppNow()): boolean {
  if (!action.fecha || !isCorporateOpen(action) || isCorporateBlocked(action)) return false
  return getAccionKanbanColumn(asAccion(action), now) === 'Retraso'
}

export function uniqueCorporateActions<T extends { id: string }>(actions: T[]): T[] {
  const byId = new Map<string, T>()
  for (const action of actions) byId.set(action.id, action)
  return [...byId.values()]
}

export type CorporateActionSummary = {
  population: typeof CORPORATE_POPULATION
  timezone: typeof CORPORATE_TIMEZONE
  scope: CorporateMetricScope
  total: number
  open: number
  overdue: number
  blocked: number
  pendingVerification: number
  verified: number
  dueToday: number
  truncated: boolean
}

export function summarizeCorporateActions(
  actions: CorporateActionLike[],
  options: {
    scope: CorporateMetricScope
    today: string
    now?: Date
    truncated?: boolean
  }
): CorporateActionSummary {
  const now = options.now ?? getAppNow()
  const unique = uniqueCorporateActions(actions)
  const open = unique.filter((action) => isCorporateOpen(action))
  return {
    population: CORPORATE_POPULATION,
    timezone: CORPORATE_TIMEZONE,
    scope: options.scope,
    total: unique.length,
    open: open.length,
    overdue: unique.filter((action) => isCorporateOverdue(action, now)).length,
    blocked: unique.filter((action) => isCorporateBlocked(action)).length,
    pendingVerification: unique.filter((action) => isPendingVerification(action)).length,
    verified: unique.filter((action) => isCorporateVerified(action)).length,
    dueToday: open.filter((action) => action.fecha.slice(0, 10) === options.today).length,
    truncated: options.truncated === true,
  }
}

export function countByArea(
  actions: CorporateActionLike[]
): Array<{ area: string; count: number }> {
  const map = new Map<string, number>()
  for (const action of uniqueCorporateActions(actions)) {
    const area = action.area?.trim() || 'Sin área'
    map.set(area, (map.get(area) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area, 'es'))
}

export function formatCorporateScopeLabel(input: {
  area?: string | null
  responsable?: string | null
  periodStart?: string | null
  periodEnd?: string | null
}): string {
  const area = input.area?.trim() || 'todas las áreas'
  const responsable = input.responsable?.trim() || 'todos los responsables'
  const period =
    input.periodStart && input.periodEnd
      ? `${input.periodStart} a ${input.periodEnd}`
      : 'sin período explícito'
  return `Acciones corporativas · horario CDMX · ${area} · ${responsable} · ${period}`
}
