import type { CatalogKpiMeasurement } from '../types/kpi.types'

/**
 * Últimos `maxPoints` valores medidos, orden **cronológico** (izquierda → derecha).
 * El batch de mediciones suele venir **más reciente primero**.
 */
export function lastMeasurementValuesForSparkline(
  measurements: CatalogKpiMeasurement[] | undefined,
  maxPoints = 6
): number[] {
  if (!measurements?.length) return []
  const newestFirst = measurements.slice(0, maxPoints)
  const oldestFirst = [...newestFirst].reverse()
  return oldestFirst.map((m) => m.valor)
}
