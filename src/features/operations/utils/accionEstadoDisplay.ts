import type { AccionDiaria, ActionStatus } from '@/types'
import { isEnRetraso } from './accionUtils'

/** Etiquetas legibles de estado (mismo criterio que kanban y tablero de control). */
export const ACCION_ESTADO_LABELS: Record<ActionStatus, string> = {
  Pendiente: 'Pendiente',
  Hoy: 'Hoy',
  En_Ejecucion: 'En ejecución',
  Bloqueado: 'Bloqueado',
  Retraso: 'Retraso',
  Hecho: 'Hecho',
  Verificado: 'Verificado',
}

/** Estado visible: incluye «Retraso» calculado cuando aplica la fecha límite. */
export function getAccionDisplayEstado(accion: AccionDiaria): ActionStatus {
  return isEnRetraso(accion) ? 'Retraso' : accion.estado
}

export function accionEstadoLabel(estado: ActionStatus): string {
  return ACCION_ESTADO_LABELS[estado] ?? estado
}

/** Clases de badge alineadas a columnas del kanban. */
export function accionEstadoBadgeClass(estado: ActionStatus): string {
  const map: Record<ActionStatus, string> = {
    Pendiente: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/20',
    Hoy: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/25',
    En_Ejecucion: 'bg-blue-500/10 text-blue-800 dark:text-blue-300 ring-1 ring-blue-500/25',
    Bloqueado: 'bg-red-500/10 text-red-800 dark:text-red-300 ring-1 ring-red-500/25',
    Retraso: 'bg-orange-500/10 text-orange-800 dark:text-orange-300 ring-1 ring-orange-500/25',
    Hecho: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/25',
    Verificado: 'bg-violet-500/10 text-violet-800 dark:text-violet-300 ring-1 ring-violet-500/25',
  }
  return map[estado] ?? 'bg-muted text-muted-foreground ring-1 ring-border/60'
}
