import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dropdownCatalogsService } from '../services/dropdownCatalogs.service'
import { dropdownOptionsService } from '../services/dropdownOptions.service'
import type { DropdownOption } from '../types/catalogs.types'
import type { CreateDropdownOptionInput, UpdateDropdownOptionInput } from '../types/catalogs.types'

const KEY = ['catalogs', 'dropdownOptions'] as const

export function useDropdownOptions(catalogId: string | undefined | null) {
  return useQuery({
    queryKey: [...KEY, catalogId],
    queryFn: () => dropdownOptionsService.listByCatalogId(catalogId!),
    enabled: !!catalogId,
  })
}

/** Opciones de un catálogo por su key (ej. 'evidencia_esperada'). Devuelve [] si no existe. */
export function useDropdownOptionsByKey(catalogKey: string | undefined | null) {
  return useQuery({
    queryKey: [...KEY, 'byKey', catalogKey],
    queryFn: async (): Promise<DropdownOption[]> => {
      if (!catalogKey?.trim()) return []
      const catalog = await dropdownCatalogsService.getByKey(catalogKey.trim())
      if (!catalog) return []
      return dropdownOptionsService.listByCatalogId(catalog.id)
    },
    enabled: !!catalogKey?.trim(),
  })
}

export function useCreateDropdownOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDropdownOptionInput) => dropdownOptionsService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateDropdownOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDropdownOptionInput }) =>
      dropdownOptionsService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useToggleDropdownOptionStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      dropdownOptionsService.setActivo(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
