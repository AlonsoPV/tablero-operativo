import { useQuery } from '@tanstack/react-query'
import { accionComentariosService } from '@/services/accionComentarios.service'

const KEY = ['accion', 'comment-counts'] as const

export function useCommentCounts(accionIds: string[]) {
  const ids = [...new Set(accionIds)].filter(Boolean)
  return useQuery({
    queryKey: [...KEY, ids.sort().join(',')],
    queryFn: () => accionComentariosService.countByAccionIds(ids),
    enabled: ids.length > 0,
  })
}
