import { todayWallClockCDMX } from '@/lib/dateUtils'
import type { AccionDiaria, ActionStatus } from '@/types'

const ESTADOS_CERRADOS: ActionStatus[] = ['Hecho', 'Verificado']

/**
 * Código público `emx_XXXXX` (5 dígitos) derivado del UUID.
 * Para UUID estándar se usan los últimos 12 hex del id (mismo criterio que el seed demo: 00001…0000a).
 */
export function accionIdPublico(id: string): string {
  const hex = id.replace(/-/g, '').toLowerCase()
  if (/^[0-9a-f]{32}$/.test(hex)) {
    const last12 = hex.slice(20)
    const n = BigInt('0x' + last12) % 100000n
    return `emx_${String(n).padStart(5, '0')}`
  }
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  const n = Math.abs(h) % 100000
  return `emx_${String(n).padStart(5, '0')}`
}

/** @deprecated Usar `accionIdPublico` (mismo comportamiento: `emx_XXXXX`). */
export const accionIdCorto = accionIdPublico

export type FechaCompromisoSlot = 'past' | 'today' | 'future'

function normalizeFechaCompromiso(fecha: string): string {
  return fecha.trim().slice(0, 10)
}

/** Compara la fecha compromiso (YYYY-MM-DD) contra hoy en Ciudad de México (reloj real). */
export function getFechaCompromisoSlot(fecha: string): FechaCompromisoSlot {
  const ymd = normalizeFechaCompromiso(fecha)
  const today = todayWallClockCDMX()
  if (ymd < today) return 'past'
  if (ymd > today) return 'future'
  return 'today'
}

function isAutoSyncEligible(accion: AccionDiaria): boolean {
  return !ESTADOS_CERRADOS.includes(accion.estado) && accion.estado !== 'Bloqueado'
}

/**
 * Retraso si la fecha compromiso ya pasó (día anterior en CDMX).
 * El mismo día cuenta como Hoy aunque la hora límite ya haya pasado.
 */
export function isEnRetraso(a: AccionDiaria): boolean {
  if (ESTADOS_CERRADOS.includes(a.estado)) return false
  return getFechaCompromisoSlot(a.fecha) === 'past'
}

/** Estado objetivo según fecha compromiso en CDMX; null si no aplica cambio automático. */
export function getAutoEstadoPorFechaCompromiso(accion: AccionDiaria): ActionStatus | null {
  if (!isAutoSyncEligible(accion)) return null
  const slot = getFechaCompromisoSlot(accion.fecha)
  if (slot === 'past') return accion.estado === 'Retraso' ? null : 'Retraso'
  if (slot === 'today') {
    if (accion.estado === 'Hoy' || accion.estado === 'En_Ejecucion') return null
    return 'Hoy'
  }
  if (accion.estado === 'Retraso' || accion.estado === 'Hoy') return 'Pendiente'
  return null
}

/** Columna Kanban efectiva según fecha compromiso (CDMX). */
export function getAccionKanbanColumn(accion: AccionDiaria): ActionStatus {
  if (accion.estado === 'Bloqueado') return 'Bloqueado'
  if (ESTADOS_CERRADOS.includes(accion.estado)) return accion.estado
  const target = getAutoEstadoPorFechaCompromiso(accion)
  if (target) return target
  return accion.estado
}
