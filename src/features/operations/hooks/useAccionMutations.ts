import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accionesService } from '@/services/acciones.service'
import type { AccionDiaria } from '@/types'
import type { ActionStatus } from '@/types'

const KEY = ['acciones'] as const

export function useCreateAccion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<AccionDiaria>) => accionesService.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateAccion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AccionDiaria> }) =>
      accionesService.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateAccionEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      estado,
      extra,
    }: {
      id: string
      estado: ActionStatus
      extra?: Partial<AccionDiaria>
    }) => accionesService.updateEstado(id, estado, extra),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteAccion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accionesService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
