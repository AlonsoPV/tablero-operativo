import { useMemo } from 'react'
import { useCatalogKpiO2cMetricItems, useGapAccionesForGapIds, useGaps } from '@/features/kpi/hooks'
import { DEFAULT_O2C_TARGET_HORIZON } from '@/features/kpi/utils/kpiCalculations'
import { computeGapStoryProgress } from '@/features/kpi/utils/gapProgress'

type UseAccionImpactPreviewOptions = {
  gapIds: string[]
  storyPoints: number
  enabled?: boolean
}

export type AccionImpactPreviewRow = {
  gapId: string
  gapNombre: string
  kpiNombre: string | null
  kpiPeso: number | null
  puntosCompletados: number
  totalPuntosGap: number
  contribucionPct: number | null
}

export function useAccionImpactPreview({
  gapIds,
  storyPoints,
  enabled = true,
}: UseAccionImpactPreviewOptions) {
  const isEnabled = enabled && gapIds.length > 0
  const { data: gaps = [], isLoading: gapsLoading } = useGaps({
    filters: { activo: true },
  })
  const { metricItems, isLoading: kpisLoading } = useCatalogKpiO2cMetricItems({
    activo: true,
    targetHorizon: DEFAULT_O2C_TARGET_HORIZON,
    enabled: isEnabled,
  })
  const { data: accionesData, isLoading: accionesLoading } = useGapAccionesForGapIds(
    isEnabled ? gapIds : []
  )

  const acciones = accionesData?.acciones ?? []
  const junctionAccionIdsByGap = accionesData?.junctionAccionIdsByGap ?? new Map<string, Set<string>>()

  const preview = useMemo(() => {
    if (!gapIds.length) return []

    return gapIds.map((gapId) => {
      const gap = gaps.find((g) => g.id === gapId)
      const kpi = metricItems.find((m) => m.row.gap_id === gapId)
      const progress = computeGapStoryProgress(
        gapId,
        acciones,
        gap?.total_story_points ?? 0,
        junctionAccionIdsByGap.get(gapId)
      )
      const contribucion =
        progress.totalPoints > 0 && storyPoints > 0 ? storyPoints / progress.totalPoints : null

      return {
        gapId,
        gapNombre: gap?.nombre ?? gapId,
        kpiNombre: kpi?.row.nombre ?? null,
        kpiPeso: kpi?.row.weight ?? null,
        puntosCompletados: progress.donePoints,
        totalPuntosGap: progress.totalPoints,
        contribucionPct: contribucion,
      }
    })
  }, [acciones, gapIds, gaps, junctionAccionIdsByGap, metricItems, storyPoints])

  return {
    preview,
    isLoading: gapsLoading || kpisLoading || accionesLoading,
  }
}
