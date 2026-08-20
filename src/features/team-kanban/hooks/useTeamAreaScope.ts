import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { teamKanbanService } from '../service'
import { teamKanbanQueryKeys } from '../queryKeys'
import { filterAssignedTeamAreas } from '../utils/teamAreaView'

export function useTeamAreaScope() {
  const [searchParams] = useSearchParams()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const [areaId, setAreaId] = useState<string | null>(null)
  const areaParam = searchParams.get('area')

  const areas = useQuery({
    queryKey: teamKanbanQueryKeys.areas,
    queryFn: teamKanbanService.areas,
  })
  const assignedAreas = useQuery({
    queryKey: teamKanbanQueryKeys.assignedAreas(currentUser?.id ?? ''),
    queryFn: () => teamKanbanService.assignedAreaIds(currentUser!.id),
    enabled: Boolean(currentUser?.id),
  })

  const visibleAreas = useMemo(() => {
    return filterAssignedTeamAreas(
      areas.data ?? [],
      assignedAreas.data ?? [],
      [currentUser?.area, ...(currentUser?.areas ?? [])]
    )
  }, [areas.data, assignedAreas.data, currentUser?.area, currentUser?.areas])

  useEffect(() => {
    if (!visibleAreas.length) {
      if (areaId) setAreaId(null)
      return
    }
    if (areaParam && visibleAreas.some((area) => area.id === areaParam)) {
      if (areaId !== areaParam) setAreaId(areaParam)
      return
    }
    if (areaId && visibleAreas.some((area) => area.id === areaId)) return
    setAreaId(visibleAreas[0].id)
  }, [visibleAreas, areaId, areaParam])

  return {
    currentUser,
    userLoading,
    areas,
    assignedAreas,
    visibleAreas,
    areaId,
    setAreaId,
    selectedArea: visibleAreas.find((area) => area.id === areaId) ?? null,
    isLoading: areas.isLoading || userLoading || (Boolean(currentUser?.id) && assignedAreas.isLoading),
    error: areas.error,
  }
}
