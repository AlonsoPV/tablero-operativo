import { useState } from 'react'
import { AlertTriangle, ListChecks, Timer } from 'lucide-react'
import { InfoHint } from '@/components/InfoHint'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { cn } from '@/lib/utils'
import { toneForDays } from '@/pages/dashboard/hooks/useOperationalDashboardMetrics'
import type { MetricTone } from '@/pages/dashboard/hooks/useOperationalDashboardMetrics'
import type { TeamDashboardDrillDown, TeamDashboardMetrics } from '../utils/teamDashboardMetrics'
import type { TeamAction } from '../types'

type TeamDashboardExecutivePanelProps = {
  metrics: TeamDashboardMetrics
  isLoading?: boolean
  onDrillDown: (input: TeamDashboardDrillDown) => void
}

const toneStyles: Record<MetricTone, string> = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 [&_.tone-icon]:text-emerald-600',
  yellow: 'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100 [&_.tone-icon]:text-amber-600',
  red: 'border-red-500/35 bg-red-500/10 text-red-950 dark:text-red-100 [&_.tone-icon]:text-red-600',
  neutral: 'border-slate-500/25 bg-slate-500/10 text-slate-950 dark:text-slate-100 [&_.tone-icon]:text-slate-600',
}

type PieBreakdownSegment = {
  label: string
  value: number
  actions: TeamAction[]
  color: string
  assigneeId?: string
}

function conicGradientFor(segments: PieBreakdownSegment[], total: number): string {
  if (total === 0) return 'conic-gradient(hsl(var(--muted)) 0% 100%)'
  let start = 0
  const stops = segments.map((segment) => {
    const end = start + (segment.value / total) * 100
    const stop = `${segment.color} ${start}% ${end}%`
    start = end
    return stop
  })
  return `conic-gradient(${stops.join(', ')})`
}

function TeamActionsPriorityPie({
  metrics,
  onDrillDown,
  loading,
}: {
  metrics: TeamDashboardMetrics
  onDrillDown: (input: TeamDashboardDrillDown) => void
  loading?: boolean
}) {
  const scopedActions = metrics.attentionScopeActions
  const scopedIds = new Set(scopedActions.map((action) => action.id))
  const redActions = metrics.redActions.filter((action) => scopedIds.has(action.id))
  const yellowActions = metrics.yellowActions.filter((action) => scopedIds.has(action.id))
  const greenActions = metrics.greenActions.filter((action) => scopedIds.has(action.id))
  const total = scopedActions.length
  const redPct = total > 0 ? (redActions.length / total) * 100 : 0
  const yellowPct = total > 0 ? (yellowActions.length / total) * 100 : 0
  const yellowEnd = redPct + yellowPct
  const chartBackground =
    total > 0
      ? `conic-gradient(#ef4444 0% ${redPct}%, #f59e0b ${redPct}% ${yellowEnd}%, #10b981 ${yellowEnd}% 100%)`
      : 'conic-gradient(hsl(var(--muted)) 0% 100%)'
  const segments = [
    {
      label: 'Rojos',
      value: redActions.length,
      alert: 'attention' as const,
      dot: 'bg-red-500',
      text: 'text-red-700 dark:text-red-300',
      surface: 'border-red-500/20 bg-red-500/[0.06] hover:bg-red-500/10',
      bar: 'bg-red-500',
    },
    {
      label: 'Amarillos',
      value: yellowActions.length,
      alert: 'attention' as const,
      dot: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-300',
      surface: 'border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/10',
      bar: 'bg-amber-500',
    },
    {
      label: 'Verdes',
      value: greenActions.length,
      alert: 'attention' as const,
      dot: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-300',
      surface: 'border-emerald-500/20 bg-emerald-500/[0.06] hover:bg-emerald-500/10',
      bar: 'bg-emerald-500',
    },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/35 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <ListChecks className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">Hoy y vencidas</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Abiertas por prioridad</p>
          </div>
        </div>
        <InfoHint text="Acciones abiertas con fecha compromiso de hoy o ya vencida, segmentadas por color de prioridad del equipo." />
      </div>

      <div className="grid items-center gap-6 p-5 sm:grid-cols-[minmax(11rem,0.9fr)_minmax(13rem,1.1fr)]">
        <div className="relative mx-auto w-full max-w-52">
          <span className="absolute inset-3 rounded-full bg-primary/5 blur-xl" aria-hidden />
          <button
            type="button"
            className="relative aspect-square w-full rounded-full p-2 transition duration-200 hover:scale-[1.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ background: chartBackground }}
            onClick={() => onDrillDown({ title: 'Hoy y vencidas', alert: 'attention' })}
            aria-label={`Ver ${total} acciones de hoy y vencidas`}
          >
            <span className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full border-4 border-background bg-background shadow-[inset_0_1px_8px_hsl(var(--muted)),0_6px_18px_rgba(15,23,42,0.12)]">
              {loading ? (
                <span className="h-9 w-16 animate-pulse rounded-lg bg-muted" />
              ) : (
                <span className="text-4xl font-bold leading-none tracking-[-0.04em] tabular-nums">{total}</span>
              )}
              <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                acciones
              </span>
            </span>
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Selecciona la gráfica para ver el detalle
          </p>
          <p className="mt-1 text-center text-[11px] font-medium text-muted-foreground">
            Porcentajes sobre {total} accion{total === 1 ? '' : 'es'}
          </p>
        </div>

        <div className="space-y-2.5">
          {segments.map((segment) => {
            const percentage = total > 0 ? Math.round((segment.value / total) * 100) : 0
            return (
              <button
                key={segment.label}
                type="button"
                className={cn(
                  'group w-full rounded-xl border px-3 py-2.5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-sm',
                  segment.surface
                )}
                onClick={() => onDrillDown({ title: segment.label, alert: segment.alert })}
                title={`${segment.label}: ${segment.value} de ${total} acciones (${percentage}% del total)`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={cn('h-3 w-3 shrink-0 rounded-full shadow-sm ring-4 ring-background/70', segment.dot)} />
                  <span className="min-w-0 flex-1 text-xs font-semibold">{segment.label}</span>
                  <span className={cn('text-base font-bold tabular-nums', segment.text)}>{segment.value}</span>
                  <span className="w-10 rounded-md bg-background/70 px-1.5 py-0.5 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                    {percentage}%
                  </span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-background/80">
                  <span
                    className={cn('block h-full rounded-full transition-all', segment.bar)}
                    style={{ width: `${percentage}%` }}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TeamOverdueBreakdownPie({
  metrics,
  onDrillDown,
  loading,
}: {
  metrics: TeamDashboardMetrics
  onDrillDown: (input: TeamDashboardDrillDown) => void
  loading?: boolean
}) {
  const [view, setView] = useState<'priority' | 'member'>('priority')
  const total = metrics.overdueActionList.length
  const totalActions = metrics.activeActions
  const shareOfAllActions = totalActions > 0 ? Math.round((total / totalActions) * 100) : 0
  const overdueIds = new Set(metrics.overdueActionList.map((action) => action.id))
  const prioritySegments: PieBreakdownSegment[] = [
    {
      label: 'Rojos',
      value: metrics.redActions.filter((action) => overdueIds.has(action.id)).length,
      actions: metrics.redActions.filter((action) => overdueIds.has(action.id)),
      color: '#ef4444',
    },
    {
      label: 'Amarillos',
      value: metrics.yellowActions.filter((action) => overdueIds.has(action.id)).length,
      actions: metrics.yellowActions.filter((action) => overdueIds.has(action.id)),
      color: '#f59e0b',
    },
    {
      label: 'Verdes',
      value: metrics.greenActions.filter((action) => overdueIds.has(action.id)).length,
      actions: metrics.greenActions.filter((action) => overdueIds.has(action.id)),
      color: '#10b981',
    },
  ]
  const memberPalette = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#ea580c', '#64748b']
  const visibleMembers = metrics.overdueByMember.slice(0, 5)
  const remainingMembers = metrics.overdueByMember.slice(5)
  const memberSegments: PieBreakdownSegment[] = visibleMembers.map((item, index) => ({
    label: item.label,
    value: item.value,
    actions: item.actions,
    color: memberPalette[index],
    assigneeId: item.assigneeId,
  }))
  if (remainingMembers.length > 0) {
    memberSegments.push({
      label: 'Otros integrantes',
      value: remainingMembers.reduce((sum, item) => sum + item.value, 0),
      actions: remainingMembers.flatMap((item) => item.actions),
      color: memberPalette[5],
    })
  }
  const segments = (view === 'priority' ? prioritySegments : memberSegments).filter(
    (segment) => segment.value > 0
  )
  const chartBackground = conicGradientFor(segments, total)

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-red-500/[0.035] shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 ring-1 ring-red-500/10">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">Acciones vencidas</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Distribución de compromisos fuera de fecha</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
          <button
            type="button"
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition',
              view === 'priority'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setView('priority')}
          >
            Por prioridad
          </button>
          <button
            type="button"
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition',
              view === 'member'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setView('member')}
          >
            Por integrante
          </button>
        </div>
      </div>

      <div className="grid items-center gap-7 p-5 md:grid-cols-[minmax(12rem,0.85fr)_minmax(16rem,1.4fr)]">
        <div className="relative mx-auto w-full max-w-52">
          <span className="absolute inset-3 rounded-full bg-red-500/5 blur-xl" aria-hidden />
          <button
            type="button"
            className="relative aspect-square w-full rounded-full transition duration-200 hover:scale-[1.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ background: chartBackground }}
            onClick={() => onDrillDown({ title: 'Acciones vencidas', alert: 'overdue' })}
            aria-label={`Ver ${total} acciones vencidas`}
          >
            <span className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full border-4 border-background bg-background shadow-[inset_0_1px_8px_hsl(var(--muted)),0_6px_18px_rgba(15,23,42,0.12)]">
              {loading ? (
                <span className="h-9 w-16 animate-pulse rounded-lg bg-muted" />
              ) : (
                <span className="text-4xl font-bold leading-none tracking-[-0.04em] tabular-nums">{total}</span>
              )}
              <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                vencidas
              </span>
            </span>
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {view === 'priority' ? 'Segmentadas por semáforo' : 'Principales responsables afectados'}
          </p>
          <p className="mt-1 text-center text-[11px] font-medium text-muted-foreground">
            {total} de {totalActions} accion{totalActions === 1 ? '' : 'es'} · {shareOfAllActions}% del total
          </p>
        </div>

        {segments.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {segments.map((segment) => {
              const percentage = total > 0 ? Math.round((segment.value / total) * 100) : 0
              const percentageOfAll =
                totalActions > 0 ? Math.round((segment.value / totalActions) * 100) : 0
              return (
                <button
                  key={segment.label}
                  type="button"
                  className="group rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-sm"
                  onClick={() =>
                    onDrillDown({
                      title: `Vencidas · ${segment.label}`,
                      alert: 'overdue',
                      assigneeId: segment.assigneeId,
                    })
                  }
                  title={`${segment.label}: ${segment.value} de ${total} vencidas (${percentage}%) · ${percentageOfAll}% del total de acciones`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full shadow-sm ring-4 ring-muted/60"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{segment.label}</span>
                    <span className="text-base font-bold tabular-nums">{segment.value}</span>
                    <span className="w-10 rounded-md bg-muted/70 px-1.5 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                      {percentage}%
                    </span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${percentage}%`, backgroundColor: segment.color }}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            No hay acciones vencidas en este equipo.
          </p>
        )}
      </div>
    </div>
  )
}

function TeamCloseAgeMetricCard({
  title,
  value,
  description,
  formula,
  tone,
  onDrillDown,
  loading,
}: {
  title: string
  value: number | null
  description: string
  formula: string
  tone: MetricTone
  onDrillDown: () => void
  loading?: boolean
}) {
  const displayValue = value ?? 0

  return (
    <div className={cn('flex min-h-0 flex-col rounded-xl border p-4 shadow-sm', toneStyles[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="tone-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/70">
            <Timer className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          </div>
        </div>
        <InfoHint text={`${description}. Fórmula: ${formula}`} />
      </div>

      <button
        type="button"
        className="mt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onDrillDown}
      >
        {loading ? (
          <span className="block h-10 w-24 animate-pulse rounded-lg bg-background/70" />
        ) : value == null ? (
          <span className="text-sm font-medium text-muted-foreground">Sin cierres en el periodo</span>
        ) : (
          <span className="flex items-end gap-1.5">
            <span className="text-4xl font-bold leading-none tracking-tight tabular-nums">{displayValue}</span>
            <span className="pb-1 text-sm font-medium text-muted-foreground">días</span>
          </span>
        )}
        <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </button>
    </div>
  )
}

export function TeamDashboardExecutivePanel({
  metrics,
  isLoading,
  onDrillDown,
}: TeamDashboardExecutivePanelProps) {
  return (
    <section className="scroll-mt-4">
      <SectionCard>
        <SectionCardHeader
          eyebrow="Salud operativa"
          title="Atención inmediata"
          subtitle="Riesgos activos del equipo que requieren seguimiento durante el día."
          icon={AlertTriangle}
        />
        <SectionCardBody className="space-y-4">
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <TeamActionsPriorityPie metrics={metrics} onDrillDown={onDrillDown} loading={isLoading} />
            <TeamOverdueBreakdownPie metrics={metrics} onDrillDown={onDrillDown} loading={isLoading} />
          </div>
          <div className="grid items-stretch gap-4 sm:grid-cols-2">
            <TeamCloseAgeMetricCard
              title="Tiempo prom. rojos"
              value={metrics.avgCloseAgeRedDays}
              description="Acciones rojas ya cerradas. Promedio de días desde la creación hasta el cierre."
              formula="fecha cierre − fecha creación (rojas cerradas en periodo)"
              tone={toneForDays(metrics.avgCloseAgeRedDays ?? 0)}
              onDrillDown={() => onDrillDown({ title: 'Tiempo prom. rojos' })}
              loading={isLoading}
            />
            <TeamCloseAgeMetricCard
              title="Tiempo prom. demás"
              value={metrics.avgCloseAgeOthersDays}
              description="Acciones no rojas ya cerradas. Promedio de días desde la creación hasta el cierre."
              formula="fecha cierre − fecha creación (amarillas y verdes cerradas en periodo)"
              tone={toneForDays(metrics.avgCloseAgeOthersDays ?? 0)}
              onDrillDown={() => onDrillDown({ title: 'Tiempo prom. demás' })}
              loading={isLoading}
            />
          </div>
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
