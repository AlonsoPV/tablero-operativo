import type { QueryClient } from '@tanstack/react-query'
import { kpiQueryKeys } from '@/features/kpi/kpiQueryKeys'

export const catalogQueryKeys = {
  statuses: ['catalogs', 'statuses'] as const,
  areas: ['catalogs', 'areas'] as const,
  roles: ['catalogs', 'roles'] as const,
  priorities: ['catalogs', 'priorities'] as const,
  dropdownCatalogs: ['catalogs', 'dropdownCatalogs'] as const,
  dropdownOptions: ['catalogs', 'dropdownOptions'] as const,
  kpis: ['catalogs', 'kpis'] as const,
} as const

export function invalidateCatalogQueries(
  qc: QueryClient,
  key: readonly unknown[],
  related: readonly (readonly unknown[])[] = []
): void {
  qc.invalidateQueries({ queryKey: key, refetchType: 'active' })
  for (const queryKey of related) {
    qc.invalidateQueries({ queryKey, refetchType: 'active' })
  }
}

export function invalidateActionCatalogDependents(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ['acciones'], refetchType: 'active' })
  qc.invalidateQueries({ queryKey: ['accion'], refetchType: 'active' })
}

export function invalidateKpiCatalogDependents(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: kpiQueryKeys.catalogKpis, refetchType: 'active' })
  qc.invalidateQueries({ queryKey: kpiQueryKeys.catalogKpiAccionImpact, refetchType: 'active' })
  qc.invalidateQueries({ queryKey: kpiQueryKeys.globalScoreSnapshots, refetchType: 'active' })
}

export function invalidateGapCatalogDependents(qc: QueryClient, gapId?: string | null): void {
  qc.invalidateQueries({ queryKey: kpiQueryKeys.gaps, refetchType: 'active' })
  qc.invalidateQueries({ queryKey: kpiQueryKeys.gapAcciones, refetchType: 'active' })
  qc.invalidateQueries({ queryKey: kpiQueryKeys.catalogKpis, refetchType: 'active' })
  if (gapId) {
    qc.invalidateQueries({ queryKey: kpiQueryKeys.gap(gapId), refetchType: 'active' })
    qc.invalidateQueries({ queryKey: kpiQueryKeys.catalogKpisByGap(gapId), refetchType: 'active' })
  }
}
