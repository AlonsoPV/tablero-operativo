/**
 * Hook: calcular distancia (Edge Function) y guardar en Supabase.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { distanceService } from '../services/distance.service'
import type { DistanceFormValues, DistanceCalculateResult } from '../types/distance.types'

const QUERY_KEY = ['distance_queries'] as const

export function useDistanceCalculator(createdBy: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: DistanceFormValues): Promise<DistanceCalculateResult & { saved?: boolean }> => {
      const result = await distanceService.calculate({
        origen_ubicacion: values.origen_ubicacion.trim(),
        destino_ubicacion: values.destino_ubicacion.trim(),
      })

      if (!result.ok || result.distance_km == null) {
        return result
      }

      try {
        await distanceService.insert({
          origen_nombre: values.origen_nombre.trim(),
          origen_ubicacion: values.origen_ubicacion.trim(),
          destino_nombre: values.destino_nombre.trim(),
          destino_ubicacion: values.destino_ubicacion.trim(),
          distancia_km: result.distance_km,
          distancia_metros: result.distancia_metros ?? null,
          duracion_segundos: result.duracion_segundos ?? null,
          route_mode: result.route_mode ?? 'DRIVE',
          status: result.status ?? 'ok',
          created_by: createdBy,
        })
        return { ...result, saved: true }
      } catch {
        return { ...result, saved: false }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
