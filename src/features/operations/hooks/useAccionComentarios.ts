import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accionComentariosService } from '@/services/accionComentarios.service'

const COMENTARIOS_KEY = ['accion', 'comentarios'] as const

export function useAccionComentarios(accionId: string | undefined) {
  return useQuery({
    queryKey: [...COMENTARIOS_KEY, accionId],
    queryFn: () => accionComentariosService.listByAccion(accionId!),
    enabled: !!accionId,
  })
}

export function useCreateAccionComentario(accionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: accionComentariosService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...COMENTARIOS_KEY, accionId] })
      qc.invalidateQueries({ queryKey: ['acciones'] })
      qc.invalidateQueries({ queryKey: ['accion', 'comment-counts'] })
    },
  })
}

export function useUpdateAccionComentario(accionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { asignado?: string | null; etiquetas?: string[] } }) =>
      accionComentariosService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...COMENTARIOS_KEY, accionId] })
    },
  })
}
