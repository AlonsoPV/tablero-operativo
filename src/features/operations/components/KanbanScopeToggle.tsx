import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
  activeLabel?: string
  title: string
  tone?: 'primary' | 'sky'
  /** group = dentro de un cluster; standalone = chip suelto */
  variant?: 'group' | 'standalone'
  className?: string
}

/** Toggle compacto de alcance de vista (iniciativas / propias). */
export function KanbanScopeToggle({
  id,
  active,
  disabled = false,
  onClick,
  icon: Icon,
  label,
  activeLabel,
  title,
  tone = 'primary',
  variant = 'standalone',
  className,
}: Props) {
  const activeTone =
    tone === 'sky'
      ? 'border-sky-500/70 bg-sky-500 text-white shadow-sm ring-1 ring-sky-500/25'
      : 'border-primary/70 bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/25'
  const switchOn =
    tone === 'sky' ? 'bg-white/25' : 'bg-primary-foreground/25'
  const knobOn =
    tone === 'sky' ? 'bg-white' : 'bg-primary-foreground'
  const inactiveTone =
    variant === 'group'
      ? 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      : 'border-border/70 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'

  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-full border px-2.5 text-left text-xs font-semibold transition-all duration-200 sm:h-8 sm:min-h-8 sm:flex-none sm:min-w-[7.25rem]',
        active ? activeTone : inactiveTone,
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0 stroke-[2.4]',
            active ? 'opacity-95' : 'text-muted-foreground'
          )}
          aria-hidden
        />
        <span className="min-w-0 truncate">{active ? (activeLabel ?? label) : label}</span>
      </span>
      <span
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200',
          active ? switchOn : 'bg-muted-foreground/20'
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full shadow-sm transition-all duration-200',
            active ? cn('translate-x-[0.875rem]', knobOn) : 'translate-x-0.5 bg-background ring-1 ring-border/70'
          )}
        />
      </span>
    </button>
  )
}
