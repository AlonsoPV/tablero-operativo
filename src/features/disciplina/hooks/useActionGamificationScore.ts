import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addCalendarDays, todayWallClockCDMX } from '@/lib/dateUtils'
import { useAcciones } from '@/features/operations/hooks'
import { accionComentariosService } from '@/services/accionComentarios.service'
import {
  buildActionGamificationMetrics,
  getUserOwnedActions,
  getUserRelevantComments,
} from '../utils/actionGamification'

export function useActionGamificationScore(userId: string | undefined) {
  const today = todayWallClockCDMX()
  const historyStart = useMemo(() => addCalendarDays(today, -90), [today])
  const {
    data: acciones = [],
    isLoading: loadingActions,
    isError: actionsError,
  } = useAcciones({ fecha_min: historyStart }, { enabled: Boolean(userId) })
  const actionIds = useMemo(() => acciones.map((action) => action.id), [acciones])
  const {
    data: comentarios = [],
    isLoading: loadingComments,
    isError: commentsError,
  } = useQuery({
    queryKey: ['disciplina', 'gamification-comments', actionIds],
    queryFn: () => accionComentariosService.listByAccionIds(actionIds),
    enabled: Boolean(userId && actionIds.length > 0),
    staleTime: 30_000,
    retry: 1,
  })
  const personalActions = useMemo(
    () => getUserOwnedActions(userId, acciones, comentarios),
    [acciones, comentarios, userId]
  )
  const personalComments = useMemo(
    () => getUserRelevantComments(userId, comentarios, personalActions),
    [comentarios, personalActions, userId]
  )
  const metrics = useMemo(
    () => buildActionGamificationMetrics(userId, personalActions, personalComments, today),
    [personalActions, personalComments, today, userId]
  )

  return {
    metrics,
    isLoading: loadingActions || loadingComments,
    isError: actionsError || commentsError,
  }
}
