/**
 * Cálculo de métricas del dashboard a partir de lista de acciones (spec §4.1).
 */

import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { priorityColorFor } from './priorityColors'
import { findPriorityForAccion } from './resolveAccionPrioridad'
import { getAccionKanbanColumn } from './accionUtils'

export interface MetricasAcciones {
  total: number
  completadas: number
  bloqueadas: number
  retraso: number
  eficienciaPorcentaje: number
}

export type KanbanHealthMetrics = {
  rojos: number
  /** Acciones abiertas en columna/estatus Retraso (misma regla que el Kanban). */
  vencidas: number
  /** Subconjunto de Retraso con prioridad roja/crítica. */
  vencidasRojas: number
  bloqueadas: number
  abiertas: number
}

const ESTADOS_CERRADOS = new Set(['Hecho', 'Verificado'])

function isAccionRoja(accion: AccionDiaria, priorities: Priority[]): boolean {
  const priority = findPriorityForAccion(accion, priorities)
  return priorityColorFor(priority?.nombre ?? accion.prioridad, priority?.color) === 'rojo'
}

function isEnColumnaRetraso(accion: AccionDiaria): boolean {
  return getAccionKanbanColumn(accion) === 'Retraso'
}

export function metricasFromAcciones(acciones: AccionDiaria[]): MetricasAcciones {
  const total = acciones.length
  const completadas = acciones.filter((a) =>
    a.estado === 'Hecho' || a.estado === 'Verificado'
  ).length
  const bloqueadas = acciones.filter((a) => a.estado === 'Bloqueado').length
  const retraso = acciones.filter((a) => isEnColumnaRetraso(a)).length
  const eficienciaPorcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0

  return {
    total,
    completadas,
    bloqueadas,
    retraso,
    eficienciaPorcentaje,
  }
}

/** Resumen operativo para las tarjetas del Kanban corporativo / por equipos. */
export function kanbanHealthFromAcciones(
  acciones: AccionDiaria[],
  priorities: Priority[] = []
): KanbanHealthMetrics {
  const open = acciones.filter((accion) => !ESTADOS_CERRADOS.has(accion.estado))
  const vencidas = open.filter((accion) => isEnColumnaRetraso(accion))

  return {
    rojos: open.filter((accion) => isAccionRoja(accion, priorities)).length,
    vencidas: vencidas.length,
    vencidasRojas: vencidas.filter((accion) => isAccionRoja(accion, priorities)).length,
    bloqueadas: open.filter((accion) => accion.estado === 'Bloqueado').length,
    abiertas: open.length,
  }
}
