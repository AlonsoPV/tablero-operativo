/**
 * Cálculo de métricas del dashboard a partir de lista de acciones (spec §4.1).
 */

import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import {
  isCorporateBlocked,
  isCorporateOpen,
  isCorporateOverdue,
} from '@/features/metrics/corporateActionMetrics'
import { priorityColorFor } from './priorityColors'
import { findPriorityForAccion } from './resolveAccionPrioridad'

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
  /** Edad promedio en días (todas las acciones abiertas). */
  promedioAperturaTotalDias: number
  /** Edad promedio en días (solo rojas/críticas abiertas). */
  promedioAperturaRojosDias: number
}

/** Para edad de rojos: solo Verificado cierra; Hecho sigue abierto. */
const ESTADOS_VERIFICADOS = new Set(['Verificado'])

function isAccionRoja(accion: AccionDiaria, priorities: Priority[]): boolean {
  const priority = findPriorityForAccion(accion, priorities)
  return priorityColorFor(priority?.nombre ?? accion.prioridad, priority?.color) === 'rojo'
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
  const bloqueadas = acciones.filter((a) => isCorporateBlocked(a)).length
  const retraso = acciones.filter((a) => isCorporateOverdue(a)).length
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
  const open = acciones.filter((accion) => isCorporateOpen(accion))
  const vencidas = open.filter((accion) => isCorporateOverdue(accion))
  /** Rojas aún no verificadas (Hecho sigue contando para edad). */
  const openRojas = acciones.filter(
    (accion) => !ESTADOS_VERIFICADOS.has(accion.estado) && isAccionRoja(accion, priorities)
  )

  return {
    rojos: openRojas.length,
    vencidas: vencidas.length,
    vencidasRojas: vencidas.filter((accion) => isAccionRoja(accion, priorities)).length,
    bloqueadas: open.filter((accion) => isCorporateBlocked(accion)).length,
    abiertas: open.length,
    promedioAperturaTotalDias: promedioAperturaDias(open),
    promedioAperturaRojosDias: promedioAperturaDias(openRojas),
  }
}
