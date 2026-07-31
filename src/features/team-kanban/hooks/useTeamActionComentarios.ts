import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  teamActionComentariosService,
  type TeamActionComentario,
} from '@/services/teamActionComentarios.service'

const COMMENTS_KEY = ['team-kanban', 'comments'] as const
const COUNTS_KEY = ['team-kanban', 'comment-counts'] as const

export function useTeamActionComentarios(actionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...COMMENTS_KEY, actionId],
    queryFn: () => teamActionComentariosService.listByAction(actionId!),
    enabled: enabled && Boolean(actionId),
  })
}

export function useTeamActionCommentCounts(actionIds: string[]) {
  const ids = [...new Set(actionIds)].filter(Boolean)
  return useQuery({
    queryKey: [...COUNTS_KEY, ids.sort().join(',')],
    queryFn: () => teamActionComentariosService.countByActionIds(ids),
    enabled: ids.length > 0,
  })
}

export function useCreateTeamActionComentario(actionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: teamActionComentariosService.create,
    onSuccess: (created) => {
      qc.setQueryData<TeamActionComentario[]>([...COMMENTS_KEY, actionId], (prev) => {
        const list = prev ?? []
        if (list.some((comment) => comment.id === created.id)) return list
        return [...list, created].sort((a, b) => a.created_at.localeCompare(b.created_at))
      })
      qc.invalidateQueries({ queryKey: [...COMMENTS_KEY, actionId] })
      qc.invalidateQueries({ queryKey: COUNTS_KEY })
    },
  })
}

export function useUpdateTeamActionComentario(actionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { contenido?: string; tipo_comentario?: string | null; asignado?: string | null; etiquetas?: string[] }
    }) => teamActionComentariosService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...COMMENTS_KEY, actionId] })
    },
  })
}

export function useDeleteTeamActionComentario(actionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => teamActionComentariosService.delete(id),
    onSuccess: (_data, deletedId) => {
      qc.setQueryData<TeamActionComentario[]>([...COMMENTS_KEY, actionId], (prev) =>
        (prev ?? []).filter((comment) => comment.id !== deletedId)
      )
      qc.invalidateQueries({ queryKey: [...COMMENTS_KEY, actionId] })
      qc.invalidateQueries({ queryKey: COUNTS_KEY })
    },
  })
}
