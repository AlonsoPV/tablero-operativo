import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accionComentariosService } from '@/services/accionComentarios.service'
import type { AccionComentario } from '@/types/accionComentario'

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
    onSuccess: (created) => {
      qc.setQueryData<AccionComentario[]>([...COMENTARIOS_KEY, accionId], (prev) => {
        const list = prev ?? []
        if (list.some((comment) => comment.id === created.id)) return list
        return [...list, created].sort((a, b) => a.created_at.localeCompare(b.created_at))
      })
      qc.invalidateQueries({ queryKey: [...COMENTARIOS_KEY, accionId] })
      qc.invalidateQueries({ queryKey: ['acciones'] })
      qc.invalidateQueries({ queryKey: ['accion', 'comment-counts'] })
    },
  })
}

export function useUpdateAccionComentario(accionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { contenido?: string; asignado?: string | null; etiquetas?: string[] } }) =>
      accionComentariosService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...COMENTARIOS_KEY, accionId] })
    },
  })
}
