import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dropdownCatalogsService } from '../services/dropdownCatalogs.service'
import { catalogQueryKeys, invalidateCatalogQueries } from '../queryKeys'
import type { CatalogFilter } from '../types/catalogs.types'
import type { CreateDropdownCatalogInput, UpdateDropdownCatalogInput } from '../types/catalogs.types'

const KEY = catalogQueryKeys.dropdownCatalogs

export function useDropdownCatalogs(filter: CatalogFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => dropdownCatalogsService.list(filter),
  })
}

export function useDropdownCatalog(id: string | undefined | null) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => dropdownCatalogsService.getById(id!),
    enabled: !!id,
  })
}

export function useCreateDropdownCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDropdownCatalogInput) => dropdownCatalogsService.create(input),
    onSuccess: () => invalidateCatalogQueries(qc, KEY, [catalogQueryKeys.dropdownOptions]),
  })
}

export function useUpdateDropdownCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDropdownCatalogInput }) =>
      dropdownCatalogsService.update(id, input),
    onSuccess: () => invalidateCatalogQueries(qc, KEY, [catalogQueryKeys.dropdownOptions]),
  })
}

export function useToggleDropdownCatalogStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      dropdownCatalogsService.setActivo(id, activo),
    onSuccess: () => invalidateCatalogQueries(qc, KEY, [catalogQueryKeys.dropdownOptions]),
  })
}
