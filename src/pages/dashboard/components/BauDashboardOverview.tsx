import { useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarRange,
  ChevronRight,
  ListChecks,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import {
  priorityColorFor,
  type PriorityColor,
} from '@/features/operations/utils/priorityColors'
import { priorityDisplayLabel } from '@/features/operations/utils/priorityLabels'
import type { OperationalDashboardMetrics } from '../hooks/useOperationalDashboardMetrics'

type DrillDownInput = {
  title: string
  actions: AccionDiaria[]
}

function CardShell({
  title,
  icon: Icon = Activity,
  children,
  className,
  action,
}: {
  title: string
  icon?: typeof Activity
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
          <h2 className="truncate text-sm font-semibold tracking-tight sm:text-[15px]">
            {title}
          </h2>
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function OwnerAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
      title={name}
      aria-hidden
    >
      {initials || <UserRound className="h-3.5 w-3.5" />}
    </span>
  )
}

function priorityTone(color: PriorityColor): {
  square: string
  bar: string
  text: string
} {
  if (color === 'rojo')
    return {
      square: 'bg-rose-500',
      bar: 'bg-rose-500',
      text: 'text-rose-600 dark:text-rose-400',
    }
  if (color === 'amarillo')
    return {
      square: 'bg-amber-500',
      bar: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
    }
  if (color === 'verde')
    return {
      square: 'bg-emerald-500',
      bar: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
    }
  return {
    square: 'bg-muted-foreground/40',
    bar: 'bg-muted-foreground/40',
    text: 'text-muted-foreground',
  }
}

function SummaryCard({
  metrics,
  onDrillDown,
}: {
  metrics: OperationalDashboardMetrics
  onDrillDown: (input: DrillDownInput) => void
}) {
  const overdue = metrics.overdueActions.length
  const open = metrics.openActions.length
  const redOpen = metrics.redOpenActions.length
  const trend = metrics.avgOpenAgeDays.trend
  const deltaLabel =
    Math.abs(trend.delta) < 0.1
      ? 'Sin cambio'
      : `${trend.delta > 0 ? '+' : ''}${trend.delta}d edad promedio`

  return (
    <CardShell title="Resumen operativo" icon={AlertTriangle}>
      <button
        type="button"
        className="relative w-full overflow-hidden rounded-xl bg-amber-50 px-4 py-5 text-left outline-none transition-colors hover:bg-amber-100/80 focus-visible:ring-2 focus-visible:ring-ring dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
        onClick={() =>
          onDrillDown({
            title: 'Acciones vencidas',
            actions: metrics.overdueActions,
          })
        }
      >
        <p className="text-5xl font-semibold tabular-nums tracking-tight text-amber-600 dark:text-amber-400 sm:text-6xl">
          {overdue}
        </p>
        <p className="mt-1 text-xs font-medium text-amber-800/70 dark:text-amber-200/70">
          acciones vencidas
        </p>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm">
            {open} abiertas
          </span>
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              trend.direction === 'up'
                ? 'text-rose-600 dark:text-rose-400'
                : trend.direction === 'down'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground'
            )}
          >
            {deltaLabel}
          </span>
        </div>
      </button>
      <h3 className="mt-4 text-base font-semibold leading-snug sm:text-lg">
        Prioriza lo vencido y lo rojo abierto
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {redOpen} rojas abiertas · {metrics.blockedActions.length} bloqueadas ·{' '}
        {metrics.dueTodayActions.length} con compromiso hoy
      </p>
    </CardShell>
  )
}

function PriorityDistributionCard({
  metrics,
  onDrillDown,
}: {
  metrics: OperationalDashboardMetrics
  onDrillDown: (input: DrillDownInput) => void
}) {
  const segments = [
    {
      key: 'rojo',
      label: 'Rojas',
      count: metrics.redActions.length,
      actions: metrics.redActions,
      color: 'bg-rose-500',
    },
    {
      key: 'amarillo',
      label: 'Amarillas',
      count: metrics.yellowActions.length,
      actions: metrics.yellowActions,
      color: 'bg-amber-500',
    },
    {
      key: 'verde',
      label: 'Verdes',
      count: metrics.greenActions.length,
      actions: metrics.greenActions,
      color: 'bg-emerald-500',
    },
  ] as const
  const max = Math.max(1, ...segments.map((item) => item.count))
  const total = segments.reduce((sum, item) => sum + item.count, 0)

  return (
    <CardShell title="Distribución por prioridad" icon={ListChecks}>
      <div
        className="flex h-44 items-end justify-around gap-4 sm:gap-6"
        role="img"
        aria-label="Distribución de acciones por prioridad"
      >
        {segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className="flex min-w-0 flex-1 flex-col items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() =>
              onDrillDown({
                title: `Prioridad ${segment.label.toLowerCase()}`,
                actions: segment.actions,
              })
            }
          >
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {segment.count}
            </span>
            <div
              className={cn('w-full max-w-[3.5rem] rounded-t-md', segment.color)}
              style={{
                height: `${Math.max(
                  segment.count === 0 ? 4 : 16,
                  (segment.count / max) * 120
                )}px`,
              }}
            />
            <span className="text-[11px] font-medium text-muted-foreground">
              {segment.label}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {total} acciones en el alcance filtrado
      </p>
    </CardShell>
  )
}

function AttentionRow({
  action,
  priorities,
  ownerName,
  open,
  onToggle,
  onSelect,
}: {
  action: AccionDiaria
  priorities: Priority[]
  ownerName: string
  open: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const matched = findPriorityForAccion(action, priorities)
  const color = priorityColorFor(matched?.nombre ?? action.prioridad, matched?.color)
  const tone = priorityTone(color)
  const priorityLabel = priorityDisplayLabel(
    matched?.nombre ?? action.prioridad ?? 'Sin prioridad'
  )
  const area = action.area?.trim() || 'Sin área'
  const due = action.fecha
  const title =
    action.titulo_accion?.trim() ||
    action.descripcion_accion?.trim() ||
    'Sin título'

  return (
    <li className="border-b border-border/50 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_auto_minmax(6.5rem,0.7fr)] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 items-start gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
            aria-hidden
          />
          <span
            className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px]', tone.square)}
            aria-hidden
          />
          <span className="min-w-0 truncate text-sm font-medium leading-snug">
            {title}
          </span>
        </button>

        <p className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground md:flex">
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{area}</span>
        </p>

        <OwnerAvatar name={ownerName} />

        <div className="min-w-0 text-right">
          <p className={cn('truncate text-xs font-semibold', tone.text)}>
            {priorityLabel}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {due || 'Sin fecha'}
          </p>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/40 bg-muted/15 px-4 py-4 sm:px-5">
          <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold leading-snug">{title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    {area}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5" aria-hidden />
                    {ownerName}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                    Compromiso {due || '—'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estado: <span className="font-medium text-foreground">{action.estado}</span>
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 self-start"
                onClick={onSelect}
              >
                Abrir acción
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

function AttentionTable({
  metrics,
  priorities,
  responsableNames,
  onDrillDown,
  onSelectAccion,
}: {
  metrics: OperationalDashboardMetrics
  priorities: Priority[]
  responsableNames: Record<string, string>
  onDrillDown: (input: DrillDownInput) => void
  onSelectAccion?: (accion: AccionDiaria) => void
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const rows = useMemo(() => {
    const overdueIds = new Set(metrics.overdueActions.map((item) => item.id))
    const ranked = [
      ...metrics.overdueActions,
      ...metrics.redOpenActions.filter((item) => !overdueIds.has(item.id)),
      ...metrics.blockedActions.filter(
        (item) => !overdueIds.has(item.id) && !metrics.redOpenActions.some((r) => r.id === item.id)
      ),
    ]
    return ranked.slice(0, 12)
  }, [metrics])

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <ListChecks className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
          <h2 className="text-sm font-semibold tracking-tight sm:text-[15px]">
            Atención inmediata
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() =>
            onDrillDown({
              title: 'Atención inmediata',
              actions: rows,
            })
          }
        >
          Ver todas
        </Button>
      </header>

      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_auto_minmax(6.5rem,0.7fr)] gap-3 border-b border-border/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:gap-4 sm:px-5 md:grid">
        <span className="pl-6">Acción</span>
        <span>Área</span>
        <span className="w-7 text-center">Dueño</span>
        <span className="text-right">Prioridad</span>
      </div>

      {!rows.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
          No hay acciones vencidas, rojas o bloqueadas en este alcance.
        </p>
      ) : (
        <ul>
          {rows.map((action) => (
            <AttentionRow
              key={action.id}
              action={action}
              priorities={priorities}
              ownerName={
                responsableNames[action.responsable] ?? 'Sin responsable'
              }
              open={openIds.has(action.id)}
              onToggle={() =>
                setOpenIds((current) => {
                  const next = new Set(current)
                  if (next.has(action.id)) next.delete(action.id)
                  else next.add(action.id)
                  return next
                })
              }
              onSelect={() => onSelectAccion?.(action)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function BauDashboardOverview({
  metrics,
  priorities,
  responsableNames,
  isLoading,
  onDrillDown,
  onSelectAccion,
}: {
  metrics: OperationalDashboardMetrics
  priorities: Priority[]
  responsableNames: Record<string, string>
  isLoading?: boolean
  onDrillDown: (input: DrillDownInput) => void
  onSelectAccion?: (accion: AccionDiaria) => void
}) {
  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
          <div className="h-56 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard metrics={metrics} onDrillDown={onDrillDown} />
        <PriorityDistributionCard metrics={metrics} onDrillDown={onDrillDown} />
      </div>
      <AttentionTable
        metrics={metrics}
        priorities={priorities}
        responsableNames={responsableNames}
        onDrillDown={onDrillDown}
        onSelectAccion={onSelectAccion}
      />
    </div>
  )
}
