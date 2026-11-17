/**
 * Indicadores rápidos del módulo OKR (Avance / En ruta / En riesgo / Al día).
 * Reutiliza krProgress + expectedPeriodProgress; no inventa umbrales de días.
 */
import {
  expectedPeriodProgress,
  krProgress,
  objectivePaceStatus,
  objectiveProgress,
  type CheckIn,
  type KeyResult,
  type Objective,
  type OkrPaceStatus,
} from './model'
import { measurementsFor } from './reporting'

export type OkrQuickFocus = 'avance' | 'en_ruta' | 'en_riesgo' | 'al_dia' | 'cronograma'

export type OkrQuickIndicatorMetrics = {
  /** Promedio de avance medible (objetivos con KRs). */
  averageProgress: number | null
  /** % KRs medibles en ritmo vs trayectoria del periodo. */
  onTrackShare: number | null
  /** Conteo de KRs medibles bajo ritmo. null si no hay muestra evaluable. */
  atRiskCount: number | null
  /** % KRs con seguimiento en el periodo del objetivo. */
  upToDateShare: number | null
  /** Ids de KR por criterio (para quickFocus). */
  ids: {
    measurable: string[]
    onTrack: string[]
    atRisk: string[]
    upToDate: string[]
    stale: string[]
  }
}

export function krPaceStatus(
  progress: number | null,
  objective: Pick<Objective, 'activo' | 'start_date' | 'end_date'>,
  today: string
): OkrPaceStatus {
  return objectivePaceStatus(objective, progress, today)
}

/** KR evaluable para ritmo: progreso medible + periodo activo con expected %. */
export function isKrPaceEvaluable(
  progress: number | null,
  objective: Pick<Objective, 'activo' | 'start_date' | 'end_date'> | undefined,
  today: string
): boolean {
  if (!objective || progress == null) return false
  return expectedPeriodProgress(objective, today) != null
}

/**
 * Al día sin inventar TTL:
 * - métrica automática → al día
 * - manual → al día si hay check-in (≠ línea base) con fecha ≥ start_date del objetivo
 * - manual sin start_date → null (Sin datos en el agregado)
 */
export function isKrUpToDate(
  kr: Pick<KeyResult, 'id' | 'metric_type'>,
  objective: Pick<Objective, 'start_date'> | undefined,
  checkIns: CheckIn[]
): boolean | null {
  if (!kr.metric_type.startsWith('manual:')) return true
  if (!objective?.start_date) return null
  const history = measurementsFor(checkIns, kr.id).filter(
    (c) => c.note !== 'Línea base inicial'
  )
  if (!history.length) return false
  const start = objective.start_date
  return history.some((c) => c.created_at.slice(0, 10) >= start)
}

export function okrQuickIndicatorMetrics(input: {
  objectives: Objective[]
  keyResults: KeyResult[]
  checkIns: CheckIn[]
  today: string
}): OkrQuickIndicatorMetrics {
  const { objectives, keyResults, checkIns, today } = input
  const byId = new Map(objectives.map((o) => [o.id, o]))

  const averages = objectives
    .map((o) => objectiveProgress(keyResults.filter((k) => k.okr_id === o.id)))
    .filter((value): value is number => value != null)
  const averageProgress = averages.length
    ? averages.reduce((sum, value) => sum + value, 0) / averages.length
    : null

  const measurable: string[] = []
  const onTrack: string[] = []
  const atRisk: string[] = []
  const upToDate: string[] = []
  const stale: string[] = []
  let paceEvaluable = 0
  let freshnessKnown = 0
  let freshnessOk = 0

  for (const kr of keyResults) {
    const objective = byId.get(kr.okr_id)
    const progress = krProgress(kr)
    if (progress != null) measurable.push(kr.id)

    if (isKrPaceEvaluable(progress, objective, today) && objective) {
      paceEvaluable += 1
      const pace = krPaceStatus(progress, objective, today)
      if (pace === 'en_ritmo') onTrack.push(kr.id)
      if (pace === 'bajo_ritmo') atRisk.push(kr.id)
    }

    const fresh = isKrUpToDate(kr, objective, checkIns)
    if (fresh === true) {
      freshnessKnown += 1
      freshnessOk += 1
      upToDate.push(kr.id)
    } else if (fresh === false) {
      freshnessKnown += 1
      stale.push(kr.id)
    }
  }

  return {
    averageProgress,
    onTrackShare: paceEvaluable > 0 ? (onTrack.length / paceEvaluable) * 100 : null,
    atRiskCount: paceEvaluable > 0 ? atRisk.length : null,
    upToDateShare: freshnessKnown > 0 ? (freshnessOk / freshnessKnown) * 100 : null,
    ids: {
      measurable,
      onTrack,
      atRisk,
      upToDate,
      stale,
    },
  }
}

export function krIdsForQuickFocus(
  focus: OkrQuickFocus | null,
  metrics: OkrQuickIndicatorMetrics
): string[] | null {
  if (!focus || focus === 'cronograma') return null
  if (focus === 'avance') return metrics.ids.measurable
  if (focus === 'en_ruta') return metrics.ids.onTrack
  if (focus === 'en_riesgo') return metrics.ids.atRisk
  if (focus === 'al_dia') return [...metrics.ids.upToDate, ...metrics.ids.stale]
  return null
}

export function formatQuickIndicatorValue(
  value: number | null,
  kind: 'percent' | 'count' | 'days',
  daysLeft?: number | null
): string {
  if (kind === 'days') {
    if (daysLeft == null) return 'Sin datos'
    if (daysLeft <= 0) return 'Finalizado'
    return `${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`
  }
  if (value == null || !Number.isFinite(value)) return 'Sin datos'
  if (kind === 'count') return String(Math.round(value))
  return `${Math.round(value)}%`
}
