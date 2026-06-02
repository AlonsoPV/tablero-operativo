import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { accionesService } from '@/services/acciones.service'
import type { Notificacion } from '@/types'
import { accionIdsFromNotificaciones } from '../utils/notificacionDisplay'

export type AccionMetaForNotificacion = {
  titulo_accion: string | null
  descripcion_accion: string | null
  creador_nombre: string | null
}

export function useNotificationAccionMeta(
  notifications: Notificacion[],
  userNames: Record<string, string>
) {
  const accionIds = useMemo(() => accionIdsFromNotificaciones(notifications), [notifications])

  const query = useQuery({
    queryKey: ['notificaciones', 'accion-meta', accionIds.sort().join(',')] as const,
    queryFn: () => accionesService.listSummaryByIds(accionIds),
    enabled: accionIds.length > 0,
    staleTime: 60_000,
  })

  const byAccionId = useMemo(() => {
    const map: Record<string, AccionMetaForNotificacion> = {}
    for (const row of query.data ?? []) {
      map[row.id] = {
        titulo_accion: row.titulo_accion?.trim() || null,
        descripcion_accion: row.descripcion_accion?.trim() || null,
        creador_nombre: row.created_by ? userNames[row.created_by] ?? null : null,
      }
    }
    return map
  }, [query.data, userNames])

  return { byAccionId, isLoading: query.isLoading && accionIds.length > 0 }
}
