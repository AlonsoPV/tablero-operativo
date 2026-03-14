import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificacionesService } from '@/services/notificaciones.service'

const KEY = ['notificaciones'] as const

export function useNotifications(usuarioId: string | undefined, options?: { leido?: boolean }) {
  return useQuery({
    queryKey: [...KEY, usuarioId, options?.leido],
    queryFn: () => notificacionesService.listByUsuario(usuarioId!, options),
    enabled: !!usuarioId,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificacionesService.markAsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useMarkAllNotificationsRead(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificacionesService.markAllAsRead(usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
