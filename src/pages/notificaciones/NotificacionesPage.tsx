import { SectionCard, SectionCardBody } from '@/components/SectionCard'
import { NotificationCenter } from '@/features/notifications'

/**
 * Centro de Notificaciones (spec §5.9).
 * Tiempo real, filtro por tipo/prioridad, leído/no leído.
 */

export function NotificacionesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Centro de mensajes</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notificaciones</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tiempo real: comentarios, asignaciones y cambios de estado.
        </p>
      </header>
      <SectionCard>
        <SectionCardBody className="space-y-4">
          <NotificationCenter />
        </SectionCardBody>
      </SectionCard>
    </div>
  )
}
