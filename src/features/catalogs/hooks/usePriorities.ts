import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prioritiesService } from '../services/priorities.service'
import type { CatalogFilter } from '../types/catalogs.types'
import type { CreatePriorityInput, UpdatePriorityInput } from '../types/catalogs.types'

const KEY = ['catalogs', 'priorities'] as const

export function usePriorities(filter: CatalogFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => prioritiesService.list(filter),
  })
}

export function useCreatePriority() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePriorityInput) => prioritiesService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdatePriority() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePriorityInput }) =>
      prioritiesService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useTogglePriorityStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      prioritiesService.setActivo(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
