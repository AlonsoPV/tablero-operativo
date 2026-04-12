import { getAppTimeMs } from '@/lib/clock'
import type { GlobalScoreSnapshot } from '../types/kpi.types'

/** Umbral en puntos porcentuales para considerar la tendencia “estable” (evita ruido). */
export const GLOBAL_SCORE_TREND_EPSILON_PCT = 0.5

export type GlobalScoreChartRange = '7d' | '30d' | '90d' | 'all'

const RANGE_DAYS: Record<Exclude<GlobalScoreChartRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export function filterSnapshotsByCreatedAtRange(
  sortedAsc: GlobalScoreSnapshot[],
  range: GlobalScoreChartRange
): GlobalScoreSnapshot[] {
  if (range === 'all') return sortedAsc
  const days = RANGE_DAYS[range]
  const cutoff = getAppTimeMs() - days * 24 * 60 * 60 * 1000
  return sortedAsc.filter((s) => new Date(s.created_at).getTime() >= cutoff)
}

/** Diferencia en puntos porcentuales entre el último snapshot y el inmediatamente anterior. */
export function computeDeltaVsPreviousPct(sortedAsc: GlobalScoreSnapshot[]): number | null {
  const n = sortedAsc.length
  if (n < 2) return null
  const last = Number(sortedAsc[n - 1]!.score)
  const prev = Number(sortedAsc[n - 2]!.score)
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return null
  return (last - prev) * 100
}

export function classifyTrend(
  deltaPct: number | null,
  epsilonPct: number = GLOBAL_SCORE_TREND_EPSILON_PCT
): 'up' | 'down' | 'flat' | null {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null
  if (Math.abs(deltaPct) < epsilonPct) return 'flat'
  return deltaPct > 0 ? 'up' : 'down'
}

function formatPts(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const abs = Math.abs(rounded)
  const s = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)
  if (rounded > 0) return `+${s}`
  if (rounded < 0) return `−${s}`
  return '0'
}

/**
 * Una línea corta sobre la variación vs el registro anterior del historial.
 */
export function buildDeltaVsPreviousLine(deltaPct: number | null): string | null {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null
  if (Math.abs(deltaPct) < GLOBAL_SCORE_TREND_EPSILON_PCT) {
    return 'Sin cambio relevante vs el registro anterior del historial.'
  }
  return `${formatPts(deltaPct)} pts vs el registro anterior`
}

/**
 * Frase de tendencia para contexto ejecutivo (segunda línea).
 */
export function buildTrendInterpretation(trend: 'up' | 'down' | 'flat' | null): string | null {
  if (trend == null) return null
  if (trend === 'up') return 'La tendencia reciente del historial es positiva.'
  if (trend === 'down') return 'La tendencia reciente del historial es a la baja.'
  return 'El score se mantiene estable respecto al registro anterior.'
}

export function chartRangeLabel(range: GlobalScoreChartRange): string {
  switch (range) {
    case '7d':
      return '7 días'
    case '30d':
      return '30 días'
    case '90d':
      return '90 días'
    default:
      return 'Todo'
  }
}

/** Variación neta en puntos entre el primer y último snapshot del periodo filtrado. */
export function computeDeltaWindowPct(
  sortedAsc: GlobalScoreSnapshot[],
  range: GlobalScoreChartRange
): number | null {
  const filtered = filterSnapshotsByCreatedAtRange(sortedAsc, range)
  if (filtered.length < 2) return null
  const first = Number(filtered[0]!.score)
  const last = Number(filtered[filtered.length - 1]!.score)
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  return (last - first) * 100
}

export function buildWindowNarrative(
  deltaWindowPct: number | null,
  range: GlobalScoreChartRange
): string | null {
  if (deltaWindowPct == null) return null
  const label = chartRangeLabel(range)
  if (range === 'all') {
    return Math.abs(deltaWindowPct) < GLOBAL_SCORE_TREND_EPSILON_PCT
      ? 'En el historial completo, el score se mantiene estable entre el primer y último registro.'
      : `En el historial completo: ${formatPts(deltaWindowPct)} pts entre el primer y último registro.`
  }
  if (Math.abs(deltaWindowPct) < GLOBAL_SCORE_TREND_EPSILON_PCT) {
    return `En los últimos ${label}, el score se mantiene estable.`
  }
  return `En los últimos ${label}, variación neta de ${formatPts(deltaWindowPct)} pts.`
}
