/**
 * Cálculos puros de impacto potencial Story Points -> KPI -> Score Global.
 *
 * Adaptación del documento `docs/ExplicacionStory.md` a datos reales:
 * - Peso KPI -> `catalog_kpis.weight`
 * - Story points -> `acciones_diarias.story_points`
 * - Total puntos GAP -> suma por `gap_id` o fallback `gaps.total_story_points`
 */

export function calcularImpactoAccion(
  pesoKpi: number,
  storyPointsAccion: number,
  totalPuntosGap: number
): number | null {
  if (!Number.isFinite(pesoKpi) || pesoKpi <= 0) return null
  if (!Number.isFinite(totalPuntosGap) || totalPuntosGap <= 0) return null
  if (!Number.isFinite(storyPointsAccion) || storyPointsAccion <= 0) return null
  return (pesoKpi * storyPointsAccion) / totalPuntosGap
}

export function calcularImpactoGap(
  acciones: Array<{ story_points: number | null }>,
  pesoKpi: number,
  totalPuntosGap: number
): number | null {
  const pts = acciones.reduce((sum, a) => {
    const sp = a.story_points
    return sum + (typeof sp === 'number' && Number.isFinite(sp) ? sp : 0)
  }, 0)
  return calcularImpactoAccion(pesoKpi, pts, totalPuntosGap)
}
