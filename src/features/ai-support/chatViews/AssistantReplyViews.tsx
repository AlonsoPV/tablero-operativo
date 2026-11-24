import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from '@/features/okrs/okrPresentation'
import { ROUTES } from '@/constants'
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">{children}</p>
  )
}

function metricToneClass(tone: AssistantMetric['tone']) {
  switch (tone) {
    case 'danger':
      return 'bg-red-500/10 text-red-900 ring-red-500/25 dark:text-red-100'
    case 'warning':
      return 'bg-amber-500/10 text-amber-950 ring-amber-500/25 dark:text-amber-100'
    case 'ok':
      return 'bg-emerald-500/10 text-emerald-950 ring-emerald-500/25 dark:text-emerald-100'
    default:
      return 'bg-muted/50 text-foreground/90 ring-border/40'
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
          className={cn(
            'rounded-xl px-2.5 py-2 ring-1',
            metricToneClass(metric.tone),
            compact && 'px-2 py-1.5'
          )}
          title={metric.scope}
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.04em] opacity-75">
            {metric.label}
          </p>
          <p className={cn('font-semibold tabular-nums', compact ? 'text-base' : 'text-lg')}>
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function formatFecha(fecha: string | null | undefined) {
  if (!fecha) return null
  const match = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return fecha
  return `${match[3]}/${match[2]}/${match[1]}`
}

export function ActionRow({
  action,
  compact,
}: {
  action: AssistantActionRowView
  compact?: boolean
}) {
  const meta = [action.estado, formatFecha(action.fecha), action.prioridad, action.responsable]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="min-w-0">
      <Link
        to={action.href}
        className={cn(
          'group flex items-start justify-between gap-2 rounded-xl bg-muted/35 px-2.5 py-2 ring-1 ring-transparent transition hover:bg-muted/55 hover:ring-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact ? 'py-1.5' : 'py-2'
        )}
      >
        <div className="min-w-0 space-y-0.5">
          <p
            className={cn(
              'truncate font-medium text-foreground',
              compact ? 'text-[12px] leading-4' : 'text-[13px] leading-5'
            )}
          >
            {action.title}
          </p>
          {meta ? (
            <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
          ) : null}
        </div>
        <ArrowUpRight
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary opacity-70 transition group-hover:opacity-100"
          aria-hidden
        />
      </Link>
    </li>
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
  const canExpand = view.actions.length > INITIAL_VISIBLE
  const remainingServer = Math.max(0, view.total - view.visible)

  return (
    <div className="space-y-2">
      {view.summary ? (
        <p className={cn('text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
          {view.summary}
        </p>
      ) : null}
      {view.scope ? (
        <p className="text-[11px] text-muted-foreground">{view.scope}</p>
      ) : null}
      <ul className="space-y-1.5">
        {shown.map((action) => (
          <ActionRow key={action.id} action={action} compact={compact} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>
          Mostrando {shown.length} de {view.total}
          {view.truncated ? ' (lista parcial)' : ''}
        </span>
        {canExpand && !expanded ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            onClick={() => setExpanded(true)}
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
  const canExpand = view.okrs.length > INITIAL_VISIBLE

  return (
    <div className="space-y-2">
      {view.summary ? (
        <p className={cn('text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
          {view.summary}
        </p>
      ) : null}
      {view.scope ? (
        <p className="text-[11px] text-muted-foreground">{view.scope}</p>
      ) : null}
      <ul className="space-y-2">
        {shown.map((okr) => (
          <OkrProgressRow key={okr.id} okr={okr} compact={compact} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>
          Mostrando {shown.length} de {view.total}
          {view.truncated ? ' (lista parcial)' : ''}
        </span>
        {canExpand && !expanded ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            onClick={() => setExpanded(true)}
          >
            Ver más
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function OkrProgressRow({ okr, compact }: { okr: AssistantOkrRowView; compact?: boolean }) {
  const progressLabel =
    okr.progress == null ? 'Sin avance calculable' : `${Math.round(okr.progress)}%`
  const scopeLabel =
    okr.scope === 'team' ? 'Equipo' : okr.scope === 'company' ? 'Empresa' : okr.scope || null
  const meta = [
    scopeLabel,
    `${okr.krCount} KR${okr.krCount === 1 ? '' : 's'}`,
    okr.pace,
    okr.initiativesHint,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li>
      <Link
        to={okr.href}
        className={cn(
          'block space-y-1.5 rounded-xl bg-muted/35 px-2.5 py-2 transition hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact && 'py-1.5'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'min-w-0 font-medium text-foreground',
              compact ? 'text-[12px] leading-4' : 'text-[13px] leading-5'
            )}
          >
            {okr.nombre}
          </p>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground/80">
            {progressLabel}
          </span>
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
    <div
      className={cn(
        'rounded-xl bg-primary/5 px-2.5 py-2 ring-1 ring-primary/15',
        compact && 'py-1.5'
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Lightbulb className="h-3 w-3 text-primary" aria-hidden />
        <SectionLabel>Recomendacion</SectionLabel>
      </div>
      <p className={cn('text-foreground/90', compact ? 'text-[12px] leading-4' : 'text-[13px] leading-5')}>
        {text}
      </p>
      {nextAction ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Siguiente: {nextAction}</p>
      ) : null}
    </div>
  )
}

export function EmptyStateView({ view }: { view: AssistantEmptyView }) {
  return (
    <div className="rounded-xl bg-muted/30 px-2.5 py-2 text-[13px] text-muted-foreground ring-1 ring-border/35">
      <p>{view.message}</p>
      {view.scope ? <p className="mt-1 text-[11px]">{view.scope}</p> : null}
    </div>
  )
}

export function ErrorStateView({ view }: { view: AssistantErrorView }) {
  return (
    <div className="rounded-xl bg-destructive/10 px-2.5 py-2 text-[13px] text-destructive ring-1 ring-destructive/25">
      {view.message}
    </div>
  )
}

function BriefView({ view, compact }: { view: AssistantBriefView; compact?: boolean }) {
  return (
    <div className="space-y-2">
      <p className={cn('text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
        {view.summary}
      </p>
      {view.scope ? <p className="text-[11px] text-muted-foreground">{view.scope}</p> : null}
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
      <div className="space-y-1">
        <SectionLabel>Resumen operativo</SectionLabel>
        <p className={cn('text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
          {view.summary}
        </p>
        {view.scope ? <p className="text-[11px] text-muted-foreground">{view.scope}</p> : null}
      </div>
      <MetricSummary metrics={view.metrics} compact={compact} />
      {view.actions?.length ? (
        <div className="space-y-1.5">
          <SectionLabel>Acciones prioritarias</SectionLabel>
          <ul className="space-y-1.5">
            {view.actions.slice(0, 6).map((action) => (
              <ActionRow key={action.id} action={action} compact={compact} />
            ))}
          </ul>
        </div>
      ) : null}
      {view.okrs?.length ? (
        <div className="space-y-1.5">
          <SectionLabel>OKRs relevantes</SectionLabel>
          <ul className="space-y-2">
            {view.okrs.slice(0, 4).map((okr) => (
              <OkrProgressRow key={okr.id} okr={okr} compact={compact} />
            ))}
          </ul>
        </div>
      ) : null}
      {view.recommendation ? (
        <RecommendationCard view={view.recommendation} compact={compact} />
      ) : null}
    </div>
  )
}

function ReplyViewBlock({
  view,
  compact,
}: {
  view: AssistantReplyView
  compact?: boolean
}) {
  switch (view.type) {
    case 'brief':
      return <BriefView view={view} compact={compact} />
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
const EXECUTIVE_FOLLOWUP_CHIPS = [
  { label: 'Ver evidencia', prompt: 'Muéstrame las acciones que sustentan esta recomendación.' },
  { label: 'Prevenir esta semana', prompt: '¿Qué problemas podemos prevenir esta semana?' },
  { label: 'Revisión de 15 min', prompt: 'Hagamos una revisión ejecutiva de 15 minutos.' },
] as const

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
  onFollowUp?: (prompt: string) => void
}) {
  const showNarrative = useMemo(() => {
    const text = narrative?.trim()
    if (!text) return false
    const primary = ui.views[0]
    if (!primary) return true
    if (primary.type === 'brief' && primary.summary === text) return false
    if (primary.type === 'action_list' && primary.summary === text) return false
    if (primary.type === 'operational_summary' && primary.summary === text) return false
    if (ui.summary && ui.summary === text) return false
    // Evitar muro de texto cuando ya hay listas/métricas
    if (
      (primary.type === 'action_list' ||
        primary.type === 'okr_list' ||
        primary.type === 'operational_summary') &&
      text.length > 280
    ) {
      return false
    }
    return text.length > 0 && text !== ui.summary
  }, [narrative, ui])

  const asOfLabel = ui.asOf
    ? new Date(ui.asOf).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
    : null

  return (
    <div className={cn('space-y-3', compact && 'space-y-2.5')}>
      {showNarrative ? (
        <p className={cn('text-foreground/90', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
          {narrative!.trim()}
        </p>
      ) : null}
      {ui.views.map((view, index) => (
        <ReplyViewBlock key={`${view.type}-${index}`} view={view} compact={compact} />
      ))}
      {onFollowUp && ui.views.some((v) => v.type === 'operational_summary') ? (
        <div
          className="flex flex-wrap gap-1.5 pt-0.5"
          role="group"
          aria-label="Acciones contextuales de profundización"
        >
          {EXECUTIVE_FOLLOWUP_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onFollowUp(chip.prompt)}
              className={cn(
                'rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                compact ? 'text-[10px]' : 'text-[11px]'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      {asOfLabel || (ui.sources && ui.sources.length > 0) ? (
        <p className={cn('text-muted-foreground', compact ? 'text-[10px] leading-4' : 'text-[11px] leading-4')}>
          {asOfLabel ? `Corte: ${asOfLabel}` : null}
          {asOfLabel && ui.sources?.length ? ' · ' : null}
          {ui.sources?.length ? `Fuentes: ${ui.sources.join(', ')}` : null}
          {ui.limitations?.length ? ` · ${ui.limitations.join(' ')}` : null}
        </p>
      ) : null}
    </div>
  )
}
