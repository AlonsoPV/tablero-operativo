import { useQuery } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { Badge } from '@/components/ui/badge'
import { accionFechaCompromisoCambiosService } from '@/services/accionFechaCompromisoCambios.service'

function formatDate(value: string) {
  if (!value) return 'Sin fecha'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DashboardFechaCompromisoChangesSection() {
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ['dashboard', 'fecha-compromiso-cambios'],
    queryFn: () => accionFechaCompromisoCambiosService.listRecent(50),
    staleTime: 60_000,
    retry: 1,
  })

  return (
    <section id="dashboard-section-fecha-compromiso-cambios" className="scroll-mt-4">
      <SectionCard>
        <SectionCardHeader
          icon={CalendarClock}
          eyebrow="Fechas compromiso"
          title="Cambios registrados"
          subtitle="Motivos seleccionados antes de mover la fecha compromiso en acciones unicas."
          action={
            <Badge variant="secondary" className="h-7 px-2.5 tabular-nums">
              {data.length} registros
            </Badge>
          }
        />
        <SectionCardBody>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-lg bg-muted/45" aria-label="Cargando cambios de fecha" />
          ) : isError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
              {error instanceof Error ? error.message : 'No se pudieron cargar los cambios de fecha compromiso.'}
            </p>
          ) : data.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
              Aun no hay cambios de fecha compromiso registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Registro</th>
                    <th className="pb-3 pr-4 font-medium">Origen</th>
                    <th className="pb-3 pr-4 font-medium">Accion</th>
                    <th className="pb-3 pr-4 font-medium">Motivo</th>
                    <th className="pb-3 pr-4 font-medium">Cambio</th>
                    <th className="pb-3 font-medium">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b border-border/35 last:border-0">
                      <td className="py-3 pr-4 align-top text-xs text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <Badge variant="outline" className="whitespace-nowrap">
                          {row.origen === 'team_kanban' ? 'Kanban equipo' : 'Kanban'}
                        </Badge>
                      </td>
                      <td className="max-w-[240px] py-3 pr-4 align-top">
                        <span className="block truncate font-medium text-foreground">{row.accion_titulo}</span>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <span className="font-medium text-foreground">{row.motivo_label}</span>
                      </td>
                      <td className="py-3 pr-4 align-top text-muted-foreground">
                        <span className="whitespace-nowrap">{formatDate(row.fecha_anterior)}</span>
                        <span aria-hidden>{' -> '}</span>
                        <span className="whitespace-nowrap font-medium text-foreground">
                          {formatDate(row.fecha_nueva)}
                        </span>
                      </td>
                      <td className="py-3 align-top text-muted-foreground">
                        {row.changed_by_nombre ?? 'Sin identificar'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
