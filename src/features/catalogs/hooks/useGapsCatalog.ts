import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createGap,
  setGapActivo,
  updateGap,
  type CreateGapInput,
  type UpdateGapInput,
} from '@/features/kpi/services/gaps.service'
import { invalidateGapCatalogDependents } from '../queryKeys'

export function useCreateGap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateGapInput) => createGap(input),
    onSuccess: () => {
      invalidateGapCatalogDependents(qc)
    },
  })
}

export function useUpdateGap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGapInput }) => updateGap(id, input),
    onSuccess: (_data, vars) => {
      invalidateGapCatalogDependents(qc, vars.id)
    },
  })
}

export function useToggleGapStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => setGapActivo(id, activo),
    onSuccess: (_data, vars) => {
      invalidateGapCatalogDependents(qc, vars.id)
    },
  })
}
