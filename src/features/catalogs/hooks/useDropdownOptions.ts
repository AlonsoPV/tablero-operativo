import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dropdownCatalogsService } from '../services/dropdownCatalogs.service'
import { dropdownOptionsService } from '../services/dropdownOptions.service'
import { catalogQueryKeys, invalidateCatalogQueries } from '../queryKeys'
import type { DropdownOption } from '../types/catalogs.types'
import type { CreateDropdownOptionInput, UpdateDropdownOptionInput } from '../types/catalogs.types'

const KEY = catalogQueryKeys.dropdownOptions
const CATALOG_STALE_TIME = 10 * 60 * 1000

function normalizeCatalogKey(catalogKey: string | undefined | null): string {
  return catalogKey?.trim() ?? ''
}

export function dropdownOptionsByCatalogKeyQueryKey(catalogKey: string | undefined | null) {
  return [...KEY, 'byKey', normalizeCatalogKey(catalogKey)] as const
}

export async function fetchDropdownOptionsByCatalogKey(
  catalogKey: string | undefined | null
): Promise<DropdownOption[]> {
  const normalized = normalizeCatalogKey(catalogKey)
  if (!normalized) return []
  const catalog = await dropdownCatalogsService.getByKey(normalized)
  if (!catalog) return []
  return dropdownOptionsService.listByCatalogId(catalog.id)
}

export function useDropdownOptions(catalogId: string | undefined | null) {
  return useQuery({
    queryKey: [...KEY, catalogId],
    queryFn: () => dropdownOptionsService.listByCatalogId(catalogId!),
    enabled: !!catalogId,
    staleTime: CATALOG_STALE_TIME,
    retry: 1,
  })
}

/** Opciones de un catálogo por su key (ej. 'evidencia_esperada'). Devuelve [] si no existe. */
export function useDropdownOptionsByKey(catalogKey: string | undefined | null) {
  return useQuery({
    queryKey: dropdownOptionsByCatalogKeyQueryKey(catalogKey),
    queryFn: () => fetchDropdownOptionsByCatalogKey(catalogKey),
    enabled: !!normalizeCatalogKey(catalogKey),
    staleTime: CATALOG_STALE_TIME,
    retry: 1,
  })
}

export function useCreateDropdownOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDropdownOptionInput) => dropdownOptionsService.create(input),
    onSuccess: () => invalidateCatalogQueries(qc, KEY),
  })
}

export function useUpdateDropdownOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDropdownOptionInput }) =>
      dropdownOptionsService.update(id, input),
    onSuccess: () => invalidateCatalogQueries(qc, KEY),
  })
}

export function useToggleDropdownOptionStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      dropdownOptionsService.setActivo(id, activo),
    onSuccess: () => invalidateCatalogQueries(qc, KEY),
  })
}
