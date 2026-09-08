import { useQuery } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { Badge } from '@/components/ui/badge'
import { accionFechaCompromisoCambiosService } from '@/services/accionFechaCompromisoCambios.service'

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
    queryFn: () => accionFechaCompromisoCambiosService.listRecentByAccion(50),
    staleTime: 60_000,
    retry: 1,
  })

  const totalCambios = data.reduce((sum, row) => sum + row.cambios_count, 0)

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
              {totalCambios} cambio{totalCambios !== 1 ? 's' : ''}
            </Badge>
          }
        />
        <SectionCardBody className="p-0">
          {isLoading ? (
            <div className="h-48 animate-pulse bg-muted/45" aria-label="Cargando cambios de fecha" />
          ) : isError ? (
            <p className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive sm:m-6">
              {error instanceof Error ? error.message : 'No se pudieron cargar los cambios de fecha compromiso.'}
            </p>
          ) : data.length === 0 ? (
            <p className="m-4 rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground sm:m-6">
              Aun no hay cambios de fecha compromiso registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left hover:bg-transparent">
                    <th className="bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground sm:px-6">
                      Registro
                    </th>
                    <th className="bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Accion
                    </th>
                    <th className="bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Motivo
                    </th>
                    <th className="bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
                      # Cambios
                    </th>
                    <th className="bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground sm:px-6">
                      Responsable
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.accion_id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3 align-middle text-xs text-muted-foreground sm:px-6">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="max-w-[260px] px-4 py-3 align-middle">
                        <span className="block truncate font-medium text-foreground">{row.accion_titulo}</span>
                      </td>
                      <td className="px-4 py-3 align-middle text-foreground">{row.motivo_label}</td>
                      <td className="px-4 py-3 align-middle">
                        <Badge variant="secondary" className="h-6 tabular-nums">
                          {row.cambios_count}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-middle text-muted-foreground sm:px-6">
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
