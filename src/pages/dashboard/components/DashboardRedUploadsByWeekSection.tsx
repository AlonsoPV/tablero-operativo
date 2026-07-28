import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { cn } from '@/lib/utils'
import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import type { UserProfile } from '@/features/users/types/user.types'
import { buildRedUploadsByWeek } from '../utils/dashboardRedUploadsByWeek'

type DrillDownInput = {
  title: string
  actions: AccionDiaria[]
}

type DashboardRedUploadsByWeekSectionProps = {
  actions: AccionDiaria[]
  users: UserProfile[]
  priorities: Priority[]
  today: string
  isLoading?: boolean
  onDrillDown: (input: DrillDownInput) => void
}

export function DashboardRedUploadsByWeekSection({
  actions,
  users,
  priorities,
  today,
  isLoading,
  onDrillDown,
}: DashboardRedUploadsByWeekSectionProps) {
  const data = useMemo(
    () => buildRedUploadsByWeek({ actions, users, priorities, today, weekCount: 8 }),
    [actions, users, priorities, today]
  )

  const maxCell = Math.max(
    1,
    ...data.rows.flatMap((row) => data.weeks.map((week) => row.weeks[week.weekStart]?.count ?? 0))
  )

  return (
    <section
      id="dashboard-section-red-uploads"
      className="scroll-mt-4"
      aria-labelledby="dashboard-red-uploads-title"
    >
      <SectionCard>
        <SectionCardHeader
          icon={AlertTriangle}
          eyebrow="Prioridad crítica"
          title="Rojos subidos por usuario"
          titleId="dashboard-red-uploads-title"
          subtitle="Acciones rojas creadas por semana (lunes a domingo, CDMX), según quién las subió."
          action={
            <Badge variant="secondary" className="h-7 gap-1.5 px-2.5 tabular-nums">
              {data.grandTotal} {data.grandTotal === 1 ? 'rojo' : 'rojos'} · 8 semanas
            </Badge>
          }
        />
        <SectionCardBody>
          {isLoading ? (
            <div className="h-56 animate-pulse rounded-lg bg-muted/45" aria-label="Cargando rojos por semana" />
          ) : data.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 px-4 py-12 text-center text-sm text-muted-foreground">
              No hay acciones rojas creadas en las últimas 8 semanas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                      Usuario
                    </th>
                    {data.weeks.map((week) => (
                      <th
                        key={week.weekStart}
                        className="px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground"
                      >
                        <span className="block whitespace-nowrap">{week.label}</span>
                        <button
                          type="button"
                          className="mt-1 text-[10px] font-medium tabular-nums text-red-700 hover:underline"
                          onClick={() =>
                            onDrillDown({
                              title: `Rojos · ${week.label}`,
                              actions: data.rows.flatMap((row) => row.weeks[week.weekStart]?.actions ?? []),
                            })
                          }
                        >
                          {data.weekTotals[week.weekStart] ?? 0} total
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.userId} className="border-t border-border/40">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2.5">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() =>
                            onDrillDown({
                              title: `Rojos subidos · ${row.nombre}`,
                              actions: row.actions,
                            })
                          }
                        >
                          <span className="block font-medium text-foreground">{row.nombre}</span>
                          {row.area ? (
                            <span className="block text-[11px] text-muted-foreground">{row.area}</span>
                          ) : null}
                        </button>
                      </td>
                      {data.weeks.map((week) => {
                        const cell = row.weeks[week.weekStart]
                        const count = cell?.count ?? 0
                        const intensity = count === 0 ? 0 : Math.max(0.18, count / maxCell)
                        return (
                          <td key={week.weekStart} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              disabled={count === 0}
                              className={cn(
                                'mx-auto flex h-9 w-full min-w-12 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition',
                                count === 0
                                  ? 'border-transparent text-muted-foreground/50'
                                  : 'border-red-500/20 text-red-800 hover:-translate-y-0.5 hover:shadow-sm'
                              )}
                              style={
                                count > 0
                                  ? { backgroundColor: `rgba(239, 68, 68, ${intensity * 0.55})` }
                                  : undefined
                              }
                              onClick={() =>
                                onDrillDown({
                                  title: `Rojos · ${row.nombre} · ${week.label}`,
                                  actions: cell?.actions ?? [],
                                })
                              }
                              aria-label={`${row.nombre}, semana ${week.label}: ${count} rojos`}
                            >
                              {count || '—'}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="font-bold tabular-nums text-red-700 hover:underline"
                          onClick={() =>
                            onDrillDown({
                              title: `Rojos subidos · ${row.nombre}`,
                              actions: row.actions,
                            })
                          }
                        >
                          {row.total}
                        </button>
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
