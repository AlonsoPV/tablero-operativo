import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Building2,
  ListChecks,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InfoHint } from '@/components/InfoHint'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { cn } from '@/lib/utils'
import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityDisplayLabel } from '@/features/operations/utils/priorityLabels'
import type {
  DashboardAgingBucket,
  DashboardAreaMetric,
  DashboardMetric,
  MetricTone,
  OperationalDashboardMetrics,
  TrendDirection,
} from '../hooks/useOperationalDashboardMetrics'
import { toneForDays, toneForPercent } from '../hooks/useOperationalDashboardMetrics'

type DrillDownInput = {
  title: string
  actions: AccionDiaria[]
}

type DashboardExecutivePanelProps = {
  metrics: OperationalDashboardMetrics
  priorities?: Priority[]
  isLoading?: boolean
  onDrillDown: (input: DrillDownInput) => void
}

const toneStyles: Record<MetricTone, string> = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 [&_.tone-icon]:text-emerald-600',
  yellow: 'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100 [&_.tone-icon]:text-amber-600',
  red: 'border-red-500/35 bg-red-500/10 text-red-950 dark:text-red-100 [&_.tone-icon]:text-red-600',
  neutral: 'border-slate-500/25 bg-slate-500/10 text-slate-950 dark:text-slate-100 [&_.tone-icon]:text-slate-600',
}

function trendIcon(direction: TrendDirection): ReactNode {
  if (direction === 'up') return <TrendingUp className="h-3.5 w-3.5" aria-hidden />
  if (direction === 'down') return <TrendingDown className="h-3.5 w-3.5" aria-hidden />
  return <span className="text-sm leading-none" aria-hidden>→</span>
}

function formatTrend(metric: DashboardMetric, suffix = ''): string {
  const delta = metric.trend.delta
  if (Math.abs(delta) < 0.1) return `Sin cambio vs periodo anterior`
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta}${suffix} vs periodo anterior`
}

/** Atención inmediata: abiertas asignadas con compromiso de hoy o ya vencido. */
function attentionPriorityActions(metrics: OperationalDashboardMetrics): AccionDiaria[] {
  const byId = new Map<string, AccionDiaria>()
  for (const action of [...metrics.dueTodayActions, ...metrics.overdueActions]) {
    if (!action.responsable) continue
    byId.set(action.id, action)
  }
  return [...byId.values()]
}

function ActionsPriorityPie({
  metrics,
  onDrillDown,
  loading,
}: {
  metrics: OperationalDashboardMetrics
  onDrillDown: (input: DrillDownInput) => void
  loading?: boolean
}) {
  const scopedActions = attentionPriorityActions(metrics)
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
      actions: redActions,
      dot: 'bg-red-500',
      text: 'text-red-700 dark:text-red-300',
      surface: 'border-red-500/20 bg-red-500/[0.06] hover:bg-red-500/10',
      bar: 'bg-red-500',
    },
    {
      label: 'Amarillos',
      value: yellowActions.length,
      actions: yellowActions,
      dot: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-300',
      surface: 'border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/10',
      bar: 'bg-amber-500',
    },
    {
      label: 'Verdes',
      value: greenActions.length,
      actions: greenActions,
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
            <p className="mt-0.5 text-xs text-muted-foreground">Asignadas abiertas por prioridad</p>
          </div>
        </div>
        <InfoHint text="Por defecto solo incluye acciones asignadas abiertas con fecha compromiso de hoy o ya vencida, segmentadas por el color de su prioridad. Respeta los filtros activos del tablero." />
      </div>

      <div className="grid items-center gap-6 p-5 sm:grid-cols-[minmax(11rem,0.9fr)_minmax(13rem,1.1fr)]">
        <div className="relative mx-auto w-full max-w-52">
          <span className="absolute inset-3 rounded-full bg-primary/5 blur-xl" aria-hidden />
          <button
            type="button"
            className="relative aspect-square w-full rounded-full p-2 transition duration-200 hover:scale-[1.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ background: chartBackground }}
            onClick={() => onDrillDown({ title: 'Hoy y vencidas', actions: scopedActions })}
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
                onClick={() => onDrillDown({ title: segment.label, actions: segment.actions })}
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

type PieBreakdownSegment = {
  label: string
  value: number
  actions: AccionDiaria[]
  color: string
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

function OverdueBreakdownPie({
  metrics,
  onDrillDown,
  loading,
}: {
  metrics: OperationalDashboardMetrics
  onDrillDown: (input: DrillDownInput) => void
  loading?: boolean
}) {
  const [view, setView] = useState<'priority' | 'area'>('priority')
  const total = metrics.overdueActions.length
  const totalActions = metrics.totalFiltered
  // Las rebanadas reparten las vencidas; el encabezado ancla ese subconjunto al total filtrado.
  const shareOfAllActions = totalActions > 0 ? Math.round((total / totalActions) * 100) : 0
  const overdueIds = new Set(metrics.overdueActions.map((action) => action.id))
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
  const areaPalette = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#ea580c', '#64748b']
  const visibleAreas = metrics.overdueByArea.slice(0, 5)
  const remainingAreas = metrics.overdueByArea.slice(5)
  const areaSegments: PieBreakdownSegment[] = visibleAreas.map((item, index) => ({
    label: item.area,
    value: item.value,
    actions: item.actions,
    color: areaPalette[index],
  }))
  if (remainingAreas.length > 0) {
    areaSegments.push({
      label: 'Otras áreas',
      value: remainingAreas.reduce((sum, item) => sum + item.value, 0),
      actions: remainingAreas.flatMap((item) => item.actions),
      color: areaPalette[5],
    })
  }
  const segments = (view === 'priority' ? prioritySegments : areaSegments).filter(
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
            <p className="mt-0.5 text-xs text-muted-foreground">
              Distribución de compromisos fuera de fecha
            </p>
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
              view === 'area'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setView('area')}
          >
            Por área
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
            onClick={() => onDrillDown({ title: 'Acciones vencidas', actions: metrics.overdueActions })}
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
            {view === 'priority' ? 'Segmentadas por semáforo' : 'Principales áreas afectadas'}
          </p>
          <p className="mt-1 text-center text-[11px] font-medium text-muted-foreground">
            {total} de {totalActions} accion{totalActions === 1 ? '' : 'es'} · {shareOfAllActions}% del
            total
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
                  onClick={() => onDrillDown({ title: `Vencidas · ${segment.label}`, actions: segment.actions })}
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
            No hay acciones vencidas para los filtros seleccionados.
          </p>
        )}
      </div>
    </div>
  )
}

const agingChartStyles = [
  {
    bar: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    surface: 'border-emerald-500/25 bg-emerald-500/[0.06] hover:bg-emerald-500/10',
    accent: 'border-l-emerald-500',
    ring: 'ring-emerald-500/20',
  },
  {
    bar: 'bg-lime-500',
    text: 'text-lime-700 dark:text-lime-300',
    surface: 'border-lime-500/25 bg-lime-500/[0.06] hover:bg-lime-500/10',
    accent: 'border-l-lime-500',
    ring: 'ring-lime-500/20',
  },
  {
    bar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    surface: 'border-amber-500/25 bg-amber-500/[0.06] hover:bg-amber-500/10',
    accent: 'border-l-amber-500',
    ring: 'ring-amber-500/20',
  },
  {
    bar: 'bg-red-500',
    text: 'text-red-700 dark:text-red-300',
    surface: 'border-red-500/25 bg-red-500/[0.06] hover:bg-red-500/10',
    accent: 'border-l-red-500',
    ring: 'ring-red-500/20',
  },
] as const

const agingBucketMeta = [
  { range: '0–2 días', intent: 'Recién abiertas', question: '¿Qué entró hace poco?' },
  { range: '3–5 días', intent: 'En curso', question: '¿Qué sigue en ventana normal?' },
  { range: '6–10 días', intent: 'Envejeciendo', question: '¿Qué ya pide seguimiento?' },
  { range: '+10 días', intent: 'Backlog viejo', question: '¿Qué lleva demasiado tiempo abierto?' },
] as const

function BacklogByAreaChart({
  items,
  total,
  onDrillDown,
}: {
  items: DashboardAreaMetric[]
  total: number
  onDrillDown: (input: DrillDownInput) => void
}) {
  const primary = items.slice(0, 6)
  const remaining = items.slice(6)
  const visible = remaining.length > 0
    ? [
        ...primary,
        {
          area: 'Otras áreas',
          value: remaining.reduce((sum, item) => sum + item.value, 0),
          actions: remaining.flatMap((item) => item.actions),
        },
      ]
    : primary

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-4">
        <div>
          <p className="text-sm font-semibold">Backlog activo por área</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Participación de cada área sobre el total abierto.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {total} total
        </Badge>
      </div>
      <div className="space-y-1.5 p-4">
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
            No hay backlog para los filtros seleccionados.
          </p>
        ) : visible.map((item) => {
          const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0
          return (
            <button
              key={item.area}
              type="button"
              className="group grid w-full grid-cols-[minmax(6rem,9rem)_minmax(8rem,1fr)_4.75rem] items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onDrillDown({ title: `Backlog · ${item.area}`, actions: item.actions })}
              aria-label={`${item.area}: ${item.value} de ${total} acciones abiertas, ${percentage}%`}
            >
              <span className="truncate text-xs font-medium">{item.area}</span>
              <span className="h-3 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary transition-all group-hover:opacity-80"
                  style={{ width: `${percentage}%` }}
                />
              </span>
              <span className="text-right text-xs tabular-nums">
                <strong className="font-semibold text-foreground">{item.value}</strong>
                <span className="ml-1 text-muted-foreground">· {percentage}%</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AverageOpenAgeCard({
  metric,
  actions,
  loading,
  onDrillDown,
}: {
  metric: DashboardMetric
  actions: AccionDiaria[]
  loading?: boolean
  onDrillDown: (input: DrillDownInput) => void
}) {
  const tone = toneForDays(metric.value)
  const scaleMax = Math.max(10, Math.ceil(metric.value / 5) * 5)
  const marker = Math.min(100, (metric.value / scaleMax) * 100)

  return (
    <div className={cn('flex flex-col rounded-xl border p-5 shadow-sm', toneStyles[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edad promedio</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Backlog aún abierto. Promedio de días desde que se creó cada acción abierta hasta hoy.
            Responde: ¿qué tan viejo está lo que sigue pendiente?
          </p>
        </div>
        <span className="tone-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70">
          <Timer className="h-5 w-5" aria-hidden />
        </span>
      </div>

      <button
        type="button"
        className="mt-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onDrillDown({ title: 'Edad promedio', actions })}
      >
        {loading ? (
          <span className="block h-12 w-32 animate-pulse rounded-lg bg-background/70" />
        ) : (
          <span className="flex items-end gap-2">
            <span className="text-5xl font-bold leading-none tracking-tight tabular-nums">{metric.value}</span>
            <span className="pb-1 text-sm font-medium text-muted-foreground">días</span>
          </span>
        )}
      </button>

      <div className="mt-5">
        <div className="relative h-3 rounded-full bg-background/75">
          <span className="absolute inset-y-0 left-0 w-[30%] rounded-l-full bg-emerald-500/75" />
          <span className="absolute inset-y-0 left-[30%] w-[40%] bg-amber-500/75" />
          <span className="absolute inset-y-0 right-0 w-[30%] rounded-r-full bg-red-500/75" />
          <span
            className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow"
            style={{ left: `${marker}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>0 días</span>
          <span>{scaleMax} días</span>
        </div>
      </div>

      <div
        className={cn(
          'mt-auto flex items-center gap-1.5 pt-5 text-xs font-medium',
          metric.trend.isGood === true && 'text-emerald-700 dark:text-emerald-200',
          metric.trend.isGood === false && 'text-red-700 dark:text-red-200',
          metric.trend.isGood == null && 'text-muted-foreground'
        )}
      >
        {trendIcon(metric.trend.direction)}
        <span>{formatTrend(metric, ' días')}</span>
        <span className="ml-auto text-muted-foreground">Anterior: {metric.previous}</span>
      </div>
    </div>
  )
}

function AgingDistributionChart({
  buckets,
  total,
  onDrillDown,
}: {
  buckets: OperationalDashboardMetrics['agingBuckets']
  total: number
  onDrillDown: (input: DrillDownInput) => void
}) {
  const segments = buckets.map((bucket, index) => {
    const percentage = total > 0 ? Math.round((bucket.count / total) * 100) : 0
    const style = agingChartStyles[index] ?? agingChartStyles[agingChartStyles.length - 1]
    const meta = agingBucketMeta[index] ?? agingBucketMeta[agingBucketMeta.length - 1]
    return { bucket, percentage, style, meta }
  })
  const staleCount = buckets.at(-1)?.count ?? 0
  const stalePct = total > 0 ? Math.round((staleCount / total) * 100) : 0

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-4 sm:px-5">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Timer className="h-4 w-4" aria-hidden />
            </span>
            <p className="text-sm font-semibold">Antigüedad del backlog abierto</p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Días desde que se creó cada acción pendiente. Responde:{' '}
            <span className="font-medium text-foreground/85">¿qué tan viejo está lo que aún no se cierra?</span>
          </p>
        </div>
        <Badge variant="outline" className="h-7 shrink-0 tabular-nums">
          {total} {total === 1 ? 'abierta' : 'abiertas'}
        </Badge>
      </div>

      {total === 0 ? (
        <div className="px-4 py-10 text-center sm:px-5">
          <p className="text-sm font-medium text-foreground">Sin acciones abiertas en el alcance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuando haya backlog pendiente, aquí verás cuánto tiempo lleva abierto.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 border-b border-border/40 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Panorama rápido
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Proporción del backlog en cada rango de antigüedad.
                </p>
              </div>
              {staleCount > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  {staleCount} con +10 días ({stalePct}%)
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Nada con más de 10 días
                </Badge>
              )}
            </div>

            <div
              className="flex h-4 overflow-hidden rounded-full bg-muted shadow-inner"
              role="img"
              aria-label={`Distribución: ${segments.map((segment) => `${segment.meta.range} ${segment.percentage}%`).join(', ')}`}
            >
              {segments.map(({ bucket, percentage, style }) =>
                percentage > 0 ? (
                  <span
                    key={bucket.label}
                    className={cn('h-full transition-all', style.bar)}
                    style={{ width: `${percentage}%` }}
                    title={`${bucket.label}: ${bucket.count} acciones (${percentage}%)`}
                  />
                ) : null
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {segments.map(({ bucket, percentage, style, meta }) => (
                <span
                  key={bucket.label}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', style.bar)} aria-hidden />
                  <span className="font-medium text-foreground/80">{meta.range}</span>
                  <span className="tabular-nums">
                    {bucket.count} · {percentage}%
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-4">
            {segments.map(({ bucket, percentage, style, meta }) => (
              <button
                key={bucket.label}
                type="button"
                className={cn(
                  'group flex flex-col rounded-xl border border-l-4 p-4 text-left transition',
                  'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  style.surface,
                  style.accent,
                  bucket.count > 0 && 'ring-1',
                  bucket.count > 0 && style.ring
                )}
                onClick={() =>
                  onDrillDown({
                    title: `Antigüedad · ${meta.range}`,
                    actions: bucket.actions,
                  })
                }
                aria-label={`${meta.range}, ${meta.intent}: ${bucket.count} acciones, ${percentage}% del backlog`}
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {meta.intent}
                  </p>
                  <p className={cn('text-base font-bold tracking-tight', style.text)}>{meta.range}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{meta.question}</p>
                </div>

                <div className="mt-4 flex items-end justify-between gap-2">
                  <div>
                    <p className={cn('text-3xl font-bold leading-none tabular-nums', style.text)}>
                      {bucket.count}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {bucket.count === 1 ? 'acción' : 'acciones'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-2xl font-bold tabular-nums leading-none', style.text)}>
                      {percentage}%
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">del backlog</p>
                  </div>
                </div>

                <span className="mt-4 block h-2 overflow-hidden rounded-full bg-background/70">
                  <span
                    className={cn('block h-full min-w-[3px] rounded-full transition-all', style.bar)}
                    style={{ width: `${Math.max(percentage, bucket.count > 0 ? 8 : 0)}%` }}
                  />
                </span>

                <span className="mt-3 text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                  Ver detalle →
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PercentRanking({
  items,
  onDrillDown,
}: {
  items: DashboardAreaMetric[]
  onDrillDown: (input: DrillDownInput) => void
}) {
  const visible = items.slice(0, 8)
  if (visible.length === 0) {
    return <p className="rounded-md border border-dashed border-border/70 px-3 py-5 text-center text-sm text-muted-foreground">Sin acciones cerradas en el periodo.</p>
  }
  return (
    <div className="space-y-2">
      {visible.map((item, index) => (
        <button
          key={item.area}
          type="button"
          className="grid w-full grid-cols-[2rem_minmax(6rem,1fr)_minmax(7rem,1.4fr)_3.5rem] items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-muted/40"
          onClick={() => onDrillDown({ title: item.area, actions: item.actions })}
        >
          <Badge variant="secondary" className="justify-center px-1 tabular-nums">{index + 1}</Badge>
          <span className="truncate text-xs font-medium">{item.area}</span>
          <span className="h-2.5 min-w-0 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'block h-full rounded-full',
                toneForPercent(item.value) === 'green' && 'bg-emerald-500',
                toneForPercent(item.value) === 'yellow' && 'bg-amber-500',
                toneForPercent(item.value) === 'red' && 'bg-red-500'
              )}
              style={{ width: `${Math.max(3, item.value)}%` }}
            />
          </span>
          <span className="text-right text-xs font-semibold tabular-nums">{item.value}%</span>
        </button>
      ))}
    </div>
  )
}

function ReliabilityMetricCard({
  title,
  value,
  suffix,
  description,
  formula,
  metric,
  tone,
  actions,
  onDrillDown,
  icon,
  loading,
  targetLabel,
}: {
  title: string
  value: number
  suffix?: string
  description: string
  formula: string
  metric: DashboardMetric
  tone: MetricTone
  actions: AccionDiaria[]
  onDrillDown: (input: DrillDownInput) => void
  icon: ReactNode
  loading?: boolean
  targetLabel?: string
}) {
  const isPercent = suffix === '%'
  const progress = isPercent ? Math.min(100, Math.max(0, value)) : null

  return (
    <div className={cn('flex min-h-0 flex-col rounded-xl border p-4 shadow-sm', toneStyles[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="tone-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/70">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            {targetLabel ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{targetLabel}</p>
            ) : null}
          </div>
        </div>
        <InfoHint text={`${description}. Fórmula: ${formula}`} />
      </div>

      <button
        type="button"
        className="mt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onDrillDown({ title, actions })}
      >
        {loading ? (
          <span className="block h-10 w-24 animate-pulse rounded-lg bg-background/70" />
        ) : (
          <span className="flex items-end gap-1.5">
            <span className="text-4xl font-bold leading-none tracking-tight tabular-nums">{value}</span>
            {suffix ? <span className="pb-1 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
          </span>
        )}
        <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </button>

      {progress != null ? (
        <span className="mt-4 block h-2 overflow-hidden rounded-full bg-background/70">
          <span
            className={cn(
              'block h-full rounded-full transition-all',
              tone === 'green' && 'bg-emerald-500',
              tone === 'yellow' && 'bg-amber-500',
              tone === 'red' && 'bg-red-500',
              tone === 'neutral' && 'bg-slate-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}

      <div
        className={cn(
          'mt-auto flex items-center gap-1.5 pt-4 text-xs font-medium',
          metric.trend.isGood === true && 'text-emerald-700 dark:text-emerald-200',
          metric.trend.isGood === false && 'text-red-700 dark:text-red-200',
          metric.trend.isGood == null && 'text-muted-foreground'
        )}
      >
        {trendIcon(metric.trend.direction)}
        <span>{formatTrend(metric, isPercent ? ' pp' : suffix ? ` ${suffix}` : '')}</span>
      </div>
    </div>
  )
}

function IcoHeroCard({
  metric,
  closedCount,
  actions,
  loading,
  onDrillDown,
}: {
  metric: DashboardMetric
  closedCount: number
  actions: AccionDiaria[]
  loading?: boolean
  onDrillDown: (input: DrillDownInput) => void
}) {
  const tone = toneForPercent(metric.value)
  const clamped = Math.min(100, Math.max(0, metric.value))
  const ringBackground = `conic-gradient(${
    tone === 'green' ? '#10b981' : tone === 'yellow' ? '#f59e0b' : '#ef4444'
  } 0% ${clamped}%, hsl(var(--muted)) ${clamped}% 100%)`

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-emerald-500/[0.04] shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/10">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">ICO global</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Índice de Confiabilidad Operativa del periodo
            </p>
          </div>
        </div>
        <InfoHint text="Porcentaje de acciones cerradas a tiempo sobre el total de acciones cerradas. Fórmula: cerradas a tiempo / cerradas × 100." />
      </div>

      <div className="grid items-center gap-6 p-5 sm:grid-cols-[minmax(10rem,0.85fr)_minmax(12rem,1.15fr)]">
        <button
          type="button"
          className="relative mx-auto aspect-square w-full max-w-44 rounded-full transition duration-200 hover:scale-[1.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ background: ringBackground }}
          onClick={() => onDrillDown({ title: 'ICO global', actions })}
          aria-label={`ICO ${metric.value} por ciento`}
        >
          <span className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full border-4 border-background bg-background shadow-[inset_0_1px_8px_hsl(var(--muted)),0_6px_18px_rgba(15,23,42,0.12)]">
            {loading ? (
              <span className="h-9 w-16 animate-pulse rounded-lg bg-muted" />
            ) : (
              <span className="text-4xl font-bold leading-none tracking-[-0.04em] tabular-nums">
                {metric.value}
                <span className="text-lg font-semibold text-muted-foreground">%</span>
              </span>
            )}
            <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              ICO
            </span>
          </span>
        </button>

        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 bg-background/70 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Acciones cerradas
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{closedCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Base del cálculo en el periodo filtrado.</p>
          </div>
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border bg-background/70 px-3 py-2 text-xs font-medium',
              metric.trend.isGood === true && 'border-emerald-500/25 text-emerald-700 dark:text-emerald-200',
              metric.trend.isGood === false && 'border-red-500/25 text-red-700 dark:text-red-200',
              metric.trend.isGood == null && 'border-border text-muted-foreground'
            )}
          >
            {trendIcon(metric.trend.direction)}
            <span>{formatTrend(metric, ' pp')}</span>
            <span className="text-muted-foreground">· Anterior {metric.previous}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                tone === 'green' && 'bg-emerald-500',
                tone === 'yellow' && 'bg-amber-500',
                tone === 'red' && 'bg-red-500'
              )}
              style={{ width: `${clamped}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function IcoRankingPanel({
  title,
  subtitle,
  items,
  onDrillDown,
  icon,
}: {
  title: string
  subtitle: string
  items: DashboardAreaMetric[]
  onDrillDown: (input: DrillDownInput) => void
  icon: ReactNode
}) {
  const visible = items.slice(0, 8)

  return (
    <div className="flex min-h-52 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 tabular-nums">
          {items.length}
        </Badge>
      </div>
      <div className="space-y-1.5 p-4">
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
            Sin cierres en el periodo para calcular ICO.
          </p>
        ) : (
          visible.map((item, index) => {
            const tone = toneForPercent(item.value)
            const closed = item.total ?? item.actions.length
            return (
              <button
                key={item.area}
                type="button"
                className="group grid w-full grid-cols-[1.75rem_minmax(5.5rem,8.5rem)_minmax(7rem,1fr)_3.25rem] items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onDrillDown({ title: `${title} · ${item.area}`, actions: item.actions })}
                aria-label={`${item.area}: ICO ${item.value}%, ${closed} cierres`}
              >
                <Badge variant="secondary" className="justify-center px-1 tabular-nums">
                  {index + 1}
                </Badge>
                <span className="min-w-0 truncate text-xs font-medium">{item.area}</span>
                <span className="min-w-0">
                  <span className="block h-2.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full transition-all',
                        tone === 'green' && 'bg-emerald-500',
                        tone === 'yellow' && 'bg-amber-500',
                        tone === 'red' && 'bg-red-500'
                      )}
                      style={{ width: `${Math.max(3, item.value)}%` }}
                    />
                  </span>
                  <span className="mt-1 block text-[10px] tabular-nums text-muted-foreground">
                    {closed} {closed === 1 ? 'cierre' : 'cierres'}
                  </span>
                </span>
                <span className="text-right text-xs font-bold tabular-nums">{item.value}%</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function matchesPriorityFilter(
  action: AccionDiaria,
  priorityFilter: string,
  priorities: Priority[]
): boolean {
  if (priorityFilter === 'all') return true
  const matched = findPriorityForAccion(action, priorities)
  if (matched) return matched.id === priorityFilter
  return action.prioridad_id === priorityFilter || action.prioridad === priorityFilter
}

function filterOpenActionsByPriority(
  actions: AccionDiaria[],
  priorityFilter: string,
  priorities: Priority[]
): AccionDiaria[] {
  if (priorityFilter === 'all') return actions
  return actions.filter((action) => matchesPriorityFilter(action, priorityFilter, priorities))
}

function filterAgingBuckets(
  buckets: DashboardAgingBucket[],
  openActions: AccionDiaria[]
): DashboardAgingBucket[] {
  const ids = new Set(openActions.map((action) => action.id))
  return buckets.map((bucket) => {
    const actions = bucket.actions.filter((action) => ids.has(action.id))
    return { ...bucket, actions, count: actions.length }
  })
}

function filterBacklogByArea(
  items: DashboardAreaMetric[],
  openActions: AccionDiaria[]
): DashboardAreaMetric[] {
  const ids = new Set(openActions.map((action) => action.id))
  return items
    .map((item) => {
      const actions = item.actions.filter((action) => ids.has(action.id))
      return { ...item, actions, value: actions.length }
    })
    .filter((item) => item.value > 0)
}

function averageOpenAgeMetric(
  openActions: AccionDiaria[],
  today: string,
  baseline: DashboardMetric,
  isFiltered: boolean
): DashboardMetric {
  if (!isFiltered) return baseline
  if (openActions.length === 0) {
    return {
      value: 0,
      previous: 0,
      trend: { current: 0, previous: 0, delta: 0, direction: 'flat', isGood: null },
    }
  }
  const dayMs = 86_400_000
  const end = Date.parse(`${today}T00:00:00`)
  const sum = openActions.reduce((acc, action) => {
    const start = Date.parse(action.created_at)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return acc
    return acc + Math.max(0, (end - start) / dayMs)
  }, 0)
  const value = Math.round((sum / openActions.length) * 10) / 10
  return {
    value,
    previous: value,
    trend: { current: value, previous: value, delta: 0, direction: 'flat', isGood: null },
  }
}

function CargaOperativaSection({
  metrics,
  priorities,
  isLoading,
  onDrillDown,
}: {
  metrics: OperationalDashboardMetrics
  priorities: Priority[]
  isLoading?: boolean
  onDrillDown: (input: DrillDownInput) => void
}) {
  const [priorityFilter, setPriorityFilter] = useState('all')

  const priorityOptions = useMemo(() => {
    const sorted = [...priorities].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    return sorted.map((priority) => ({
      value: priority.id,
      label: priorityDisplayLabel(priority.nombre),
    }))
  }, [priorities])

  const filteredOpenActions = useMemo(
    () => filterOpenActionsByPriority(metrics.openActions, priorityFilter, priorities),
    [metrics.openActions, priorities, priorityFilter]
  )
  const openTotal = filteredOpenActions.length
  const agingBuckets = useMemo(
    () => filterAgingBuckets(metrics.agingBuckets, filteredOpenActions),
    [filteredOpenActions, metrics.agingBuckets]
  )
  const backlogByArea = useMemo(
    () => filterBacklogByArea(metrics.backlogByArea, filteredOpenActions),
    [filteredOpenActions, metrics.backlogByArea]
  )
  const avgOpenAgeDays = useMemo(
    () =>
      averageOpenAgeMetric(
        filteredOpenActions,
        metrics.today,
        metrics.avgOpenAgeDays,
        priorityFilter !== 'all'
      ),
    [filteredOpenActions, metrics.avgOpenAgeDays, metrics.today, priorityFilter]
  )

  return (
    <section className="scroll-mt-4">
      <SectionCard>
        <SectionCardHeader
          eyebrow="Carga operativa"
          title="Trabajo abierto y antigüedad"
          subtitle="Dónde se concentra el trabajo pendiente y cuánto tiempo lleva abierto."
          icon={Timer}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger
                  className="h-8 w-[11.5rem] border-border/70 bg-background text-xs"
                  aria-label="Filtrar por prioridad"
                >
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las prioridades</SelectItem>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="h-7 gap-1.5 px-2.5 tabular-nums">
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                {openTotal} {openTotal === 1 ? 'acción abierta' : 'acciones abiertas'}
              </Badge>
            </div>
          }
        />
        <SectionCardBody className="space-y-5">
          <AgingDistributionChart
            buckets={agingBuckets}
            total={openTotal}
            onDrillDown={onDrillDown}
          />
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <BacklogByAreaChart
              items={backlogByArea}
              total={openTotal}
              onDrillDown={onDrillDown}
            />
            <AverageOpenAgeCard
              metric={avgOpenAgeDays}
              actions={filteredOpenActions}
              onDrillDown={onDrillDown}
              loading={isLoading}
            />
          </div>
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}

export function DashboardExecutivePanel({
  metrics,
  priorities = [],
  isLoading,
  onDrillDown,
}: DashboardExecutivePanelProps) {
  return (
    <div id="dashboard-executive-panel" className="space-y-5">
      <section className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            eyebrow="Salud operativa"
            title="Atencion inmediata"
            subtitle="Riesgos activos que requieren seguimiento durante el dia."
            icon={AlertTriangle}
          />
          <SectionCardBody className="space-y-4">
            <div className="grid items-stretch gap-4 lg:grid-cols-2">
              <ActionsPriorityPie
                metrics={metrics}
                onDrillDown={onDrillDown}
                loading={isLoading}
              />
              <OverdueBreakdownPie
                metrics={metrics}
                onDrillDown={onDrillDown}
                loading={isLoading}
              />
            </div>
            <div className="grid items-stretch gap-4 sm:grid-cols-2">
              <ReliabilityMetricCard
                title="Tiempo prom. rojos"
                value={metrics.avgOpenAgeRedDays.value}
                suffix="días"
                description="Acciones rojas ya cerradas. Promedio de días desde la creación hasta el cierre operativo."
                formula="fecha cierre − fecha creación (rojas cerradas)"
                metric={metrics.avgOpenAgeRedDays}
                tone={toneForDays(metrics.avgOpenAgeRedDays.value)}
                actions={metrics.redClosedActions}
                onDrillDown={onDrillDown}
                icon={<Timer className="h-4.5 w-4.5" aria-hidden />}
                loading={isLoading}
              />
              <ReliabilityMetricCard
                title="Tiempo prom. demás"
                value={metrics.avgOpenAgeOthersDays.value}
                suffix="días"
                description="Acciones no rojas ya cerradas. Promedio de días desde la creación hasta el cierre operativo."
                formula="fecha cierre − fecha creación (amarillas y verdes cerradas)"
                metric={metrics.avgOpenAgeOthersDays}
                tone={toneForDays(metrics.avgOpenAgeOthersDays.value)}
                actions={metrics.otherClosedActions}
                onDrillDown={onDrillDown}
                icon={<Timer className="h-4.5 w-4.5" aria-hidden />}
                loading={isLoading}
              />
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      <section className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            eyebrow="Ejecución"
            title="Confiabilidad de compromisos"
            subtitle="Velocidad de cierre y cumplimiento contra fecha compromiso."
            icon={ShieldCheck}
            action={
              <Badge variant="secondary" className="h-7 gap-1.5 px-2.5 tabular-nums">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {metrics.closedActions.length}{' '}
                {metrics.closedActions.length === 1 ? 'cierre' : 'cierres'}
              </Badge>
            }
          />
          <SectionCardBody className="space-y-5">
            <IcoHeroCard
              metric={metrics.ico}
              closedCount={metrics.closedActions.length}
              actions={metrics.closedActions}
              onDrillDown={onDrillDown}
              loading={isLoading}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <IcoRankingPanel
                title="ICO por área"
                subtitle="Ranking de confiabilidad operativa por área."
                items={metrics.icoByArea}
                onDrillDown={onDrillDown}
                icon={<Building2 className="h-4.5 w-4.5" aria-hidden />}
              />
              <IcoRankingPanel
                title="ICO por usuario"
                subtitle="Ranking de confiabilidad por responsable."
                items={metrics.icoByUser}
                onDrillDown={onDrillDown}
                icon={<Users className="h-4.5 w-4.5" aria-hidden />}
              />
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      <CargaOperativaSection
        metrics={metrics}
        priorities={priorities}
        isLoading={isLoading}
        onDrillDown={onDrillDown}
      />

      <section className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            eyebrow="Desempeno"
            title="Cumplimiento por area"
            subtitle="Ranking de areas segun compromisos cerrados a tiempo."
            icon={TrendingUp}
          />
          <SectionCardBody>
            <PercentRanking items={metrics.complianceByArea} onDrillDown={onDrillDown} />
          </SectionCardBody>
        </SectionCard>
      </section>
    </div>
  )
}

