import { useQuery } from '@tanstack/react-query'
import { orgChartService } from '../services/orgChart.service'

export function useOrgChart() {
  return useQuery({
    queryKey: ['org-chart', 'users'],
    queryFn: () => orgChartService.list(),
    staleTime: 60_000,
  })
}

export function useOrgChartCommandChain(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['org-chart', 'command-chain', userId],
    queryFn: () => orgChartService.commandChain(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })
}
