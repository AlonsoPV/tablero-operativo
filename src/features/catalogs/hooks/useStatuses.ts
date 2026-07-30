import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { statusesService } from '../services/statuses.service'
import { catalogQueryKeys, invalidateActionCatalogDependents, invalidateCatalogQueries } from '../queryKeys'
import type { CatalogFilter } from '../types/catalogs.types'
import type { CreateStatusInput, UpdateStatusInput } from '../types/catalogs.types'

const KEY = catalogQueryKeys.statuses

async function refreshStatusCatalogQueries(qc: QueryClient): Promise<void> {
  invalidateCatalogQueries(qc, KEY)
  invalidateActionCatalogDependents(qc)
  qc.invalidateQueries({ queryKey: ['team-kanban'], refetchType: 'active' })
  await qc.refetchQueries({ queryKey: KEY, type: 'active' })
}

export function useStatuses(filter: CatalogFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => statusesService.list(filter),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

/** Catálogo de estatus para kanban: siempre fresco al entrar al tablero. */
export function useKanbanStatuses() {
  return useQuery({
    queryKey: [...KEY, 'kanban-board'],
    queryFn: () => statusesService.list(),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export function useCreateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStatusInput) => statusesService.create(input),
    onSuccess: () => {
      void refreshStatusCatalogQueries(qc)
    },
  })
}

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStatusInput }) =>
      statusesService.update(id, input),
    onSuccess: () => {
      void refreshStatusCatalogQueries(qc)
    },
  })
}

export function useToggleStatusStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      statusesService.setActivo(id, activo),
    onSuccess: () => {
      void refreshStatusCatalogQueries(qc)
    },
  })
}
