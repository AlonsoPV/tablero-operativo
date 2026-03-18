/**
 * Hook: listar destinos y CRUD para el módulo de distancias.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { destinationsService } from '../services/destinations.service'
import type { DistanceDestinationFilter } from '../services/destinations.service'

const KEY = ['distance', 'destinations'] as const

export function useDestinations(activoOnlyOrFilter: boolean | DistanceDestinationFilter = true) {
  return useQuery({
    queryKey: [...KEY, activoOnlyOrFilter],
    queryFn: () => destinationsService.list(activoOnlyOrFilter),
  })
}

export function useCreateDestination() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { nombre: string; ubicacion: string; activo?: boolean }) =>
      destinationsService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateDestination() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: { nombre?: string; ubicacion?: string; activo?: boolean }
    }) => destinationsService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useToggleDestinationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      destinationsService.setActivo(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
