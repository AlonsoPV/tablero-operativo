import { Link } from 'react-router-dom'
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  ClipboardCheck,
  Flag,
  Gauge,
  Inbox,
  ListChecks,
  Loader2,
  Scale,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  AssistantBriefingModel,
  AssistantQuickAction,
  AssistantQuickActionId,
} from '@/features/ai-support/assistantBriefing'
import type { OperationalSnapshot } from '@/features/ai-support/operationalContext'
import {
  SectionEyebrow,
  StatTile,
  toneRailClass,
  toneSoftClass,
  type AssistantTone,
} from '@/features/ai-support/components/ui'

const ACTION_VISUALS: Record<AssistantQuickActionId, { icon: LucideIcon; tone: AssistantTone }> = {
  priorities: { icon: Flag, tone: 'primary' },
  daily: { icon: CalendarCheck2, tone: 'info' },
  blocked: { icon: ShieldAlert, tone: 'danger' },
  verification: { icon: ClipboardCheck, tone: 'success' },
  okrs: { icon: Target, tone: 'violet' },
  team: { icon: Users, tone: 'primary' },
  team_overdue: { icon: AlarmClock, tone: 'danger' },
  executive: { icon: Gauge, tone: 'primary' },
  risks: { icon: AlertTriangle, tone: 'warning' },
  okr_results: { icon: Target, tone: 'violet' },
  decisions: { icon: Scale, tone: 'info' },
}

export const WELCOME_STAT_PROMPTS = {
  open: 'Cuales acciones tengo abiertas?',
  overdue: 'Cuales tengo vencidas?',
  dueThisWeek: 'Cuales tengo por vencer?',
} as const

type AssistantWelcomeProps = {
  briefing: AssistantBriefingModel
  counts: OperationalSnapshot['counts'] | null
  actions: AssistantQuickAction[]
  loading?: boolean
  compact?: boolean
  onAsk: (prompt: string) => void
  onAction: (action: AssistantQuickAction) => void
}

export function AssistantWelcome({
  briefing,
  counts,
  actions,
  loading = false,
  compact = false,
  onAsk,
  onAction,
}: AssistantWelcomeProps) {
  const stats = counts
    ? [
        { key: 'open', value: counts.open, label: 'Abiertas', icon: Inbox, tone: 'primary' as const },
        { key: 'overdue', value: counts.overdue, label: 'Atrasadas', icon: AlarmClock, tone: 'danger' as const },
        {
          key: 'dueThisWeek',
          value: counts.dueThisWeek,
          label: 'Por vencer',
          icon: ListChecks,
          tone: 'warning' as const,
        },
      ].filter((stat) => stat.value > 0)
    : []
  const urgency = briefing.priorityUrgency ?? 'info'

  return (
    <section
      className={cn(
        'animate-in fade-in-0 slide-in-from-bottom-1 duration-200',
        compact ? 'space-y-3' : 'space-y-4 sm:space-y-5'
      )}
      aria-label="Resumen operativo del asistente"
    >
      <header className="space-y-1">
        <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{briefing.greeting}</p>
        <h2
          className={cn(
            'font-semibold tracking-tight text-foreground',
            compact ? 'text-base' : 'text-xl sm:text-2xl'
          )}
        >
          Tu operación, en claro.
        </h2>
        {loading || stats.length === 0 ? (
          <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {briefing.summary}
              </span>
            ) : (
              briefing.summary
            )}
          </p>
        ) : null}
      </header>

      {stats.length > 0 ? (
        <div
          className={cn(
            'grid gap-2',
            stats.length === 1
              ? 'grid-cols-1'
              : stats.length === 2
                ? 'grid-cols-2'
                : compact
                  ? 'grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-3'
          )}
          role="group"
          aria-label="Indicadores de tus acciones"
        >
          {stats.map((stat) => (
            <StatTile
              key={stat.key}
              value={stat.value}
              label={stat.label}
              icon={compact ? undefined : stat.icon}
              tone={stat.tone}
              compact={compact}
              disabled={loading}
              hint={`Ver ${stat.label.toLowerCase()} en el chat`}
              onClick={() => onAsk(WELCOME_STAT_PROMPTS[stat.key as keyof typeof WELCOME_STAT_PROMPTS])}
            />
          ))}
        </div>
      ) : null}

      {briefing.priorityTitle && briefing.priorityRecord ? (
        <article
          className={cn(
            'relative overflow-hidden rounded-2xl bg-card ring-1 ring-border/70',
            'shadow-[0_14px_32px_-26px_hsl(var(--foreground)/0.5)]',
            compact ? 'py-2.5 pl-4 pr-3' : 'py-3.5 pl-5 pr-4'
          )}
          aria-label="Prioridad recomendada"
        >
          <span className={cn('absolute inset-y-0 left-0 w-1', toneRailClass[urgency])} aria-hidden />
          <SectionEyebrow icon={Sparkles}>Tu prioridad ahora</SectionEyebrow>
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-64">
              <p className={cn('font-semibold leading-snug text-foreground', compact ? 'text-[13px]' : 'text-[15px]')}>
                {briefing.priorityTitle}
              </p>
              {briefing.priorityReason ? (
                <p className={cn('mt-0.5 text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
                  {briefing.priorityReason}
                </p>
              ) : null}
            </div>
            <Link
              to={briefing.priorityRecord.href}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full bg-primary font-semibold text-primary-foreground transition',
                'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                compact ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
              )}
            >
              Ver acción
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </article>
      ) : null}

      {actions.length > 0 ? (
        <div className="space-y-2">
          <SectionEyebrow tone="muted">Accesos rápidos</SectionEyebrow>
          <div
            className={cn('grid gap-2 sm:gap-2.5', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4')}
            role="group"
            aria-label="Accesos rapidos del asistente"
          >
            {actions.map((action) => {
              const visual = ACTION_VISUALS[action.id]
              const Icon = visual.icon
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={loading}
                  onClick={() => onAction(action)}
                  className={cn(
                    'group flex min-h-11 items-center gap-2 rounded-2xl bg-card text-left ring-1 ring-border/70 transition duration-150',
                    'hover:-translate-y-0.5 hover:ring-primary/35 hover:shadow-[0_12px_26px_-22px_hsl(var(--primary)/0.6)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0',
                    'disabled:pointer-events-none disabled:opacity-50',
                    compact ? 'px-2 py-1.5' : 'px-3 py-2.5 md:flex-col md:items-start md:gap-2.5 md:p-3.5'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center rounded-xl ring-1',
                      toneSoftClass[visual.tone],
                      compact ? 'h-6 w-6' : 'h-8 w-8'
                    )}
                    aria-hidden
                  >
                    <Icon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
                  </span>
                  <span
                    className={cn(
                      'min-w-0 font-semibold leading-tight text-foreground',
                      compact ? 'text-[11px]' : 'text-xs sm:text-[13px]'
                    )}
                  >
                    {action.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}
