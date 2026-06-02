import { SectionCard, SectionCardBody } from '@/components/SectionCard'
import { NotificationCenter } from '@/features/notifications'

/**
 * Centro de Notificaciones (spec §5.9).
 * Tiempo real, filtro por tipo/prioridad, leído/no leído.
 */

export function NotificacionesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Centro de mensajes
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Notificaciones
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Comentarios, asignaciones y cambios de estado en tus acciones.
        </p>
      </header>
      <SectionCard className="shadow-md">
        <SectionCardBody className="p-0">
          <NotificationCenter />
        </SectionCardBody>
      </SectionCard>
    </div>
  )
}
