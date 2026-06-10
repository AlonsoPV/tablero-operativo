import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarRemindersService } from '@/services/calendarReminders.service'
import { notificacionesService } from '@/services/notificaciones.service'

const KEY = ['notificaciones'] as const

export function useNotifications(
  usuarioId: string | undefined,
  options?: { leido?: boolean; subscribe?: boolean; poll?: boolean }
) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!usuarioId || options?.subscribe !== true) return
    const sub = notificacionesService.subscribe(usuarioId, () => {
      qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' })
    })
    return () => {
      void notificacionesService.unsubscribe(sub)
    }
  }, [qc, options?.subscribe, usuarioId])

  return useQuery({
    queryKey: [...KEY, usuarioId, options?.leido],
    queryFn: () => notificacionesService.listByUsuario(usuarioId!, options),
    enabled: !!usuarioId,
    staleTime: 30_000,
    /** Respaldo si el WebSocket de Realtime falla (firewall, proyecto sin Realtime, etc.). */
    refetchInterval: options?.poll ?? options?.subscribe ? 45_000 : false,
    refetchIntervalInBackground: false,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificacionesService.markAsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' }),
  })
}

export function useMarkAllNotificationsRead(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificacionesService.markAllAsRead(usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' }),
  })
}

export function useDueCalendarReminderNotifications(usuarioId: string | undefined) {
  const qc = useQueryClient()
  const dueRemindersQuery = useQuery({
    queryKey: ['calendar-reminders-due', usuarioId ?? ''],
    queryFn: () => calendarRemindersService.listDuePending(usuarioId!, new Date().toISOString()),
    enabled: Boolean(usuarioId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!usuarioId || !dueRemindersQuery.data?.length) return
    let cancelled = false
    const targetUsuarioId = usuarioId
    async function notifyDueReminders() {
      for (const reminder of dueRemindersQuery.data ?? []) {
        if (cancelled) return
        await notificacionesService.create({
          usuario_id: targetUsuarioId,
          tipo: 'recordatorio_calendario',
          prioridad: 'Alta',
          payload: {
            titulo: `Recordatorio: ${reminder.titulo}`,
            mensaje: reminder.descripcion,
            reminder_id: reminder.id,
            fecha_limite: reminder.fecha_limite,
          },
        })
        await calendarRemindersService.markNotified(reminder.id)
      }
      void qc.invalidateQueries({ queryKey: ['calendar-reminders'], refetchType: 'active' })
      void qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' })
    }
    notifyDueReminders().catch((error) => {
      console.error('[calendar-reminders] due notification:', error)
    })
    return () => {
      cancelled = true
    }
  }, [dueRemindersQuery.data, qc, usuarioId])
}
