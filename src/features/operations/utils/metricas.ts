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
  /** Promedio de días abiertas (todas las abiertas). */
  promedioAperturaTotalDias: number
  /** Promedio de días abiertas (solo rojas abiertas). */
  promedioAperturaRojosDias: number
}

const ESTADOS_CERRADOS = new Set(['Hecho', 'Verificado'])

function isAccionRoja(accion: AccionDiaria, priorities: Priority[]): boolean {
  const priority = findPriorityForAccion(accion, priorities)
  return priorityColorFor(priority?.nombre ?? accion.prioridad, priority?.color) === 'rojo'
}

function isEnColumnaRetraso(accion: AccionDiaria): boolean {
  return getAccionKanbanColumn(accion) === 'Retraso'
}

function promedioAperturaDias(acciones: AccionDiaria[]): number {
  if (acciones.length === 0) return 0
  const now = Date.now()
  const total = acciones.reduce((acc, accion) => {
    const started = Date.parse(accion.created_at ?? '')
    if (!Number.isFinite(started)) return acc
    return acc + Math.max(0, (now - started) / 86_400_000)
  }, 0)
  return Math.round((total / acciones.length) * 10) / 10
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
  const openRojas = open.filter((accion) => isAccionRoja(accion, priorities))

  return {
    rojos: openRojas.length,
    vencidas: vencidas.length,
    vencidasRojas: vencidas.filter((accion) => isAccionRoja(accion, priorities)).length,
    bloqueadas: open.filter((accion) => accion.estado === 'Bloqueado').length,
    abiertas: open.length,
    promedioAperturaTotalDias: promedioAperturaDias(open),
    promedioAperturaRojosDias: promedioAperturaDias(openRojas),
  }
}
