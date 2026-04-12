import type { EnrichedKpi } from '../hooks/useKpisDashboardData'

export type KpiFilterSummary = {
  total: number
  onTrack: number
  atRisk: number
  offTrack: number
  noData: number
}

export function computeKpiFilterSummary(items: EnrichedKpi[]): KpiFilterSummary {
  let onTrack = 0
  let atRisk = 0
  let offTrack = 0
  let noData = 0

  for (const item of items) {
    if (item.compliance == null) {
      noData += 1
      continue
    }

    if (item.status === 'on_track') onTrack += 1
    else if (item.status === 'at_risk') atRisk += 1
    else if (item.status === 'off_track') offTrack += 1
    else noData += 1
  }

  return {
    total: items.length,
    onTrack,
    atRisk,
    offTrack,
    noData,
  }
}
