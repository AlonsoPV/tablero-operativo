/**
 * Hook: listar historial de consultas de distancia.
 */

import { useQuery } from '@tanstack/react-query'
import { distanceService } from '../services/distance.service'

export const DISTANCE_QUERY_KEY = ['distance_queries'] as const

export function useDistanceHistory() {
  return useQuery({
    queryKey: DISTANCE_QUERY_KEY,
    queryFn: () => distanceService.list(),
  })
}
