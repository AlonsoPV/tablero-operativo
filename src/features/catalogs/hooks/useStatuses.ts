import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { statusesService } from '../services/statuses.service'
import { catalogQueryKeys, invalidateActionCatalogDependents, invalidateCatalogQueries } from '../queryKeys'
import type { CatalogFilter } from '../types/catalogs.types'
import type { CreateStatusInput, UpdateStatusInput } from '../types/catalogs.types'

const KEY = catalogQueryKeys.statuses
const CATALOG_STALE_TIME = 10 * 60 * 1000

export function useStatuses(filter: CatalogFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => statusesService.list(filter),
    staleTime: CATALOG_STALE_TIME,
    retry: 1,
  })
}

export function useCreateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStatusInput) => statusesService.create(input),
    onSuccess: () => {
      invalidateCatalogQueries(qc, KEY)
      invalidateActionCatalogDependents(qc)
    },
  })
}

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStatusInput }) =>
      statusesService.update(id, input),
    onSuccess: () => {
      invalidateCatalogQueries(qc, KEY)
      invalidateActionCatalogDependents(qc)
    },
  })
}

export function useToggleStatusStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      statusesService.setActivo(id, activo),
    onSuccess: () => {
      invalidateCatalogQueries(qc, KEY)
      invalidateActionCatalogDependents(qc)
    },
  })
}
