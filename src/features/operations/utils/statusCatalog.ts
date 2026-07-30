import type { ActionStatus } from '@/types'
import type { Status } from '@/features/catalogs/types/catalogs.types'
import { accionEstadoLabel } from './accionEstadoDisplay'

export const STATUS_KEYS: ActionStatus[] = [
  'Pendiente',
  'Hoy',
  'En_Ejecucion',
  'Bloqueado',
  'Retraso',
  'Hecho',
  'Verificado',
]

const NOMBRE_TO_KEY: Record<string, ActionStatus> = {
  pendiente: 'Pendiente',
  asignado: 'Pendiente',
  hoy: 'Hoy',
  en_ejecucion: 'En_Ejecucion',
  'en ejecucion': 'En_Ejecucion',
  'en ejecución': 'En_Ejecucion',
  enproceso: 'En_Ejecucion',
  'en proceso': 'En_Ejecucion',
  bloqueado: 'Bloqueado',
  retraso: 'Retraso',
  vencido: 'Retraso',
  hecho: 'Hecho',
  terminado: 'Hecho',
  realizado: 'Hecho',
  'por verificar': 'Hecho',
  porverificar: 'Hecho',
  verificado: 'Verificado',
  validacion: 'Verificado',
  validación: 'Verificado',
}

function normalizeStatusNombre(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Infiere la clave interna del kanban a partir de un nombre visible del catálogo. */
export function inferStatusCatalogKeyFromNombre(nombre: string): ActionStatus | null {
  const trimmed = nombre.trim()
  if (STATUS_KEYS.includes(trimmed as ActionStatus)) return trimmed as ActionStatus

  const normalized = normalizeStatusNombre(trimmed)
  if (NOMBRE_TO_KEY[normalized]) return NOMBRE_TO_KEY[normalized]

  const underscored = normalized.replace(/\s+/g, '_')
  if (NOMBRE_TO_KEY[underscored]) return NOMBRE_TO_KEY[underscored]

  const compact = normalized.replace(/[^a-z0-9]+/g, '')
  if (NOMBRE_TO_KEY[compact]) return NOMBRE_TO_KEY[compact]

  return null
}

export function getStatusCatalogKey(status: Status): ActionStatus | null {
  if (status.estado_key && STATUS_KEYS.includes(status.estado_key as ActionStatus)) {
    return status.estado_key as ActionStatus
  }
  if (STATUS_KEYS.includes(status.nombre as ActionStatus)) {
    return status.nombre as ActionStatus
  }
  return inferStatusCatalogKeyFromNombre(status.nombre)
}

export function statusCatalogByKey(statuses: Status[]): Partial<Record<ActionStatus, Status>> {
  const map: Partial<Record<ActionStatus, Status>> = {}
  const sorted = [...statuses].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1
    return b.updated_at.localeCompare(a.updated_at)
  })

  for (const status of sorted) {
    const key = getStatusCatalogKey(status)
    if (key && !map[key]) map[key] = status
  }
  return map
}

export function findStatusCatalogRow(
  statuses: Status[],
  statusKey: ActionStatus
): Status | undefined {
  return statusCatalogByKey(statuses)[statusKey]
}

/** Si hay catálogo cargado, respeta `activo`; sin catálogo mantiene compatibilidad legacy. */
export function isActionStatusActiveInCatalog(statuses: Status[], statusKey: ActionStatus): boolean {
  if (statuses.length === 0) return true
  const row = findStatusCatalogRow(statuses, statusKey)
  return row ? row.activo : false
}

export function statusCatalogLabel(status: ActionStatus, map: Partial<Record<ActionStatus, Status>>): string {
  return map[status]?.nombre || accionEstadoLabel(status)
}

export function statusCatalogDescription(
  status: ActionStatus,
  map: Partial<Record<ActionStatus, Status>>,
  fallback: string
): string {
  return map[status]?.descripcion || fallback
}

export function statusCatalogColor(status: ActionStatus, map: Partial<Record<ActionStatus, Status>>): string | null {
  return map[status]?.color ?? null
}

export function orderedActionStatuses(statuses: Status[], fallbackOrder: ActionStatus[]): ActionStatus[] {
  const indexed = new Map(fallbackOrder.map((status, index) => [status, index]))
  const catalogByKey = new Map<ActionStatus, Status>()

  for (const status of statuses) {
    const key = getStatusCatalogKey(status)
    if (key) catalogByKey.set(key, status)
  }

  const ordered = [...catalogByKey.entries()]
    .filter(([, status]) => status.activo)
    .sort(
      (a, b) =>
        a[1].orden - b[1].orden ||
        (indexed.get(a[0]) ?? 99) - (indexed.get(b[0]) ?? 99)
    )
    .map(([key]) => key)

  // Solo estados sin fila en catálogo (legacy); no reinsertar estatus desactivados.
  for (const status of fallbackOrder) {
    if (!ordered.includes(status) && !catalogByKey.has(status)) {
      ordered.push(status)
    }
  }

  return ordered
}

export function activeEstadoFilterOptions(
  statuses: Status[],
  fallbackOrder: ActionStatus[],
  allLabel = 'Todos los estados'
): { value: string; label: string }[] {
  const statusByKey = statusCatalogByKey(statuses)
  return [
    { value: 'all', label: allLabel },
    ...orderedActionStatuses(statuses, fallbackOrder).map((status) => ({
      value: status,
      label: statusCatalogLabel(status, statusByKey),
    })),
  ]
}

export function hexToRgba(hex: string | null | undefined, alpha: number): string | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
