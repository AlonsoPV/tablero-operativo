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
import type { Priority, Status } from '@/features/catalogs/types/catalogs.types'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityDisplayLabel } from '@/features/operations/utils/priorityLabels'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'
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
  statuses?: Status[]
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

function cleanKey(value: string | null | undefined): string {
  return (value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function actionAreaLabel(action: AccionDiaria): string {
  return action.area?.trim() || 'Sin area'
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

type ActionsBreakdownDimension = 'estatus' | 'prioridad' | 'area'

const AREA_PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#ea580c', '#64748b']
const STATUS_FALLBACK_PALETTE = ['#0f766e', '#2563eb', '#7c3aed', '#ca8a04', '#dc2626', '#64748b']
const PRIORITY_SEGMENT_META: Record<'rojo' | 'amarillo' | 'verde', { label: string; color: string }> = {
  rojo: { label: 'Rojos', color: '#ef4444' },
  amarillo: { label: 'Amarillos', color: '#f59e0b' },
  verde: { label: 'Verdes', color: '#10b981' },
}

function resolveStatusColor(status: Status | undefined, index: number): string {
  const raw = status?.color?.trim()
  if (raw && /^#|rgb|hsl|oklch/i.test(raw)) return raw
  if (raw && !raw.includes(' ')) {
    // Tailwind-like tokens are not usable as CSS color here; fall back.
  }
  return STATUS_FALLBACK_PALETTE[index % STATUS_FALLBACK_PALETTE.length]
}

function groupActionsByKey(
  actions: AccionDiaria[],
  getKey: (action: AccionDiaria) => string,
  getColor: (key: string, index: number) => string
): PieBreakdownSegment[] {
  const map = new Map<string, AccionDiaria[]>()
  for (const action of actions) {
    const key = getKey(action)
    const list = map.get(key)
    if (list) list.push(action)
    else map.set(key, [action])
  }
  return [...map.entries()]
    .map(([label, grouped], index) => ({
      label,
      value: grouped.length,
      actions: grouped,
      color: getColor(label, index),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

function groupActionsByDimension(
  actions: AccionDiaria[],
  dimension: ActionsBreakdownDimension,
  statuses: Status[],
  priorities: Priority[]
): PieBreakdownSegment[] {
  if (dimension === 'prioridad') {
    const buckets: Record<'rojo' | 'amarillo' | 'verde', AccionDiaria[]> = {
      rojo: [],
      amarillo: [],
      verde: [],
    }
    for (const action of actions) {
      const priority = findPriorityForAccion(action, priorities)
      const color = priorityColorFor(priority?.nombre ?? action.prioridad, priority?.color)
      buckets[color].push(action)
    }
    return (['rojo', 'amarillo', 'verde'] as const)
      .map((key) => ({
        label: PRIORITY_SEGMENT_META[key].label,
        value: buckets[key].length,
        actions: buckets[key],
        color: PRIORITY_SEGMENT_META[key].color,
      }))
      .filter((segment) => segment.value > 0)
  }

  if (dimension === 'estatus') {
    const statusByName = new Map(
      statuses.map((status) => [cleanKey(status.nombre), status] as const)
    )
    const statusByKey = new Map(
      statuses
        .filter((status) => status.estado_key)
        .map((status) => [cleanKey(status.estado_key), status] as const)
    )
    return groupActionsByKey(
      actions,
      (action) => {
        const key = cleanKey(action.estado)
        return (
          statusByKey.get(key)?.nombre ??
          statusByName.get(key)?.nombre ??
          (action.estado?.trim() || 'Sin estatus')
        )
      },
      (label, index) => {
        const status =
          statusByName.get(cleanKey(label)) ??
          statuses.find((item) => cleanKey(item.nombre) === cleanKey(label))
        return resolveStatusColor(status, index)
      }
    )
  }

  return groupActionsByKey(
    actions,
    actionAreaLabel,
    (_label, index) => AREA_PALETTE[index % AREA_PALETTE.length]
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

function ModuleFilterToggle({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <div
      className="inline-flex w-full items-center gap-0.5 rounded-lg border border-border/60 bg-muted/35 p-0.5 sm:w-auto"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:flex-none',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function InsightModuleShell({
  icon,
  iconClassName,
  title,
  subtitle,
  hint,
  toolbar,
  children,
  accentClassName,
}: {
  icon: ReactNode
  iconClassName: string
  title: string
  subtitle: string
  hint: string
  toolbar?: ReactNode
  children: ReactNode
  accentClassName: string
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 shadow-sm',
        'bg-gradient-to-br from-background via-background',
        accentClassName
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border/50 px-3.5 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-10 sm:w-10',
                iconClassName
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight sm:text-base">{title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">{subtitle}</p>
            </div>
          </div>
          <InfoHint text={hint} />
        </div>
        {toolbar ? <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{toolbar}</div> : null}
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-5">{children}</div>
    </div>
  )
}

function DonutHero({
  background,
  value,
  unit,
  loading,
  onClick,
  ariaLabel,
  caption,
  toneClassName,
}: {
  background?: string
  value: ReactNode
  unit: string
  loading?: boolean
  onClick: () => void
  ariaLabel: string
  caption?: string
  toneClassName?: string
}) {
  return (
    <div className="mx-auto w-full max-w-[11.5rem] sm:max-w-[13rem]">
      <div className="relative">
        {background ? (
          <span className="absolute inset-2 rounded-full bg-primary/5 blur-xl" aria-hidden />
        ) : null}
        <button
          type="button"
          className={cn(
            'relative aspect-square w-full rounded-full transition duration-200',
            'hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !background && 'border border-border/50'
          )}
          style={background ? { background } : undefined}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          <span
            className={cn(
              'absolute inset-[18%] flex flex-col items-center justify-center rounded-full border-[3px] border-background bg-background',
              'shadow-[inset_0_1px_6px_hsl(var(--muted)/0.7),0_4px_14px_rgba(15,23,42,0.08)] sm:inset-[20%] sm:border-4',
              toneClassName
            )}
          >
            {loading ? (
              <span className="h-8 w-14 animate-pulse rounded-lg bg-muted sm:h-9 sm:w-16" />
            ) : (
              <span className="text-3xl font-bold leading-none tracking-[-0.04em] tabular-nums sm:text-4xl">
                {value}
              </span>
            )}
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:mt-1.5 sm:text-[10px] sm:tracking-[0.16em]">
              {unit}
            </span>
          </span>
        </button>
      </div>
      {caption ? (
        <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  )
}

function SegmentLegendList({
  segments,
  total,
  emptyLabel,
  onSelect,
  titlePrefix,
}: {
  segments: PieBreakdownSegment[]
  total: number
  emptyLabel: string
  onSelect: (segment: PieBreakdownSegment) => void
  titlePrefix: string
}) {
  if (segments.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
      {segments.map((segment) => {
        const percentage = total > 0 ? Math.round((segment.value / total) * 100) : 0
        return (
          <button
            key={segment.label}
            type="button"
            className="group rounded-xl border border-border/55 bg-background/80 px-3 py-2 text-left transition duration-200 hover:border-border hover:bg-muted/30 hover:shadow-sm"
            onClick={() => onSelect(segment)}
            title={`${segment.label}: ${segment.value} de ${total} (${percentage}%)`}
          >
            <span className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ring-2 ring-background"
                style={{ backgroundColor: segment.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{segment.label}</span>
              <span className="text-sm font-bold tabular-nums">{segment.value}</span>
              <span className="min-w-[2.25rem] rounded-md bg-muted/60 px-1.5 py-0.5 text-right text-[10px] font-medium tabular-nums text-muted-foreground sm:text-[11px]">
                {percentage}%
              </span>
            </span>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted/80">
              <span
                className="block h-full rounded-full transition-all"
                style={{ width: `${percentage}%`, backgroundColor: segment.color }}
              />
            </span>
            <span className="sr-only">{titlePrefix}</span>
          </button>
        )
      })}
    </div>
  )
}

function ActionsByAreaModule({
  metrics,
  priorities,
  statuses,
  onDrillDown,
  loading,
}: {
  metrics: OperationalDashboardMetrics
  priorities: Priority[]
  statuses: Status[]
  onDrillDown: (input: DrillDownInput) => void
  loading?: boolean
}) {
  const [dimension, setDimension] = useState<ActionsBreakdownDimension>('estatus')

  const actions = metrics.totalActions
  const total = actions.length
  const segments = useMemo(
    () => groupActionsByDimension(actions, dimension, statuses, priorities),
    [actions, dimension, priorities, statuses]
  )
  const chartBackground = conicGradientFor(segments, total)

  const dimensionMeta: Record<ActionsBreakdownDimension, string> = {
    estatus: 'Distribución por estatus',
    prioridad: 'Distribución por prioridad',
    area: 'Distribución por área',
  }
  const captionCountLabel =
    dimension === 'estatus'
      ? `${segments.length} estatus`
      : dimension === 'prioridad'
        ? `${segments.length} prioridad${segments.length === 1 ? '' : 'es'}`
        : `${segments.length} área${segments.length === 1 ? '' : 's'}`

  return (
    <InsightModuleShell
      icon={<ListChecks className="h-5 w-5" aria-hidden />}
      iconClassName="bg-primary/10 text-primary ring-primary/15"
      title="Acciones"
      subtitle={dimensionMeta[dimension]}
      hint="Muestra todas las acciones del tablero (según sus filtros globales) segmentadas por estatus, prioridad o área."
      accentClassName="to-muted/30"
      toolbar={
        <ModuleFilterToggle
          ariaLabel="Segmentar gráfica"
          value={dimension}
          onChange={(value) => setDimension(value as ActionsBreakdownDimension)}
          options={[
            { value: 'estatus', label: 'Estatus' },
            { value: 'prioridad', label: 'Prioridad' },
            { value: 'area', label: 'Área' },
          ]}
        />
      }
    >
      <div className="grid flex-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(9.5rem,0.9fr)_minmax(0,1.25fr)] lg:items-stretch">
        <DonutHero
          background={chartBackground}
          value={total}
          unit="acciones"
          loading={loading}
          onClick={() => onDrillDown({ title: 'Acciones', actions })}
          ariaLabel={`Ver ${total} acciones`}
          caption={`${captionCountLabel} · toca para detalle`}
        />
        <SegmentLegendList
          segments={segments}
          total={total}
          emptyLabel="No hay acciones para los filtros del tablero."
          titlePrefix="Acciones"
          onSelect={(segment) =>
            onDrillDown({ title: `Acciones · ${segment.label}`, actions: segment.actions })
          }
        />
      </div>
    </InsightModuleShell>
  )
}

const DAY_MS = 86_400_000

function verifiedCloseEnd(action: AccionDiaria): string | null {
  if (action.verified_at) return action.verified_at
  if (cleanKey(action.estado) === 'verificado') return action.updated_at ?? null
  return null
}

function verifiedCloseAgeDays(action: AccionDiaria): number | null {
  const end = verifiedCloseEnd(action)
  if (!end) return null
  const start = Date.parse(action.created_at)
  const finish = Date.parse(end)
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return null
  return Math.max(0, (finish - start) / DAY_MS)
}

function AvgVerifiedCloseModule({
  metrics,
  onDrillDown,
  loading,
}: {
  metrics: OperationalDashboardMetrics
  onDrillDown: (input: DrillDownInput) => void
  loading?: boolean
}) {
  const [scope, setScope] = useState<'rojos' | 'todos'>('rojos')

  const verifiedActions = useMemo(() => {
    if (scope === 'rojos') return metrics.redClosedActions
    return metrics.totalActions.filter((action) => verifiedCloseEnd(action) != null)
  }, [metrics.redClosedActions, metrics.totalActions, scope])

  const ages = verifiedActions
    .map(verifiedCloseAgeDays)
    .filter((value): value is number => value != null)
  const avgDays =
    ages.length > 0 ? Math.round((ages.reduce((sum, value) => sum + value, 0) / ages.length) * 10) / 10 : 0
  const tone = toneForDays(avgDays)
  const scaleMax = Math.max(10, Math.ceil(avgDays / 5) * 5 || 10)
  const marker = Math.min(100, (avgDays / scaleMax) * 100)
  const sample = verifiedActions.length
  const drillTitle = scope === 'rojos' ? 'Tiempo a verificado · Rojos' : 'Tiempo a verificado'
  const openDetail = () => onDrillDown({ title: drillTitle, actions: verifiedActions })

  const toneHero: Record<MetricTone, string> = {
    green: 'bg-emerald-500/[0.06]',
    yellow: 'bg-amber-500/[0.06]',
    red: 'bg-red-500/[0.07]',
    neutral: 'bg-muted/40',
  }

  return (
    <InsightModuleShell
      icon={<Timer className="h-5 w-5" aria-hidden />}
      iconClassName="bg-red-500/10 text-red-600 ring-red-500/15"
      title="Tiempo a verificado"
      subtitle="Promedio creación → Verificado"
      hint="Promedio de días desde la creación hasta Verificado. En Hecho las acciones siguen abiertas y no entran al cálculo."
      accentClassName="to-red-500/[0.04]"
      toolbar={
        <ModuleFilterToggle
          ariaLabel="Alcance del promedio"
          value={scope}
          onChange={(value) => setScope(value as 'rojos' | 'todos')}
          options={[
            { value: 'rojos', label: 'Rojos' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
      }
    >
      <div className="grid flex-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(9.5rem,0.9fr)_minmax(0,1.25fr)] lg:items-stretch">
        <DonutHero
          value={avgDays}
          unit="días prom."
          loading={loading}
          onClick={openDetail}
          ariaLabel={`${avgDays} días promedio a verificado`}
          caption={`${sample} verificada${sample === 1 ? '' : 's'} · toca para detalle`}
          toneClassName={toneHero[tone]}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <div className="rounded-xl border border-border/55 bg-background/80 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Escala
              </p>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
                {scope === 'rojos' ? 'Solo rojos' : 'Todas'}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/80">verified_at − created_at</span>
            </p>
            <div className="mt-3.5">
              <div className="relative h-2.5 rounded-full bg-muted/90">
                <span className="absolute inset-y-0 left-0 w-[30%] rounded-l-full bg-emerald-500/80" />
                <span className="absolute inset-y-0 left-[30%] w-[40%] bg-amber-500/80" />
                <span className="absolute inset-y-0 right-0 w-[30%] rounded-r-full bg-red-500/80" />
                <span
                  className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow"
                  style={{ left: `${marker}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>0 d</span>
                <span className="text-emerald-700/80 dark:text-emerald-300/80">rápido</span>
                <span className="text-red-700/80 dark:text-red-300/80">lento</span>
                <span>{scaleMax} d</span>
              </div>
            </div>
          </div>

          {sample === 0 ? (
            <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
              No hay acciones verificadas para este alcance.
            </p>
          ) : (
            <button
              type="button"
              className="mt-auto flex w-full items-center justify-between gap-3 rounded-xl border border-border/55 bg-background/80 px-3.5 py-3 text-left transition hover:border-border hover:bg-muted/30"
              onClick={openDetail}
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground">Ver detalle</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {sample} accion{sample === 1 ? '' : 'es'} en el promedio
                </span>
              </span>
              <span className="text-lg font-bold tabular-nums text-foreground">{sample}</span>
            </button>
          )}
        </div>
      </div>
    </InsightModuleShell>
  )
}

const agingChartStyles = [
  { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  { bar: 'bg-lime-500', text: 'text-lime-700 dark:text-lime-300', dot: 'bg-lime-500' },
  { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
] as const

const agingBucketMeta = [
  { range: '0–2 días', label: 'Reciente' },
  { range: '3–5 días', label: 'En curso' },
  { range: '6–10 días', label: 'Envejeciendo' },
  { range: '+10 días', label: 'Viejo' },
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

function AverageDaysStat({
  label,
  hint,
  value,
  actions,
  loading,
  onDrillDown,
}: {
  label: string
  hint: string
  value: number
  actions: AccionDiaria[]
  loading?: boolean
  onDrillDown: (input: DrillDownInput) => void
}) {
  const tone = toneForDays(value)

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3 text-left transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onDrillDown({ title: label, actions })}
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{hint}</span>
      </span>
      {loading ? (
        <span className="h-8 w-16 animate-pulse rounded-md bg-muted" />
      ) : (
        <span className="flex items-baseline gap-1">
          <span
            className={cn(
              'text-2xl font-bold tabular-nums leading-none',
              tone === 'green' && 'text-emerald-700 dark:text-emerald-300',
              tone === 'yellow' && 'text-amber-700 dark:text-amber-300',
              tone === 'red' && 'text-red-700 dark:text-red-300',
              tone === 'neutral' && 'text-foreground'
            )}
          >
            {value}
          </span>
          <span className="text-xs text-muted-foreground">días</span>
        </span>
      )}
    </button>
  )
}

function AvgCloseByUserList({
  items,
  onDrillDown,
}: {
  items: DashboardAreaMetric[]
  onDrillDown: (input: DrillDownInput) => void
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
        No hay cierres para calcular el promedio por usuario.
      </p>
    )
  }

  const maxDays = Math.max(...items.map((item) => item.value), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className="text-xs font-medium text-muted-foreground">Tiempo de cierre por responsable</p>
        <p className="text-[11px] text-muted-foreground">creación → cierre</p>
      </div>
      <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
        {items.map((item) => {
          const sample = item.total ?? item.actions.length
          const barWidth = Math.max(4, Math.round((item.value / maxDays) * 100))
          return (
            <button
              key={item.area}
              type="button"
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
              onClick={() =>
                onDrillDown({
                  title: `Cierre prom. · ${item.area}`,
                  actions: item.actions,
                })
              }
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{item.area}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {sample} cierre{sample === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      toneForDays(item.value) === 'green' && 'bg-emerald-500',
                      toneForDays(item.value) === 'yellow' && 'bg-amber-500',
                      toneForDays(item.value) === 'red' && 'bg-red-500',
                      toneForDays(item.value) === 'neutral' && 'bg-slate-400'
                    )}
                    style={{ width: `${barWidth}%` }}
                  />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className={cn(
                    'block text-base font-semibold tabular-nums leading-none',
                    toneForDays(item.value) === 'green' && 'text-emerald-700 dark:text-emerald-300',
                    toneForDays(item.value) === 'yellow' && 'text-amber-700 dark:text-amber-300',
                    toneForDays(item.value) === 'red' && 'text-red-700 dark:text-red-300'
                  )}
                >
                  {item.value}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">días</span>
              </span>
            </button>
          )
        })}
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

  if (total === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        No hay acciones abiertas en el alcance.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div
        className="flex h-3 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Distribución: ${segments.map((segment) => `${segment.meta.range} ${segment.percentage}%`).join(', ')}`}
      >
        {segments.map(({ bucket, percentage, style }) =>
          percentage > 0 ? (
            <span
              key={bucket.label}
              className={cn('h-full transition-all', style.bar)}
              style={{ width: `${percentage}%` }}
              title={`${bucket.label}: ${bucket.count} (${percentage}%)`}
            />
          ) : null
        )}
      </div>

      <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
        {segments.map(({ bucket, percentage, style, meta }) => (
          <button
            key={bucket.label}
            type="button"
            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:px-4 sm:py-3"
            onClick={() =>
              onDrillDown({
                title: `Antigüedad · ${meta.range}`,
                actions: bucket.actions,
              })
            }
            aria-label={`${meta.label}, ${meta.range}: ${bucket.count} acciones, ${percentage}%`}
          >
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', style.dot)} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">{meta.range}</span>
                <span className="text-[11px] text-muted-foreground">{meta.label}</span>
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', style.bar)}
                  style={{ width: `${percentage}%` }}
                />
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className={cn('block text-base font-semibold tabular-nums leading-none', style.text)}>
                {bucket.count}
              </span>
              <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                {percentage}%
              </span>
            </span>
          </button>
        ))}
      </div>
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

function averageCloseDaysMetric(
  closedActions: AccionDiaria[],
  baseline: DashboardMetric,
  isFiltered: boolean
): DashboardMetric {
  if (!isFiltered) return baseline
  if (closedActions.length === 0) {
    return {
      value: 0,
      previous: 0,
      trend: { current: 0, previous: 0, delta: 0, direction: 'flat', isGood: null },
    }
  }
  const ages = closedActions
    .map((action) => {
      const end = action.verified_at ?? action.completed_at ?? action.updated_at
      if (!end) return null
      const start = Date.parse(action.created_at)
      const finish = Date.parse(end)
      if (!Number.isFinite(start) || !Number.isFinite(finish)) return null
      return Math.max(0, (finish - start) / 86_400_000)
    })
    .filter((value): value is number => value != null)
  const value =
    ages.length > 0 ? Math.round((ages.reduce((sum, n) => sum + n, 0) / ages.length) * 10) / 10 : 0
  return {
    value,
    previous: value,
    trend: { current: value, previous: value, delta: 0, direction: 'flat', isGood: null },
  }
}

function filterCloseByUser(
  items: DashboardAreaMetric[],
  priorityFilter: string,
  priorities: Priority[]
): DashboardAreaMetric[] {
  if (priorityFilter === 'all') return items
  return items
    .map((item) => {
      const actions = item.actions.filter((action) =>
        matchesPriorityFilter(action, priorityFilter, priorities)
      )
      if (actions.length === 0) {
        return { ...item, actions, value: 0, total: 0 }
      }
      const ages = actions
        .map((action) => {
          const end = action.verified_at ?? action.completed_at ?? action.updated_at
          if (!end) return null
          const start = Date.parse(action.created_at)
          const finish = Date.parse(end)
          if (!Number.isFinite(start) || !Number.isFinite(finish)) return null
          return Math.max(0, (finish - start) / 86_400_000)
        })
        .filter((value): value is number => value != null)
      const value =
        ages.length > 0 ? Math.round((ages.reduce((sum, n) => sum + n, 0) / ages.length) * 10) / 10 : 0
      return { ...item, actions, value, total: actions.length }
    })
    .filter((item) => (item.total ?? 0) > 0)
    .sort((a, b) => a.value - b.value || a.area.localeCompare(b.area))
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
  const filteredClosedActions = useMemo(
    () => filterOpenActionsByPriority(metrics.closedActions, priorityFilter, priorities),
    [metrics.closedActions, priorities, priorityFilter]
  )
  const openTotal = filteredOpenActions.length
  const agingBuckets = useMemo(
    () => filterAgingBuckets(metrics.agingBuckets, filteredOpenActions),
    [filteredOpenActions, metrics.agingBuckets]
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
  const avgCloseDays = useMemo(
    () =>
      averageCloseDaysMetric(
        filteredClosedActions,
        metrics.avgCloseDays,
        priorityFilter !== 'all'
      ),
    [filteredClosedActions, metrics.avgCloseDays, priorityFilter]
  )
  const closeByUser = useMemo(
    () => filterCloseByUser(metrics.avgCloseDaysByUser, priorityFilter, priorities),
    [metrics.avgCloseDaysByUser, priorities, priorityFilter]
  )

  return (
    <section className="scroll-mt-4">
      <SectionCard>
        <SectionCardHeader
          eyebrow="Carga operativa"
          title="Antigüedad y cierre"
          subtitle="Qué tan viejo está el backlog abierto y cuánto tarda cada responsable en cerrar."
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
              <Badge variant="secondary" className="h-7 px-2.5 tabular-nums">
                {openTotal} abierta{openTotal === 1 ? '' : 's'}
              </Badge>
            </div>
          }
        />
        <SectionCardBody className="space-y-4 p-3 sm:space-y-5 sm:p-4 md:p-6">
          <AgingDistributionChart
            buckets={agingBuckets}
            total={openTotal}
            onDrillDown={onDrillDown}
          />
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <AverageDaysStat
              label="Edad promedio abierta"
              hint="Creación → hoy"
              value={avgOpenAgeDays.value}
              actions={filteredOpenActions}
              onDrillDown={onDrillDown}
              loading={isLoading}
            />
            <AverageDaysStat
              label="Tiempo promedio de cierre"
              hint="Creación → cierre"
              value={avgCloseDays.value}
              actions={filteredClosedActions}
              onDrillDown={onDrillDown}
              loading={isLoading}
            />
          </div>
          <AvgCloseByUserList items={closeByUser} onDrillDown={onDrillDown} />
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}

export function DashboardExecutivePanel({
  metrics,
  priorities = [],
  statuses = [],
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
            subtitle="Distribucion de acciones y velocidad de cierre a Verificado."
            icon={AlertTriangle}
          />
          <SectionCardBody className="space-y-3 p-3 sm:space-y-4 sm:p-4 md:p-6">
            <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-2">
              <ActionsByAreaModule
                metrics={metrics}
                priorities={priorities}
                statuses={statuses}
                onDrillDown={onDrillDown}
                loading={isLoading}
              />
              <AvgVerifiedCloseModule
                metrics={metrics}
                onDrillDown={onDrillDown}
                loading={isLoading}
              />
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      {/* Confiabilidad de compromisos / ICO — oculto temporalmente
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
      */}

      <CargaOperativaSection
        metrics={metrics}
        priorities={priorities}
        isLoading={isLoading}
        onDrillDown={onDrillDown}
      />

      {/* Cumplimiento por área — oculto temporalmente
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
      */}
    </div>
  )
}

// Conservar símbolos de secciones ocultas temporalmente (ICO / backlog / cumplimiento).
void [
  BacklogByAreaChart,
  PercentRanking,
  IcoHeroCard,
  IcoRankingPanel,
  ReliabilityMetricCard,
  filterBacklogByArea,
  Building2,
  Users,
  ShieldCheck,
]

