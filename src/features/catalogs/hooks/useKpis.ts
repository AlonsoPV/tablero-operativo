import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catalogKpisService } from '../services/kpis.service'
import type { CatalogFilter } from '../types/catalogs.types'
import type { CreateKpiInput, UpdateKpiInput } from '../types/catalogs.types'

const KEY = ['catalogs', 'kpis'] as const

export function useKpis(filter: CatalogFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => catalogKpisService.list(filter),
  })
}

export function useCreateKpi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateKpiInput) => catalogKpisService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateKpi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateKpiInput }) =>
      catalogKpisService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useToggleKpiStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      catalogKpisService.setActivo(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
