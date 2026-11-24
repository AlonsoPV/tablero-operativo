import { Bot, MessageCircle, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantLane } from '@/features/ai-support/writeIntent'

/** 1 col en 320px; 2 col desde 380px. Ninguna vía viene preseleccionada. */
export const ASSISTANT_LANE_GRID_CLASS = 'grid w-full max-w-lg grid-cols-1 min-[380px]:grid-cols-2'
export const ASSISTANT_LANE_LABELS: Record<AssistantLane, string> = {
  write: 'Consultar',
  talk: 'Sesión guiada',
}

type AssistantLaneChooserProps = {
  compact?: boolean
  onChoose: (lane: AssistantLane) => void
}

type AssistantLaneSwitchProps = {
  lane: AssistantLane
  compact?: boolean
  onChange: (lane: AssistantLane) => void
}

function LaneOption({
  title,
  description,
  icon: Icon,
  onClick,
  compact,
  emphasis,
}: {
  title: string
  description: string
  icon: typeof MessageCircle
  onClick: () => void
  compact?: boolean
  emphasis: 'primary' | 'secondary'
}) {
  const isPrimary = emphasis === 'primary'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className={cn(
        'group flex w-full items-start gap-3 text-left transition duration-200',
        'rounded-2xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'active:scale-[0.99]',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3 sm:px-4',
        isPrimary
          ? [
              'border-primary/20 bg-primary text-primary-foreground',
              'shadow-[0_12px_28px_-18px_hsl(var(--primary)/0.65)]',
              'hover:-translate-y-0.5 hover:bg-primary/92',
            ]
          : [
              'border-border/70 bg-background/90 text-foreground backdrop-blur-sm',
              'shadow-[0_10px_24px_-20px_rgba(15,23,42,0.3)]',
              'hover:-translate-y-0.5 hover:border-primary/35 hover:bg-background',
            ]
      )}
    >
      <span
        className={cn(
          'mt-0.5 inline-flex shrink-0 items-center justify-center rounded-xl',
          compact ? 'h-8 w-8' : 'h-9 w-9',
          isPrimary ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary'
        )}
      >
        <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className={cn('block font-semibold tracking-tight', compact ? 'text-sm' : 'text-[15px]')}>
          {title}
        </span>
        <span
          className={cn(
            'mt-0.5 block leading-snug',
            compact ? 'text-[11px]' : 'text-xs',
            isPrimary ? 'text-primary-foreground/80' : 'text-muted-foreground'
          )}
        >
          {description}
        </span>
      </span>
    </button>
  )
}

export function AssistantLaneChooser({ compact = false, onChoose }: AssistantLaneChooserProps) {
  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-col justify-center overflow-hidden',
        'bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--primary)/0.14),transparent_55%),linear-gradient(180deg,hsl(var(--muted)/0.35)_0%,hsl(var(--background))_48%)]',
        compact ? 'gap-3 px-3 py-4' : 'gap-3.5 px-4 py-5 sm:px-6 sm:py-6'
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex w-full max-w-lg flex-col items-center text-center">
        <div className="relative mb-2.5">
          <span className="absolute inset-0 rounded-[1.5rem] bg-primary/20 blur-2xl" aria-hidden />
          <span
            className={cn(
              'relative inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_16px_36px_-18px_hsl(var(--primary)/0.75)]',
              compact ? 'h-11 w-11' : 'h-12 w-12'
            )}
          >
            <Bot className={cn(compact ? 'h-5 w-5' : 'h-5.5 w-5.5 h-[22px] w-[22px]')} aria-hidden />
          </span>
        </div>
        <h2 className={cn('font-semibold tracking-tight', compact ? 'text-base' : 'text-xl')}>
          ¿Cómo avanzamos?
        </h2>
        <p
          className={cn(
            'mt-1 max-w-sm leading-5 text-muted-foreground',
            compact ? 'text-xs' : 'text-sm'
          )}
        >
          Elige consultar el tablero o una sesión guiada. Nada está preseleccionado.
        </p>
      </div>

      <div
        className={cn('relative mx-auto', ASSISTANT_LANE_GRID_CLASS, compact ? 'gap-2' : 'gap-2.5')}
        role="group"
        aria-label="Vía del asistente"
      >
        <LaneOption
          compact={compact}
          emphasis="secondary"
          icon={PenLine}
          title={ASSISTANT_LANE_LABELS.write}
          description={
            compact
              ? 'Copiloto · consulta y crea'
              : 'Consulta, prioriza y propone acciones del tablero.'
          }
          onClick={() => onChoose('write')}
        />
        <LaneOption
          compact={compact}
          emphasis="secondary"
          icon={MessageCircle}
          title={ASSISTANT_LANE_LABELS.talk}
          description={
            compact
              ? 'Guía 15 min · texto o voz'
              : 'Sesión de 15 min con Guía. Prioriza y cierra con reporte.'
          }
          onClick={() => onChoose('talk')}
        />
      </div>
    </div>
  )
}

export function AssistantLaneSwitch({ lane, compact = false, onChange }: AssistantLaneSwitchProps) {
  const options: Array<{ id: AssistantLane; label: string; hint: string; icon: typeof MessageCircle }> = [
    { id: 'write', label: ASSISTANT_LANE_LABELS.write, hint: 'Copiloto', icon: PenLine },
    { id: 'talk', label: ASSISTANT_LANE_LABELS.talk, hint: '15 min', icon: MessageCircle },
  ]
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-0.5 rounded-2xl p-1',
        compact
          ? 'rounded-full bg-foreground/[0.06] ring-1 ring-foreground/10'
          : 'rounded-2xl bg-muted/40 ring-1 ring-border/50 gap-1'
      )}
      role="tablist"
      aria-label="Vía del asistente"
    >
      {options.map((option) => {
        const active = lane === option.id
        const Icon = option.icon
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            title={option.hint}
            className={cn(
              'relative flex min-w-0 items-center justify-center gap-1.5 transition duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              compact ? 'h-7 rounded-full px-2.5' : 'min-h-11 rounded-xl px-3 py-2',
              active
                ? compact
                  ? 'bg-foreground text-background shadow-sm'
                  : 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
            )}
          >
            <Icon className={cn('shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
            {compact ? (
              <span className="truncate text-[12px] font-semibold tracking-tight">{option.label}</span>
            ) : (
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-xs font-semibold tracking-tight">{option.label}</span>
                <span
                  className={cn(
                    'block truncate text-[10px]',
                    active ? 'text-primary-foreground/80' : 'text-muted-foreground/85'
                  )}
                >
                  {option.hint}
                </span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
