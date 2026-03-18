/**
 * Hook: calcular ruta ida/vuelta vía Edge Function (origin_id, destination_id).
 */

import { useMutation } from '@tanstack/react-query'
import { distanceService } from '../services/distance.service'
import type { CalculateRoutePayload, CalculateRouteResult } from '../types/distance.types'

export function useCalculateRoute() {
  return useMutation({
    mutationFn: (payload: CalculateRoutePayload): Promise<CalculateRouteResult> =>
      distanceService.calculateRoute(payload),
  })
}
