/**
 * Metodología de story points y reparto de impacto al score global (docs/KPIs.md §13).
 * Las acciones del gap (`acciones_diarias.story_points`) actúan como historias del backlog.
 */

/** Escala Fibonacci habitual para estimación relativa (1–13). */
export const FIBONACCI_STORY_POINTS = [1, 2, 3, 5, 8, 13] as const

export type FibonacciStoryPoint = (typeof FIBONACCI_STORY_POINTS)[number]

export function isFibonacciStoryPoint(n: number): boolean {
  return FIBONACCI_STORY_POINTS.includes(n as FibonacciStoryPoint)
}

/** Velocidad objetivo del proyecto (puntos por sprint de 4 semanas). */
export const TARGET_SPRINT_VELOCITY_POINTS = 29

/**
 * Reparto de capacidad por sprint según MoSCoW (Must / Should / Could).
 * Valores en puntos ≈ velocidad × porcentaje.
 */
export const MOSCOW_SPRINT_CAPACITY = {
  mustPct: 0.6,
  shouldPct: 0.25,
  couldPct: 0.15,
} as const

export function moscowPointsBudget(
  velocity: number = TARGET_SPRINT_VELOCITY_POINTS
): { must: number; should: number; could: number } {
  return {
    must: Math.round(velocity * MOSCOW_SPRINT_CAPACITY.mustPct),
    should: Math.round(velocity * MOSCOW_SPRINT_CAPACITY.shouldPct),
    could: Math.round(velocity * MOSCOW_SPRINT_CAPACITY.couldPct),
  }
}

export type StoryGlobalImpactParams = {
  /** Suma de pesos (0–1) de KPIs activos del gap, o peso del KPI si hay uno solo. */
  kpiWeightSum: number
  /** Número de historias/acciones del gap (denominador de la repartición del peso). */
  storiesInGap: number
  /** Story points de la historia concreta. */
  storyPoints: number
  /** Total de story points del gap (denominador de participación relativa). */
  totalStoryPointsInGap: number
}

/**
 * Fracción del score global de referencia atribuible a una historia al cerrarse,
 * según docs/KPIs.md: (peso_kpi / historias_gap) × (puntos_historia / total_puntos_gap).
 * Resultado en [0, 1] (p. ej. 0.0115 = 1.15 %).
 */
export function computeStoryGlobalImpactFraction(p: StoryGlobalImpactParams): number | null {
  const { kpiWeightSum, storiesInGap, storyPoints, totalStoryPointsInGap } = p
  if (!Number.isFinite(kpiWeightSum) || kpiWeightSum <= 0) return null
  if (!Number.isFinite(storiesInGap) || storiesInGap <= 0) return null
  if (!Number.isFinite(totalStoryPointsInGap) || totalStoryPointsInGap <= 0) return null
  if (!Number.isFinite(storyPoints) || storyPoints < 0) return null
  return (kpiWeightSum / storiesInGap) * (storyPoints / totalStoryPointsInGap)
}

export function computeStoryGlobalImpactPercent(p: StoryGlobalImpactParams): number | null {
  const f = computeStoryGlobalImpactFraction(p)
  if (f == null) return null
  return f * 100
}
