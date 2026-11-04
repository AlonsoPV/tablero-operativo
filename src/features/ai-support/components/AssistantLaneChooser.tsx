import { Bot, MessageCircle, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantLane } from '@/features/ai-support/writeIntent'

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
}: {
  title: string
  description: string
  icon: typeof MessageCircle
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 text-left transition duration-200',
        'rounded-2xl bg-primary text-primary-foreground',
        'shadow-[0_14px_30px_-16px_hsl(var(--primary)/0.55)]',
        'hover:-translate-y-0.5 hover:bg-primary/90',
        'active:translate-y-0 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'px-3 py-3' : 'px-4 py-3.5'
      )}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15',
          compact ? 'h-9 w-9' : 'h-10 w-10'
        )}
      >
        <Icon className={cn(compact ? 'h-4 w-4' : 'h-4.5 w-4.5 h-[18px] w-[18px]')} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block font-semibold tracking-tight', compact ? 'text-sm' : 'text-[15px]')}>
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-primary-foreground/80">
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
        compact ? 'gap-4 px-3.5 py-5' : 'gap-5 px-6 py-8'
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_70%)]"
        aria-hidden
      />

      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-3">
          <span className="absolute inset-0 rounded-[1.5rem] bg-primary/20 blur-2xl" aria-hidden />
          <span
            className={cn(
              'relative inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_16px_36px_-18px_hsl(var(--primary)/0.75)]',
              compact ? 'h-12 w-12' : 'h-14 w-14'
            )}
          >
            <Bot className={cn(compact ? 'h-5 w-5' : 'h-6 w-6')} aria-hidden />
          </span>
        </div>
        <h2 className={cn('font-semibold tracking-tight', compact ? 'text-base' : 'text-xl')}>
          Como te ayudo hoy?
        </h2>
        <p
          className={cn(
            'mt-1.5 max-w-sm leading-5 text-muted-foreground',
            compact ? 'text-xs' : 'text-sm'
          )}
        >
          Habla con Guia o escribe para priorizar y operar tu tablero.
        </p>
      </div>

      <div className="relative grid gap-2" role="group" aria-label="Via del asistente">
        <LaneOption
          compact={compact}
          icon={MessageCircle}
          title="Hablar"
          description={
            compact
              ? 'Guia 15 min · texto o voz · reporte'
              : 'Sesion de 15 minutos con Guia. Prioriza y cierra con reporte.'
          }
          onClick={() => onChoose('talk')}
        />
        <LaneOption
          compact={compact}
          icon={PenLine}
          title="Escribir"
          description={
            compact
              ? 'Copiloto del tablero · consulta y crea'
              : 'Copiloto operativo: consulta, prioriza y crea acciones.'
          }
          onClick={() => onChoose('write')}
        />
      </div>
    </div>
  )
}

export function AssistantLaneSwitch({ lane, compact = false, onChange }: AssistantLaneSwitchProps) {
  const options: Array<{ id: AssistantLane; label: string; hint: string; icon: typeof MessageCircle }> = [
    { id: 'talk', label: 'Hablar', hint: 'Guia 15 min', icon: MessageCircle },
    { id: 'write', label: 'Escribir', hint: 'Copiloto', icon: PenLine },
  ]
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/40 p-1 ring-1 ring-border/50"
      role="tablist"
      aria-label="Via del asistente"
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
            className={cn(
              'relative flex min-w-0 items-center justify-center gap-2 rounded-xl transition duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              compact ? 'min-h-10 px-2 py-1.5' : 'min-h-11 px-3 py-2',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
            )}
          >
            <Icon className={cn('shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
            <span className="min-w-0 text-left leading-tight">
              <span className={cn('block font-semibold tracking-tight', compact ? 'text-[12px]' : 'text-xs')}>
                {option.label}
              </span>
              <span
                className={cn(
                  'block truncate text-[10px]',
                  active ? 'text-primary-foreground/80' : 'text-muted-foreground/85'
                )}
              >
                {option.hint}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
