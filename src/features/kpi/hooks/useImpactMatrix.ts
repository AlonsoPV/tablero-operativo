import { useMemo } from 'react'
import { useAcciones } from '@/features/operations/hooks'
import { accionStoryPoints } from '../utils/gapProgress'
import { calcularImpactoAccion } from '../utils/impactCalculations'
import { DEFAULT_O2C_TARGET_HORIZON } from '../utils/kpiCalculations'
import { useCatalogKpiO2cMetricItems } from './useCatalogKpiO2cMetricItems'
import { useGaps } from './useGaps'

export type ImpactRow = {
  accionId: string
  titulo: string
  gapId: string | null
  gapNombre: string | null
  storyPoints: number | null
  totalPuntosGap: number
  kpiNombre: string | null
  pesoKpi: number | null
  impactoPct: number | null
  estado: string | null
}

export type GapImpactSummaryRow = {
  gapId: string
  gapNombre: string
  totalPts: number
  impactoTotal: number
  accionCount: number
}

export function useImpactMatrix() {
  const { data: gaps = [], isLoading: gapsLoading } = useGaps({ filters: { activo: true } })
  const { data: acciones = [], isLoading: accionesLoading } = useAcciones({})
  const { metricItems, isLoading: kpisLoading } = useCatalogKpiO2cMetricItems({
    activo: true,
    targetHorizon: DEFAULT_O2C_TARGET_HORIZON,
  })

  const gapById = useMemo(() => {
    return new Map(gaps.map((g) => [g.id, g] as const))
  }, [gaps])

  const kpiByGapId = useMemo(() => {
    const m = new Map<string, { nombre: string; weight: number | null }>()
    for (const item of metricItems) {
      const gid = item.row.gap_id
      if (gid && !m.has(gid)) {
        m.set(gid, { nombre: item.row.nombre, weight: item.row.weight })
      }
    }
    return m
  }, [metricItems])

  const totalPtsByGap = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of acciones) {
      if (!a.gap_id) continue
      m.set(a.gap_id, (m.get(a.gap_id) ?? 0) + accionStoryPoints(a))
    }
    return m
  }, [acciones])

  const rows: ImpactRow[] = useMemo(() => {
    const out: ImpactRow[] = []

    for (const a of acciones) {
      const storyPoints = accionStoryPoints(a)
      if (!a.gap_id || storyPoints <= 0) continue

      const gap = gapById.get(a.gap_id) ?? null
      const kpi = kpiByGapId.get(a.gap_id) ?? null
      if (!gap || !kpi) continue

      const totalPtsAcciones = totalPtsByGap.get(a.gap_id) ?? 0
      const totalPuntosGap = totalPtsAcciones > 0 ? totalPtsAcciones : (gap.total_story_points ?? 0)
      const impacto =
        kpi.weight != null
          ? calcularImpactoAccion(kpi.weight, storyPoints, totalPuntosGap)
          : null

      out.push({
        accionId: a.id,
        titulo: a.titulo_accion || '—',
        gapId: a.gap_id,
        gapNombre: gap.nombre,
        storyPoints,
        totalPuntosGap,
        kpiNombre: kpi.nombre,
        pesoKpi: kpi.weight ?? null,
        impactoPct: impacto,
        estado: a.estado ?? null,
      })
    }

    return out.sort((a, b) => (b.impactoPct ?? 0) - (a.impactoPct ?? 0))
  }, [acciones, gapById, kpiByGapId, totalPtsByGap])

  const gapSummary = useMemo((): GapImpactSummaryRow[] => {
    const m = new Map<string, GapImpactSummaryRow>()
    for (const r of rows) {
      if (!r.gapId) continue
      const prev = m.get(r.gapId) ?? {
        gapId: r.gapId,
        gapNombre: r.gapNombre ?? r.gapId,
        totalPts: r.totalPuntosGap,
        impactoTotal: 0,
        accionCount: 0,
      }
      m.set(r.gapId, {
        ...prev,
        totalPts: r.totalPuntosGap,
        impactoTotal: prev.impactoTotal + (r.impactoPct ?? 0),
        accionCount: prev.accionCount + 1,
      })
    }
    return [...m.values()].sort((a, b) => b.impactoTotal - a.impactoTotal)
  }, [rows])

  const top10 = useMemo(() => rows.slice(0, 10), [rows])

  const impactoTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (r.impactoPct ?? 0), 0),
    [rows]
  )

  return {
    rows,
    gapSummary,
    top10,
    impactoTotal,
    isLoading: gapsLoading || accionesLoading || kpisLoading,
  }
}
