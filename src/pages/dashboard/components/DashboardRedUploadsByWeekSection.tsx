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

const WEEK_COUNT = 6

export function DashboardRedUploadsByWeekSection({
  actions,
  users,
  priorities,
  today,
  isLoading,
  onDrillDown,
}: DashboardRedUploadsByWeekSectionProps) {
  const data = useMemo(
    () => buildRedUploadsByWeek({ actions, users, priorities, today, weekCount: WEEK_COUNT }),
    [actions, users, priorities, today]
  )

  const maxCell = Math.max(
    1,
    ...data.rows.flatMap((row) => data.weeks.map((week) => row.weeks[week.weekStart]?.count ?? 0))
  )
  const visibleRows = data.rows.slice(0, 8)
  const hiddenCount = Math.max(0, data.rows.length - visibleRows.length)

  return (
    <section
      id="dashboard-section-red-uploads"
      className="flex h-full min-h-0 scroll-mt-4 flex-col"
      aria-labelledby="dashboard-red-uploads-title"
    >
      <SectionCard className="flex h-full flex-col">
        <SectionCardHeader
          icon={AlertTriangle}
          eyebrow="Prioridad crítica"
          title="Rojos por usuario"
          titleId="dashboard-red-uploads-title"
          subtitle="Acciones rojas creadas por semana (CDMX)."
          action={
            <Badge variant="secondary" className="h-7 px-2.5 tabular-nums">
              {data.grandTotal} rojo{data.grandTotal === 1 ? '' : 's'}
            </Badge>
          }
        />
        <SectionCardBody className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4 md:p-5">
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-lg bg-muted/45" aria-label="Cargando rojos por semana" />
          ) : data.rows.length === 0 ? (
            <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              Sin rojos creados en las últimas {WEEK_COUNT} semanas.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {data.weeks.map((week) => {
                  const total = data.weekTotals[week.weekStart] ?? 0
                  return (
                    <button
                      key={week.weekStart}
                      type="button"
                      className="rounded-md border border-border/50 bg-muted/25 px-2 py-1 text-left transition hover:bg-muted/40"
                      onClick={() =>
                        onDrillDown({
                          title: `Rojos · ${week.label}`,
                          actions: data.rows.flatMap((row) => row.weeks[week.weekStart]?.actions ?? []),
                        })
                      }
                    >
                      <span className="block text-[10px] text-muted-foreground">{week.label}</span>
                      <span className="text-xs font-semibold tabular-nums text-foreground">{total}</span>
                    </button>
                  )
                })}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/50">
                <ul className="divide-y divide-border/40">
                  {visibleRows.map((row) => (
                    <li key={row.userId}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/30"
                        onClick={() =>
                          onDrillDown({
                            title: `Rojos subidos · ${row.nombre}`,
                            actions: row.actions,
                          })
                        }
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {row.nombre}
                          </span>
                          {row.area ? (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {row.area}
                            </span>
                          ) : null}
                          <span className="mt-1.5 flex gap-0.5">
                            {data.weeks.map((week) => {
                              const count = row.weeks[week.weekStart]?.count ?? 0
                              const intensity = count === 0 ? 0 : Math.max(0.2, count / maxCell)
                              return (
                                <span
                                  key={week.weekStart}
                                  title={`${week.label}: ${count}`}
                                  className={cn(
                                    'h-1.5 flex-1 rounded-sm',
                                    count === 0 ? 'bg-muted' : 'bg-red-500'
                                  )}
                                  style={
                                    count > 0
                                      ? { opacity: 0.35 + intensity * 0.65 }
                                      : undefined
                                  }
                                />
                              )
                            })}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-base font-semibold tabular-nums text-red-700 dark:text-red-300">
                            {row.total}
                          </span>
                          <span className="text-[10px] text-muted-foreground">total</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {hiddenCount > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  +{hiddenCount} usuario{hiddenCount === 1 ? '' : 's'} más con rojos en el periodo.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Últimas {WEEK_COUNT} semanas · toca un usuario o semana para ver detalle.
                </p>
              )}
            </>
          )}
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
