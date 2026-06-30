import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Download,
  Gauge,
  Info,
  ListChecks,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoHint } from '@/components/InfoHint'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { cn } from '@/lib/utils'
import type { AccionDiaria } from '@/types'
import type {
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

function downloadActionsCsv(filename: string, actions: AccionDiaria[]) {
  const headers = ['id', 'titulo', 'estado', 'prioridad', 'area', 'responsable', 'fecha_compromiso', 'created_at']
  const rows = actions.map((action) => [
    action.id,
    action.titulo_accion,
    action.estado,
    action.prioridad,
    action.area ?? '',
    action.responsable,
    action.fecha,
    action.created_at,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function KpiTile({
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
}: {
  title: string
  value: string | number
  suffix?: string
  description: string
  formula: string
  metric?: DashboardMetric
  tone: MetricTone
  actions: AccionDiaria[]
  onDrillDown: (input: DrillDownInput) => void
  icon: ReactNode
  loading?: boolean
}) {
  return (
    <div className={cn('rounded-lg border p-3 shadow-sm transition hover:shadow-md', toneStyles[tone])}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onDrillDown({ title, actions })}
        >
          <div className="flex items-center gap-2">
            <span className="tone-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/70">
              {icon}
            </span>
            <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </span>
          </div>
          {loading ? (
            <div className="mt-3 h-8 w-20 animate-pulse rounded bg-background/70" />
          ) : (
            <div className="mt-3 flex items-end gap-1">
              <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
              {suffix ? <span className="pb-0.5 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
            </div>
          )}
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <InfoHint text={`${description}. Formula: ${formula}`} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-background/50"
            onClick={() => downloadActionsCsv(`${title.toLowerCase().replace(/\s+/g, '-')}.csv`, actions)}
            title="Exportar listado"
          >
            <Download className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      {metric ? (
        <div
          className={cn(
            'mt-3 inline-flex items-center gap-1 rounded-md border bg-background/70 px-2 py-1 text-xs font-medium',
            metric.trend.isGood === true && 'border-emerald-500/25 text-emerald-700 dark:text-emerald-200',
            metric.trend.isGood === false && 'border-red-500/25 text-red-700 dark:text-red-200',
            metric.trend.isGood == null && 'border-border text-muted-foreground'
          )}
        >
          {trendIcon(metric.trend.direction)}
          <span>{formatTrend(metric, suffix === '%' ? ' pp' : suffix ? ` ${suffix}` : '')}</span>
        </div>
      ) : null}
    </div>
  )
}

function HorizontalBars({
  items,
  unit,
  maxItems = 7,
  onDrillDown,
}: {
  items: DashboardAreaMetric[]
  unit?: string
  maxItems?: number
  onDrillDown: (input: DrillDownInput) => void
}) {
  const visible = items.slice(0, maxItems)
  const max = Math.max(1, ...visible.map((item) => item.value))
  if (visible.length === 0) {
    return <p className="rounded-md border border-dashed border-border/70 px-3 py-5 text-center text-sm text-muted-foreground">Sin datos para este filtro.</p>
  }
  return (
    <div className="space-y-2">
      {visible.map((item) => (
        <button
          key={item.area}
          type="button"
          className="group grid w-full grid-cols-[minmax(5.5rem,10rem)_1fr_auto] items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-muted/40"
          onClick={() => onDrillDown({ title: item.area, actions: item.actions })}
        >
          <span className="truncate text-xs font-medium text-foreground">{item.area}</span>
          <span className="h-2.5 min-w-0 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary transition-all group-hover:bg-primary/80"
              style={{ width: `${Math.max(5, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {item.value}{unit ?? ''}
          </span>
        </button>
      ))}
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

function DistributionList({
  title,
  items,
  onDrillDown,
}: {
  title: string
  items: DashboardAreaMetric[]
  onDrillDown: (input: DrillDownInput) => void
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <HorizontalBars items={items} maxItems={5} onDrillDown={onDrillDown} />
    </div>
  )
}

export function DashboardExecutivePanel({ metrics, isLoading, onDrillDown }: DashboardExecutivePanelProps) {
  const maxAging = Math.max(1, ...metrics.agingBuckets.map((bucket) => bucket.count))

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
          <SectionCardBody>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile
                title="Acciones vencidas"
                value={metrics.overdueActions.length}
                description="Compromisos con fecha anterior a hoy y estado abierto."
                formula="fecha compromiso < hoy y estado no cerrado"
                tone={metrics.overdueActions.length === 0 ? 'green' : metrics.overdueActions.length <= 5 ? 'yellow' : 'red'}
                actions={metrics.overdueActions}
                onDrillDown={onDrillDown}
                icon={<AlertTriangle className="h-5 w-5" />}
                loading={isLoading}
              />
              <KpiTile
                title="Acciones bloqueadas"
                value={metrics.blockedActions.length}
                description="Acciones abiertas en estado bloqueado segun catalogo."
                formula="estado_key = Bloqueado y estado no cerrado"
                tone={metrics.blockedActions.length === 0 ? 'green' : metrics.blockedActions.length <= 3 ? 'yellow' : 'red'}
                actions={metrics.blockedActions}
                onDrillDown={onDrillDown}
                icon={<Ban className="h-5 w-5" />}
                loading={isLoading}
              />
              <KpiTile
                title="Rojas abiertas"
                value={metrics.redOpenActions.length}
                description="Acciones abiertas con prioridad roja o critica."
                formula="prioridad catalogada como rojo y estado no cerrado"
                tone={metrics.redOpenActions.length === 0 ? 'green' : metrics.redOpenActions.length <= 3 ? 'yellow' : 'red'}
                actions={metrics.redOpenActions}
                onDrillDown={onDrillDown}
                icon={<Gauge className="h-5 w-5" />}
                loading={isLoading}
              />
              <KpiTile
                title="Acciones para hoy"
                value={metrics.dueTodayActions.length}
                description="Compromisos abiertos con fecha compromiso igual a hoy."
                formula="fecha compromiso = hoy y estado no cerrado"
                tone="neutral"
                actions={metrics.dueTodayActions}
                onDrillDown={onDrillDown}
                icon={<CalendarClock className="h-5 w-5" />}
                loading={isLoading}
              />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <DistributionList title="Vencidas por prioridad" items={metrics.overdueByPriority} onDrillDown={onDrillDown} />
              <DistributionList title="Vencidas por area" items={metrics.overdueByArea} onDrillDown={onDrillDown} />
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      <section className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            eyebrow="Ejecucion"
            title="Confiabilidad de compromisos"
            subtitle="Velocidad de cierre y cumplimiento contra fecha compromiso."
            icon={ShieldCheck}
          />
          <SectionCardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile
                title="ICO"
                value={metrics.ico.value}
                suffix="%"
                description="Indice de Confiabilidad Operativa global."
                formula="acciones cerradas a tiempo / total de acciones cerradas x 100"
                metric={metrics.ico}
                tone={toneForPercent(metrics.ico.value)}
                actions={metrics.closedActions}
                onDrillDown={onDrillDown}
                icon={<ShieldCheck className="h-5 w-5" />}
                loading={isLoading}
              />
              <KpiTile
                title="Tiempo promedio de cierre"
                value={metrics.avgCloseDays.value}
                suffix="dias"
                description="Tiempo promedio entre creacion y cierre operativo."
                formula="fecha cierre - fecha creacion"
                metric={metrics.avgCloseDays}
                tone={toneForDays(metrics.avgCloseDays.value)}
                actions={metrics.closedActions}
                onDrillDown={onDrillDown}
                icon={<Timer className="h-5 w-5" />}
                loading={isLoading}
              />
              <KpiTile
                title="Rojas cerradas a tiempo"
                value={metrics.redClosedOnTimePct.value}
                suffix="%"
                description={`Meta configurable: ${metrics.redClosedOnTimeTarget}%.`}
                formula="acciones rojas cerradas a tiempo / total de acciones rojas cerradas x 100"
                metric={metrics.redClosedOnTimePct}
                tone={toneForPercent(metrics.redClosedOnTimePct.value, 85, metrics.redClosedOnTimeTarget)}
                actions={metrics.redClosedActions}
                onDrillDown={onDrillDown}
                icon={<ListChecks className="h-5 w-5" />}
                loading={isLoading}
              />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <DistributionList title="ICO por area" items={metrics.icoByArea} onDrillDown={onDrillDown} />
              <DistributionList title="ICO por usuario" items={metrics.icoByUser} onDrillDown={onDrillDown} />
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      <section className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            eyebrow="Carga operativa"
            title="Trabajo abierto y antiguedad"
            subtitle="Concentracion de backlog y acumulacion por antiguedad."
            icon={Timer}
          />
          <SectionCardBody>
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_0.8fr]">
              <div className="rounded-lg border border-border/60 p-3">
                <p className="mb-3 text-sm font-semibold">Backlog activo por area</p>
                <HorizontalBars items={metrics.backlogByArea} onDrillDown={onDrillDown} />
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <p className="mb-3 text-sm font-semibold">Aging de acciones</p>
                <div className="grid grid-cols-4 items-end gap-2">
                  {metrics.agingBuckets.map((bucket) => (
                    <button
                      key={bucket.label}
                      type="button"
                      className="flex min-h-40 flex-col justify-end gap-2 rounded-md p-1 hover:bg-muted/40"
                      onClick={() => onDrillDown({ title: bucket.label, actions: bucket.actions })}
                    >
                      <span className="mx-auto flex w-full items-end rounded-md bg-muted" style={{ height: 112 }}>
                        <span
                          className="block w-full rounded-md bg-primary"
                          style={{ height: `${Math.max(3, (bucket.count / maxAging) * 100)}%` }}
                        />
                      </span>
                      <span className="text-center text-xs font-semibold tabular-nums">{bucket.count}</span>
                      <span className="text-center text-[11px] text-muted-foreground">{bucket.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <KpiTile
                title="Edad promedio"
                value={metrics.avgOpenAgeDays.value}
                suffix="dias"
                description="Promedio de dias abiertas de acciones activas."
                formula="hoy - fecha de creacion, solo acciones abiertas"
                metric={metrics.avgOpenAgeDays}
                tone={toneForDays(metrics.avgOpenAgeDays.value)}
                actions={metrics.openActions}
                onDrillDown={onDrillDown}
                icon={<Timer className="h-5 w-5" />}
                loading={isLoading}
              />
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

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
