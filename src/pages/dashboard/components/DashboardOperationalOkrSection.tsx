import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ListChecks,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { cn } from '@/lib/utils'
import type { AccionDiaria } from '@/types'
import type {
  OperationalOkrKeyResultView,
  OperationalOkrMilestone,
  OperationalOkrStatus,
  OperationalOkrView,
} from '../hooks/useOperationalOKR'

type DrillDownInput = {
  title: string
  actions: AccionDiaria[]
}

type DashboardOperationalOkrSectionProps = {
  data: OperationalOkrView | null
  isLoading?: boolean
  isError?: boolean
  error?: unknown
  canDrillDown?: boolean
  onRetry?: () => void
  onDrillDown: (input: DrillDownInput) => void
}

type Tone = 'green' | 'yellow' | 'red' | 'neutral'

const statusMeta: Record<OperationalOkrStatus, { label: string; tone: Tone }> = {
  fulfilled: { label: 'Cumplido', tone: 'green' },
  in_progress: { label: 'En curso', tone: 'green' },
  in_progress_warning: { label: 'En curso', tone: 'yellow' },
  at_risk: { label: 'En riesgo', tone: 'red' },
}

const toneClasses: Record<Tone, { badge: string; bar: string; surface: string; text: string }> = {
  green: {
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    bar: 'bg-emerald-500',
    surface: 'border-emerald-500/25 bg-emerald-500/[0.06]',
    text: 'text-emerald-700 dark:text-emerald-200',
  },
  yellow: {
    badge: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    bar: 'bg-amber-500',
    surface: 'border-amber-500/25 bg-amber-500/[0.06]',
    text: 'text-amber-700 dark:text-amber-200',
  },
  red: {
    badge: 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200',
    bar: 'bg-red-500',
    surface: 'border-red-500/25 bg-red-500/[0.06]',
    text: 'text-red-700 dark:text-red-200',
  },
  neutral: {
    badge: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-200',
    bar: 'bg-slate-500',
    surface: 'border-border bg-muted/35',
    text: 'text-muted-foreground',
  },
}

function toneForProgress(progress: number): Tone {
  if (progress >= 90) return 'green'
  if (progress >= 65) return 'yellow'
  return 'red'
}

function formatValue(value: number, unit: string): string {
  if (unit === '%') return `${Math.round(value)}%`
  if (unit === '% reduccion') return `${Math.round(value)}%`
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return `${display} dias`
}

function trendLabel(kr: OperationalOkrKeyResultView): string | null {
  if (kr.trend_delta == null) return null
  if (Math.abs(kr.trend_delta) < 0.1) return 'Sin cambio vs periodo anterior'
  const good = kr.direction === 'decrease' ? kr.trend_delta < 0 : kr.trend_delta > 0
  const sign = kr.trend_delta > 0 ? '+' : ''
  return `${sign}${kr.trend_delta} dias vs periodo anterior${good ? '' : ' por revisar'}`
}

function statusIcon(tone: Tone) {
  if (tone === 'green') return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
  if (tone === 'red') return <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
  return <CircleDot className="h-3.5 w-3.5" aria-hidden />
}

function OkrSkeleton() {
  return (
    <SectionCard>
      <SectionCardHeader eyebrow="OKR Operativo" title="Cargando avance del OKR" icon={Target} />
      <SectionCardBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </SectionCardBody>
    </SectionCard>
  )
}

function KeyResultCard({
  kr,
  canDrillDown,
  onDrillDown,
}: {
  kr: OperationalOkrKeyResultView
  canDrillDown?: boolean
  onDrillDown: (input: DrillDownInput) => void
}) {
  const tone = toneForProgress(kr.progress)
  const trend = trendLabel(kr)
  const disabled = !canDrillDown || kr.actions.length === 0
  const valueLine =
    kr.metric_type === 'red_close_avg_days'
      ? `${formatValue(kr.baseline_value ?? 27, kr.unit)} -> ${formatValue(kr.current_value, kr.unit)} -> Meta ${formatValue(kr.target_value, kr.unit)}`
      : kr.metric_type === 'red_open_older_than_15_reduction_pct'
        ? `${Math.max(0, kr.current_count ?? 0)} abiertas >15 dias | Meta -${Math.round(kr.target_value)}%`
        : `${formatValue(kr.current_value, kr.unit)} / Meta ${formatValue(kr.target_value, kr.unit)}`

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onDrillDown({ title: kr.drilldown_title, actions: kr.actions })}
      className={cn(
        'group flex min-h-40 w-full flex-col rounded-xl border p-4 text-left transition',
        toneClasses[tone].surface,
        disabled
          ? 'cursor-default'
          : 'hover:-translate-y-0.5 hover:border-border hover:bg-background/75 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      title={disabled ? undefined : `${kr.drilldown_title}: ${kr.actions.length} acciones`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {kr.id.toUpperCase()}
          </span>
          <span className="mt-1 block text-sm font-semibold leading-snug text-foreground">{kr.title}</span>
        </span>
        <Badge variant="outline" className={cn('shrink-0 gap-1.5 tabular-nums', toneClasses[tone].badge)}>
          {statusIcon(tone)}
          {kr.progress}%
        </Badge>
      </span>

      <span className="mt-3 block text-xl font-bold leading-tight tabular-nums text-foreground">
        {valueLine}
      </span>
      <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{kr.description}</span>

      <span className="mt-4 block h-2 overflow-hidden rounded-full bg-background/80">
        <span
          className={cn('block h-full rounded-full transition-all', toneClasses[tone].bar)}
          style={{ width: `${Math.max(0, Math.min(100, kr.progress))}%` }}
        />
      </span>

      <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
        <span className={cn('inline-flex items-center gap-1.5 font-medium', toneClasses[tone].text)}>
          {kr.direction === 'decrease' ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : <TrendingUp className="h-3.5 w-3.5" aria-hidden />}
          {trend ?? (disabled ? 'Sin acciones para detalle' : `${kr.actions.length} acciones de soporte`)}
        </span>
        {!disabled ? <span className="font-medium text-muted-foreground group-hover:text-foreground">Ver detalle</span> : null}
      </span>
    </button>
  )
}

function MilestoneRail({
  milestones,
  elapsedDays,
}: {
  milestones: OperationalOkrMilestone[]
  elapsedDays: number
}) {
  const maxDay = Math.max(90, ...milestones.map((item) => item.day))
  return (
    <div className="rounded-xl border border-border/60 bg-background/65 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Ritmo esperado KR1
      </div>
      <div className="mt-3 flex items-center gap-2">
        {milestones.map((milestone, index) => {
          const reached = elapsedDays >= milestone.day
          return (
            <div key={milestone.day} className="min-w-0 flex-1">
              <div className={cn('h-1.5 rounded-full', reached ? 'bg-primary' : 'bg-muted')} />
              <p className="mt-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                Dia {milestone.day}
              </p>
              <p className="text-[11px] font-semibold tabular-nums">
                {'<= '}
                {milestone.target_value} dias
              </p>
              {index === milestones.length - 1 && maxDay !== milestone.day ? (
                <span className="sr-only">Meta final dia {maxDay}</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DashboardOperationalOkrSection({
  data,
  isLoading,
  isError,
  error,
  canDrillDown,
  onRetry,
  onDrillDown,
}: DashboardOperationalOkrSectionProps) {
  if (isLoading) return <OkrSkeleton />

  if (isError || !data) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el OKR operativo.'
    return (
      <SectionCard>
        <SectionCardHeader
          eyebrow="OKR Operativo"
          title="No se pudo cargar el seguimiento"
          subtitle={message}
          icon={Target}
          action={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Reintentar
              </button>
            ) : null
          }
        />
      </SectionCard>
    )
  }

  const status = statusMeta[data.okr.status] ?? statusMeta.in_progress
  const overallTone = status.tone
  const overallProgress = Math.max(0, Math.min(100, data.okr.overall_progress))
  const ringBackground = `conic-gradient(${
    overallTone === 'green' ? '#10b981' : overallTone === 'yellow' ? '#f59e0b' : '#ef4444'
  } 0% ${overallProgress}%, hsl(var(--muted)) ${overallProgress}% 100%)`

  return (
    <section id="dashboard-operational-okr" className="dashboard-operational-okr scroll-mt-4">
      <SectionCard className="bg-gradient-to-br from-card via-card to-primary/[0.035]">
        <SectionCardHeader
          eyebrow="OKR Operativo"
          title="Mejorar resolucion de acciones criticas"
          subtitle={data.okr.description}
          icon={Target}
          action={
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              <Badge variant="outline" className={cn('gap-1.5', toneClasses[overallTone].badge)}>
                {statusIcon(overallTone)}
                {status.label}
              </Badge>
              <Badge variant="secondary" className="gap-1.5 tabular-nums">
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                {data.okr.period_days} dias
              </Badge>
            </div>
          }
        />
        <SectionCardBody className="space-y-5">
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col rounded-2xl border border-border/60 bg-background/70 p-5">
              <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)] lg:grid-cols-1">
                <div className="relative mx-auto aspect-square w-full max-w-44 rounded-full p-2" style={{ background: ringBackground }}>
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border-4 border-background bg-background text-center shadow-[inset_0_1px_8px_hsl(var(--muted)),0_6px_18px_rgba(15,23,42,0.12)]">
                    <span className="text-4xl font-bold leading-none tabular-nums">
                      {overallProgress}
                      <span className="text-lg text-muted-foreground">%</span>
                    </span>
                    <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Progreso
                    </span>
                  </div>
                </div>
                <div className="min-w-0 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Objetivo
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">
                      Aumentar la capacidad del equipo para resolver oportunamente las acciones criticas de la operacion.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <p className="text-muted-foreground">Avance esperado</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{data.okr.expected_progress}%</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <p className="text-muted-foreground">Dia actual</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{data.okr.elapsed_days}</p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    KR1 y KR2 usan rojas cerradas durante el periodo del OKR; KR3 y KR4 observan rojas abiertas actuales para separar backlog historico y acciones nuevas.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <MilestoneRail milestones={data.milestones} elapsedDays={data.okr.elapsed_days} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {data.keyResults.map((kr) => (
                <KeyResultCard
                  key={kr.id}
                  kr={kr}
                  canDrillDown={canDrillDown}
                  onDrillDown={onDrillDown}
                />
              ))}
            </div>
          </div>
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
