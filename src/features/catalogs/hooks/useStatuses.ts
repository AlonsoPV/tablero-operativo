import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { statusesService } from '../services/statuses.service'
import type { CatalogFilter } from '../types/catalogs.types'
import type { CreateStatusInput, UpdateStatusInput } from '../types/catalogs.types'

const KEY = ['catalogs', 'statuses'] as const

export function useStatuses(filter: CatalogFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => statusesService.list(filter),
  })
}

export function useCreateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStatusInput) => statusesService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStatusInput }) =>
      statusesService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useToggleStatusStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      statusesService.setActivo(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
