import { Link } from 'react-router-dom'
import { ArrowUpRight, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  AssistantBriefingModel,
  AssistantQuickAction,
} from '@/features/ai-support/assistantBriefing'

type AssistantBriefingPanelProps = {
  briefing: AssistantBriefingModel
  actions: AssistantQuickAction[]
  loading?: boolean
  compact?: boolean
  onAction: (action: AssistantQuickAction) => void
}

export function AssistantBriefingPanel({
  briefing,
  actions,
  loading = false,
  compact = false,
  onAction,
}: AssistantBriefingPanelProps) {
  return (
    <section
      className={cn(
        'animate-in fade-in-0 slide-in-from-bottom-1 duration-300',
        compact ? 'space-y-3 px-0.5' : 'space-y-4'
      )}
      aria-label="Resumen operativo del asistente"
    >
      <div className="space-y-1.5">
        <p
          className={cn(
            'font-medium tracking-tight text-foreground',
            compact ? 'text-sm' : 'text-base'
          )}
        >
          {briefing.greeting}
        </p>
        <p
          className={cn(
            'text-muted-foreground',
            compact ? 'text-[12px] leading-5' : 'text-sm leading-6'
          )}
        >
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {briefing.summary}
            </span>
          ) : (
            briefing.summary
          )}
        </p>
      </div>

      {briefing.priorityTitle ? (
        <div
          className={cn(
            'rounded-2xl bg-background/80 ring-1 ring-border/50',
            compact ? 'px-3 py-2.5' : 'px-3.5 py-3'
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-primary">
            Prioridad actual
          </p>
          <p
            className={cn(
              'mt-1 font-medium leading-5 text-foreground',
              compact ? 'text-[13px]' : 'text-sm'
            )}
          >
            {briefing.priorityTitle}
          </p>
          {briefing.priorityReason ? (
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {briefing.priorityReason}
            </p>
          ) : null}
          {briefing.priorityRecord ? (
            <Link
              to={briefing.priorityRecord.href}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Abrir en kanban
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" aria-hidden />
          Empieza aqui
        </p>
        <div
          className={cn(
            'flex flex-wrap',
            compact ? 'gap-1.5' : 'gap-2'
          )}
          role="group"
          aria-label="Accesos rapidos del asistente"
        >
          {actions.map((action) => {
            const disabled = Boolean(action.disabled) || loading
            return (
              <button
                key={action.id}
                type="button"
                disabled={disabled}
                title={action.disabled ? action.disabledReason : undefined}
                onClick={() => onAction(action)}
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1.5 text-left transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                  compact ? 'text-[11px] font-semibold' : 'text-xs font-semibold',
                  action.mode === 'create'
                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                    : 'bg-muted/55 text-foreground ring-1 ring-border/50 hover:bg-muted hover:text-foreground'
                )}
              >
                {action.label}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
