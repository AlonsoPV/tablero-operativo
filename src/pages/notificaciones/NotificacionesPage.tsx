import { NotificationCenter } from '@/features/notifications'

/**
 * Centro de Notificaciones (spec §5.9).
 * Tiempo real, filtro por tipo/prioridad, leído/no leído.
 */

export function NotificacionesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notificaciones</h2>
        <p className="text-muted-foreground">
          Centro de notificaciones en tiempo real (comentarios, asignaciones, cambios de estado)
        </p>
      </div>
      <NotificationCenter />
    </div>
  )
}
