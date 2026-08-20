import { useQuery } from '@tanstack/react-query'
import { teamKanbanService } from '../service'
import { teamKanbanQueryKeys } from '../queryKeys'
import { buildTeamDashboardMetrics, type TeamDashboardPeriod } from '../utils/teamDashboardMetrics'

export function useTeamDashboard(areaId: string | null, period: TeamDashboardPeriod) {
  const board = useQuery({
    queryKey: areaId ? teamKanbanQueryKeys.board(areaId) : ['team-kanban', 'board', 'none'],
    queryFn: async () => {
      await teamKanbanService.syncFrequent(areaId!).catch((error) => {
        console.warn('[team-dashboard] No se pudieron generar acciones frecuentes:', error)
      })
      return teamKanbanService.board(areaId!)
    },
    enabled: Boolean(areaId),
  })

  return {
    ...board,
    metrics: board.data ? buildTeamDashboardMetrics(board.data, period) : null,
  }
}
