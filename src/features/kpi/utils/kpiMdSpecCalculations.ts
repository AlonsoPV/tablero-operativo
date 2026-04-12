/**
 * Metodología numérica de `docs/KPIs.md` §3–§4 (cumplimiento 0–120%, semáforo 80/50, score en puntos).
 * Coexiste con el motor O2C en `kpiCalculations.ts` (cumplimiento 0–1 y umbrales por KPI).
 *
 * Score global MD: Σ (cumplimiento_i% × peso_i) con pesos 0–1 del portafolio global; máximo teórico 120
 * si todos los KPIs alcanzan 120% y los pesos elegibles suman 1.
 */

import type { CatalogKpiO2cRow } from '../types/kpi.types'
import {
  calculateCompliance,
  filterGlobalPortfolioMetricItems,
  getKpiStatusForMetric,
  resolveEffectiveCalcType,
  type KpiMetric,
  type TargetHorizon,
} from './kpiCalculations'

const EPS = 1e-9

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b))
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Tope del documento funcional para evitar distorsión (§3.1). */
export const MD_SPEC_MAX_COMPLIANCE_PCT = 120

export function clampMdCompliancePercent(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.max(0, Math.min(MD_SPEC_MAX_COMPLIANCE_PCT, pct))
}

/**
 * Meta numérica activa según mes de programa 1–18 (`docs/KPIs.md` §5).
 * Sin `programMonth`, se usa solo M18 (misma política que “sin calendario”).
 */
export function resolveMdActiveTarget(metric: KpiMetric, programMonth: number | null): number | null {
  if (programMonth == null) {
    return metric.target_m18 ?? null
  }
  if (programMonth <= 3) return metric.target_m3 ?? metric.target_m6 ?? metric.target_m18 ?? null
  if (programMonth <= 6) return metric.target_m6 ?? metric.target_m18 ?? null
  if (programMonth <= 12) return metric.target_m12 ?? metric.target_m18 ?? null
  return metric.target_m18 ?? null
}

/**
 * §3.1 — Cumplimiento en % (0–120) para maximize / minimize.
 */
export function computeMdCompliancePercentRaw(
  baseline: number,
  target: number,
  actual: number,
  mode: 'maximize' | 'minimize'
): number | null {
  if (mode === 'maximize') {
    if (nearlyEqual(baseline, target)) return actual >= target ? 100 : 0
    const denom = target - baseline
    if (nearlyEqual(denom, 0)) return actual >= target ? 100 : 0
    if (denom < 0) return null
    const raw = ((actual - baseline) / denom) * 100
    return clampMdCompliancePercent(raw)
  }
  if (nearlyEqual(baseline, target)) return actual <= target ? 100 : 0
  const denom = baseline - target
  if (nearlyEqual(denom, 0)) return actual <= target ? 100 : 0
  if (denom < 0) return null
  const raw = ((baseline - actual) / denom) * 100
  return clampMdCompliancePercent(raw)
}

/**
 * Cumplimiento MD §3 para una métrica ya resuelta (valor actual en `metric.current`).
 */
export function computeMdCompliancePercentForMetric(
  metric: KpiMetric,
  programMonth: number | null
): number | null {
  const target = resolveMdActiveTarget(metric, programMonth)
  const baseline = metric.baseline
  const current = metric.current
  if (!isFiniteNumber(target) || !isFiniteNumber(baseline) || !isFiniteNumber(current)) return null

  const mode = resolveEffectiveCalcType(metric)
  if (mode === null) return null
  if (mode === 'binary') {
    return nearlyEqual(current, target) ? 100 : 0
  }
  return computeMdCompliancePercentRaw(baseline, target, current, mode)
}

/** §4 — Semáforo sobre cumplimiento % (0–120 escala del MD). */
export function mdSpecSemaphore(compliancePct: number): 'green' | 'yellow' | 'red' {
  if (compliancePct >= 80) return 'green'
  if (compliancePct >= 50) return 'yellow'
  return 'red'
}

export type MdSpecPortfolioDerived = {
  /** Σ (cumplimiento_MD% × peso); pesos 0–1. */
  mdGlobalScorePoints: number | null
  mdSemaphoreCounts: {
    green: number
    yellow: number
    red: number
    sin_datos: number
  }
  /**
   * Origen de los conteos de pastillas: MD documento (80/50 sobre % MD) vs motor O2C (mismo que tarjetas KPI).
   */
  semaphoreCountsSource: 'md' | 'o2c'
}

export type DeriveMdSpecPortfolioOpts = {
  /**
   * Si se indica, las pastillas verde/amarillo/rojo usan el mismo cumplimiento y umbrales O2C que las tarjetas
   * del tablero (`calculateCompliance` + horizonte). El puntaje en pts sigue usando cumplimiento MD §3–§4 y
   * metas por mes de programa para el documento.
   */
  o2cAlignedSemaphores?: { targetHorizon: TargetHorizon }
}

/**
 * Portafolio global (misma regla que O2C) con agregados MD §3–§4.
 */
export function deriveMdSpecPortfolio(
  metricItems: Array<{ row: CatalogKpiO2cRow; metric: KpiMetric }>,
  programMonth: number | null,
  opts?: DeriveMdSpecPortfolioOpts
): MdSpecPortfolioDerived {
  const portfolio = filterGlobalPortfolioMetricItems(metricItems)
  const mdSemaphoreCounts = { green: 0, yellow: 0, red: 0, sin_datos: 0 }
  const useO2cSemaphores = opts?.o2cAlignedSemaphores != null
  const o2cHorizon = opts?.o2cAlignedSemaphores?.targetHorizon

  if (portfolio.length === 0) {
    return {
      mdGlobalScorePoints: null,
      mdSemaphoreCounts,
      semaphoreCountsSource: useO2cSemaphores ? 'o2c' : 'md',
    }
  }

  let sumPoints = 0
  let anyEligible = false

  for (const it of portfolio) {
    const pct = computeMdCompliancePercentForMetric(it.metric, programMonth)
    const w = it.metric.weight
    if (pct == null || !isFiniteNumber(w) || w <= 0) {
      continue
    }
    anyEligible = true
    sumPoints += pct * w
  }

  for (const it of portfolio) {
    const w = it.metric.weight
    if (!isFiniteNumber(w) || w <= 0) {
      mdSemaphoreCounts.sin_datos += 1
      continue
    }

    if (useO2cSemaphores && o2cHorizon != null) {
      const compliance = calculateCompliance(it.metric, { targetHorizon: o2cHorizon })
      const status = getKpiStatusForMetric(compliance, it.metric)
      if (status === null) mdSemaphoreCounts.sin_datos += 1
      else if (status === 'on_track') mdSemaphoreCounts.green += 1
      else if (status === 'at_risk') mdSemaphoreCounts.yellow += 1
      else mdSemaphoreCounts.red += 1
    } else {
      const pct = computeMdCompliancePercentForMetric(it.metric, programMonth)
      if (pct == null) {
        mdSemaphoreCounts.sin_datos += 1
        continue
      }
      const s = mdSpecSemaphore(pct)
      if (s === 'green') mdSemaphoreCounts.green += 1
      else if (s === 'yellow') mdSemaphoreCounts.yellow += 1
      else mdSemaphoreCounts.red += 1
    }
  }

  return {
    mdGlobalScorePoints: anyEligible ? sumPoints : null,
    mdSemaphoreCounts,
    semaphoreCountsSource: useO2cSemaphores ? 'o2c' : 'md',
  }
}
