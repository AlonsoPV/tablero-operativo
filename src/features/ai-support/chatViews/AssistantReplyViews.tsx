import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowUpRight, ChevronDown, ChevronRight, Inbox, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from '@/features/okrs/okrPresentation'
import { ROUTES } from '@/constants'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { SectionEyebrow, toneDotClass, toneSoftClass, type AssistantTone } from '@/features/ai-support/components/ui'
import type {
  AssistantActionListView,
  AssistantActionRowView,
  AssistantBriefView,
  AssistantEmptyView,
  AssistantErrorView,
  AssistantMetric,
  AssistantOkrListView,
  AssistantOkrRowView,
  AssistantOperationalSummaryView,
  AssistantRecommendationBlockView,
  AssistantReplyView,
  AssistantUiPayload,
} from './types'

const INITIAL_VISIBLE = 5

type FollowUp = (prompt: string) => void

function metricTone(tone: AssistantMetric['tone']): AssistantTone {
  switch (tone) {
    case 'danger':
      return 'danger'
    case 'warning':
      return 'warning'
    case 'ok':
      return 'success'
    default:
      return 'neutral'
  }
}

export function MetricSummary({
  metrics,
  compact,
}: {
  metrics: AssistantMetric[]
  compact?: boolean
}) {
  if (metrics.length === 0) return null
  return (
    <div
      className={cn(
        'grid gap-1.5',
        metrics.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2',
        compact && 'gap-1'
      )}
    >
      {metrics.map((metric) => (
        <div
          key={metric.id}
          className={cn('rounded-xl px-2.5 py-2 ring-1', toneSoftClass[metricTone(metric.tone)], compact && 'px-2 py-1.5')}
          title={metric.scope}
        >
          <p className="text-[11px] font-medium opacity-80">{metric.label}</p>
          <p className={cn('font-semibold tabular-nums', compact ? 'text-base' : 'text-lg')}>{metric.value}</p>
        </div>
      ))}
    </div>
  )
}

/** Consulta simple: número grande, desglose breve y alcance; sin Hallazgo/Evidencia. */
function MetricResult({
  metric,
  summary,
  scope,
  compact,
  onFollowUp,
}: {
  metric: AssistantMetric
  summary: string
  scope?: string
  compact?: boolean
  onFollowUp?: FollowUp
}) {
  const tone = metricTone(metric.tone)
  const numeric = typeof metric.value === 'number' ? metric.value : Number(metric.value)
  return (
    <div
      className={cn(
        'rounded-2xl bg-card ring-1 ring-border/70 shadow-[0_12px_28px_-24px_hsl(var(--foreground)/0.5)]',
        compact ? 'p-3' : 'p-4'
      )}
    >
      <div className="flex items-end gap-3">
        <span
          className={cn(
            'font-semibold leading-none tracking-tight tabular-nums',
            tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-destructive' : 'text-foreground',
            compact ? 'text-3xl' : 'text-4xl'
          )}
        >
          {metric.value}
        </span>
        <span className="pb-0.5 text-sm font-medium text-muted-foreground">{metric.label}</span>
      </div>
      <p className={cn('mt-2 text-foreground/85', compact ? 'text-[12px] leading-5' : 'text-[13px] leading-5')}>
        {summary}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {scope ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', toneDotClass.primary)} aria-hidden />
            {scope}
          </span>
        ) : (
          <span />
        )}
        {onFollowUp && Number.isFinite(numeric) && numeric > 0 ? (
          <button
            type="button"
            onClick={() => onFollowUp('Enlistalas')}
            className="inline-flex items-center gap-0.5 rounded-full text-xs font-semibold text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver detalle
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function formatFecha(fecha: string | null | undefined) {
  if (!fecha) return null
  const match = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return fecha
  return `${match[3]}/${match[2]}/${match[1]}`
}

function splitEstado(raw: string | null | undefined) {
  const [estado, ...owner] = (raw ?? '').split(' · ')
  return { estado: estado?.trim() || null, owner: owner.join(' · ').trim() || null }
}

function estadoTone(estado: string | null, fecha?: string | null): AssistantTone {
  const closed = estado === 'Hecho' || estado === 'Verificado'
  if (!closed && fecha && fecha.slice(0, 10) < todayWallClockCDMX()) return 'danger'
  switch (estado) {
    case 'Retraso':
    case 'Bloqueado':
      return 'danger'
    case 'Hoy':
      return 'warning'
    case 'Hecho':
    case 'Verificado':
      return 'success'
    default:
      return 'primary'
  }
}

function isCriticalPriority(prioridad: string | null | undefined) {
  return Boolean(prioridad && /^(p1|critica|crítica|alta)$/i.test(prioridad.trim()))
}

export function ActionRow({
  action,
  compact,
}: {
  action: AssistantActionRowView
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { estado, owner } = splitEstado(action.estado)
  const responsable = action.responsable || owner
  const fecha = formatFecha(action.fecha)
  const tone = estadoTone(estado, action.fecha)
  const meta = [responsable, fecha].filter(Boolean).join(' · ')

  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition duration-150',
          'hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact ? 'py-1.5' : 'py-2'
        )}
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', toneDotClass[tone])} title={estado ?? undefined} aria-hidden />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate font-medium text-foreground',
              compact ? 'text-[12px] leading-4' : 'text-[13px] leading-5'
            )}
          >
            {action.title}
          </span>
          {meta ? <span className="block truncate text-[11px] text-muted-foreground">{meta}</span> : null}
        </span>
        {isCriticalPriority(action.prioridad) ? (
          <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1', toneSoftClass.danger)}>
            {action.prioridad}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="animate-in fade-in-0 slide-in-from-top-1 mx-2.5 mb-1.5 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-border/70 pl-3 text-[11px] text-muted-foreground duration-150">
          {estado ? (
            <span>
              Estado: <span className="font-medium text-foreground">{estado}</span>
            </span>
          ) : null}
          {fecha ? <span>Fecha límite: {fecha}</span> : null}
          {action.prioridad ? <span>Prioridad: {action.prioridad}</span> : null}
          {responsable ? <span>Responsable: {responsable}</span> : null}
          <Link
            to={action.href}
            className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Abrir en kanban
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : null}
    </li>
  )
}

function ListFooter({
  shown,
  total,
  truncated,
  canExpand,
  onExpand,
  remainingServer = 0,
}: {
  shown: number
  total: number
  truncated: boolean
  canExpand: boolean
  onExpand: () => void
  remainingServer?: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground">
      <span>
        Mostrando {shown} de {total}
        {truncated ? ' (lista parcial)' : ''}
      </span>
      {canExpand ? (
        <button
          type="button"
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onExpand}
        >
          Ver más
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
      {remainingServer > 0 ? (
        <Link to={ROUTES.KANBAN} className="font-medium text-primary hover:underline">
          Ver en kanban ({remainingServer} más)
        </Link>
      ) : null}
    </div>
  )
}

function ViewHeader({ summary, scope, compact }: { summary?: string; scope?: string; compact?: boolean }) {
  if (!summary && !scope) return null
  return (
    <div className="space-y-0.5 px-1">
      {summary ? (
        <p className={cn('text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>{summary}</p>
      ) : null}
      {scope ? <p className="text-[11px] text-muted-foreground">{scope}</p> : null}
    </div>
  )
}

export function ActionList({
  view,
  compact,
}: {
  view: AssistantActionListView
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const limit = expanded ? view.actions.length : Math.min(INITIAL_VISIBLE, view.actions.length)
  const shown = view.actions.slice(0, limit)

  return (
    <div className="space-y-2">
      <ViewHeader summary={view.summary} scope={view.scope} compact={compact} />
      <ul className="divide-y divide-border/50 rounded-2xl bg-card p-1 ring-1 ring-border/70">
        {shown.map((action) => (
          <ActionRow key={action.id} action={action} compact={compact} />
        ))}
      </ul>
      <ListFooter
        shown={shown.length}
        total={view.total}
        truncated={view.truncated}
        canExpand={view.actions.length > INITIAL_VISIBLE && !expanded}
        onExpand={() => setExpanded(true)}
        remainingServer={Math.max(0, view.total - view.visible)}
      />
    </div>
  )
}

export function OKRProgressList({
  view,
  compact,
}: {
  view: AssistantOkrListView
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const limit = expanded ? view.okrs.length : Math.min(INITIAL_VISIBLE, view.okrs.length)
  const shown = view.okrs.slice(0, limit)

  return (
    <div className="space-y-2">
      <ViewHeader summary={view.summary} scope={view.scope} compact={compact} />
      <ul className="divide-y divide-border/50 rounded-2xl bg-card p-1 ring-1 ring-border/70">
        {shown.map((okr) => (
          <OkrProgressRow key={okr.id} okr={okr} compact={compact} />
        ))}
      </ul>
      <ListFooter
        shown={shown.length}
        total={view.total}
        truncated={view.truncated}
        canExpand={view.okrs.length > INITIAL_VISIBLE && !expanded}
        onExpand={() => setExpanded(true)}
      />
    </div>
  )
}

function OkrProgressRow({ okr, compact }: { okr: AssistantOkrRowView; compact?: boolean }) {
  const progressLabel = okr.progress == null ? 'Sin avance calculable' : `${Math.round(okr.progress)}%`
  const scopeLabel = okr.scope === 'team' ? 'Equipo' : okr.scope === 'company' ? 'Empresa' : okr.scope || null
  const meta = [scopeLabel, `${okr.krCount} KR${okr.krCount === 1 ? '' : 's'}`, okr.pace, okr.initiativesHint]
    .filter(Boolean)
    .join(' · ')

  return (
    <li>
      <Link
        to={okr.href}
        className={cn(
          'block space-y-1.5 rounded-xl px-2.5 py-2 transition duration-150 hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact && 'py-1.5'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn('min-w-0 font-medium text-foreground', compact ? 'text-[12px] leading-4' : 'text-[13px] leading-5')}>
            {okr.nombre}
          </p>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground/80">{progressLabel}</span>
        </div>
        <ProgressBar
          value={okr.progress}
          label={`Avance de ${okr.nombre}`}
          size="sm"
          tone={okr.progress == null ? 'muted' : 'primary'}
        />
        {meta ? <p className="text-[11px] text-muted-foreground">{meta}</p> : null}
      </Link>
    </li>
  )
}

export function RecommendationCard({
  view,
  compact,
}: {
  view: AssistantRecommendationBlockView | { text: string; nextAction?: string }
  compact?: boolean
}) {
  const text = 'text' in view ? view.text : ''
  const nextAction = 'nextAction' in view ? view.nextAction : undefined
  return (
    <div className={cn('rounded-2xl bg-primary/[0.06] px-3 py-2.5 ring-1 ring-primary/15', compact && 'px-2.5 py-2')}>
      <SectionEyebrow icon={Lightbulb}>Recomendación</SectionEyebrow>
      <p className={cn('mt-1 text-foreground/90', compact ? 'text-[12px] leading-5' : 'text-[13px] leading-5')}>{text}</p>
      {nextAction ? <p className="mt-1 text-[11px] text-muted-foreground">Siguiente: {nextAction}</p> : null}
    </div>
  )
}

export function EmptyStateView({ view }: { view: AssistantEmptyView }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-border/70">
      <span
        className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1', toneSoftClass.neutral)}
        aria-hidden
      >
        <Inbox className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[13px] leading-5 text-foreground/90">{view.message}</p>
        {view.scope ? <p className="mt-0.5 text-[11px] text-muted-foreground">{view.scope}</p> : null}
      </div>
    </div>
  )
}

export function ErrorStateView({ view }: { view: AssistantErrorView }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-destructive/[0.06] px-3 py-2.5 text-[13px] leading-5 text-foreground ring-1 ring-destructive/25">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <p>{view.message}</p>
    </div>
  )
}

function BriefView({
  view,
  compact,
  onFollowUp,
}: {
  view: AssistantBriefView
  compact?: boolean
  onFollowUp?: FollowUp
}) {
  if (view.metrics?.length === 1) {
    return (
      <MetricResult
        metric={view.metrics[0]!}
        summary={view.summary}
        scope={view.scope ?? view.metrics[0]!.scope}
        compact={compact}
        onFollowUp={onFollowUp}
      />
    )
  }
  return (
    <div className="space-y-2">
      <ViewHeader summary={view.summary} scope={view.scope} compact={compact} />
      {view.metrics?.length ? <MetricSummary metrics={view.metrics} compact={compact} /> : null}
    </div>
  )
}

function OperationalSummaryView({
  view,
  compact,
}: {
  view: AssistantOperationalSummaryView
  compact?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1 px-1">
        <SectionEyebrow>Resumen operativo</SectionEyebrow>
        <p className={cn('text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>{view.summary}</p>
        {view.scope ? <p className="text-[11px] text-muted-foreground">{view.scope}</p> : null}
      </div>
      <MetricSummary metrics={view.metrics} compact={compact} />
      {view.actions?.length ? (
        <div className="space-y-1.5">
          <SectionEyebrow tone="muted" className="px-1">
            Acciones prioritarias
          </SectionEyebrow>
          <ul className="divide-y divide-border/50 rounded-2xl bg-card p-1 ring-1 ring-border/70">
            {view.actions.slice(0, 6).map((action) => (
              <ActionRow key={action.id} action={action} compact={compact} />
            ))}
          </ul>
        </div>
      ) : null}
      {view.okrs?.length ? (
        <div className="space-y-1.5">
          <SectionEyebrow tone="muted" className="px-1">
            OKRs relevantes
          </SectionEyebrow>
          <ul className="divide-y divide-border/50 rounded-2xl bg-card p-1 ring-1 ring-border/70">
            {view.okrs.slice(0, 4).map((okr) => (
              <OkrProgressRow key={okr.id} okr={okr} compact={compact} />
            ))}
          </ul>
        </div>
      ) : null}
      {view.recommendation ? <RecommendationCard view={view.recommendation} compact={compact} /> : null}
    </div>
  )
}

function ReplyViewBlock({
  view,
  compact,
  onFollowUp,
}: {
  view: AssistantReplyView
  compact?: boolean
  onFollowUp?: FollowUp
}) {
  switch (view.type) {
    case 'brief':
      return <BriefView view={view} compact={compact} onFollowUp={onFollowUp} />
    case 'action_list':
      return <ActionList view={view} compact={compact} />
    case 'okr_list':
      return <OKRProgressList view={view} compact={compact} />
    case 'operational_summary':
      return <OperationalSummaryView view={view} compact={compact} />
    case 'recommendation':
      return <RecommendationCard view={view} compact={compact} />
    case 'empty':
      return <EmptyStateView view={view} />
    case 'error':
      return <ErrorStateView view={view} />
    default:
      return null
  }
}

/**
 * Renderiza vistas estructuradas del copiloto.
 * Si hay summary narrativo y las vistas ya lo incluyen (list/brief/ops), no lo duplica.
 */
export function AssistantReplyViews({
  ui,
  narrative,
  compact,
  onFollowUp,
}: {
  ui: AssistantUiPayload
  /** Texto del modelo; se muestra solo si aporta algo distinto a las vistas. */
  narrative?: string
  compact?: boolean
  /** Permite que una vista pida el detalle dentro del mismo chat. */
  onFollowUp?: FollowUp
}) {
  const narrativeText = useMemo(() => {
    const primary = ui.views[0]
    const primarySummary =
      primary && 'summary' in primary && typeof primary.summary === 'string' ? primary.summary : ''
    let text = narrative?.trim() ?? ''
    // La vista ya muestra su resumen: conservar solo lo que el texto agrega (p. ej. cambio de alcance).
    for (const repeated of [primarySummary, ui.summary ?? '']) {
      if (repeated && text.includes(repeated)) text = text.replace(repeated, '').trim()
    }
    if (!text || !primary) return text
    // Evitar muro de texto cuando ya hay listas/métricas
    if (
      (primary.type === 'action_list' || primary.type === 'okr_list' || primary.type === 'operational_summary') &&
      text.length > 280
    ) {
      return ''
    }
    return text
  }, [narrative, ui])

  return (
    <div className={cn('space-y-3', compact && 'space-y-2.5')}>
      {narrativeText ? (
        <p className={cn('whitespace-pre-line px-1 text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
          {narrativeText}
        </p>
      ) : null}
      {ui.views.map((view, index) => (
        <ReplyViewBlock key={`${view.type}-${index}`} view={view} compact={compact} onFollowUp={onFollowUp} />
      ))}
    </div>
  )
}
