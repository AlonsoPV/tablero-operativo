import { useMemo } from 'react'
import { useAcciones } from '@/features/operations/hooks/useAcciones'
import { accionStoryPoints, isAccionEstadoDone } from '../utils/gapProgress'
import { DEFAULT_O2C_TARGET_HORIZON } from '../utils/kpiCalculations'
import { useCatalogKpiO2cMetricItems } from './useCatalogKpiO2cMetricItems'
import { useGaps } from './useGaps'

export type GapKpiLink = {
  gapId: string
  gapNombre: string
  totalPuntosGap: number
  puntosCompletados: number
  avancePct: number
  estado: 'cerrado' | 'en_progreso' | 'abierto'
  kpiId: string | null
  kpiNombre: string | null
  kpiPeso: number | null
  kpiCumplimiento: number | null
}

export function useGapKpiLinks() {
  const { data: gaps = [], isLoading: gapsLoading } = useGaps({ filters: { activo: true } })
  const { metricItems, isLoading: kpisLoading } = useCatalogKpiO2cMetricItems({
    activo: true,
    targetHorizon: DEFAULT_O2C_TARGET_HORIZON,
  })
  const { data: acciones = [], isLoading: accionesLoading } = useAcciones({})

  const ptsDoneByGap = useMemo(() => {
    const map = new Map<string, number>()
    for (const accion of acciones) {
      if (!accion.gap_id) continue
      if (!isAccionEstadoDone(accion.estado)) continue
      map.set(accion.gap_id, (map.get(accion.gap_id) ?? 0) + accionStoryPoints(accion))
    }
    return map
  }, [acciones])

  const links = useMemo((): GapKpiLink[] => {
    return gaps.map((gap) => {
      const kpi = metricItems.find((item) => item.row.gap_id === gap.id)
      const totalPts = gap.total_story_points ?? 0
      const ptsDone = ptsDoneByGap.get(gap.id) ?? 0
      const avancePct = totalPts > 0 ? Math.min(1, ptsDone / totalPts) : 0
      const estado: GapKpiLink['estado'] =
        avancePct >= 1 ? 'cerrado' : avancePct > 0 ? 'en_progreso' : 'abierto'

      return {
        gapId: gap.id,
        gapNombre: gap.nombre,
        totalPuntosGap: totalPts,
        puntosCompletados: ptsDone,
        avancePct,
        estado,
        kpiId: kpi?.row.id ?? null,
        kpiNombre: kpi?.row.nombre ?? null,
        kpiPeso: kpi?.row.weight ?? null,
        kpiCumplimiento: kpi?.compliance ?? null,
      }
    })
  }, [gaps, metricItems, ptsDoneByGap])

  return {
    links,
    isLoading: gapsLoading || kpisLoading || accionesLoading,
  }
}
