/**
 * Hook: listar orígenes y CRUD para el módulo de distancias.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { originsService } from '../services/origins.service'
import type { DistanceOriginFilter } from '../services/origins.service'

const KEY = ['distance', 'origins'] as const

export function useOrigins(activoOnlyOrFilter: boolean | DistanceOriginFilter = true) {
  return useQuery({
    queryKey: [...KEY, activoOnlyOrFilter],
    queryFn: () => originsService.list(activoOnlyOrFilter),
  })
}

export function useCreateOrigin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { nombre: string; ubicacion: string; activo?: boolean }) =>
      originsService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateOrigin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: { nombre?: string; ubicacion?: string; activo?: boolean }
    }) => originsService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useToggleOriginStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      originsService.setActivo(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
