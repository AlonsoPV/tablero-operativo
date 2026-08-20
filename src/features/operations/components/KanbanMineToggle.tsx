import { UserRoundCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  active: boolean
  disabled?: boolean
  onClick: () => void
  id?: string
  className?: string
}

export function KanbanMineToggle({
  active,
  disabled = false,
  onClick,
  id = 'kanban-btn-mine',
  className,
}: Props) {
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-pressed={active}
      title={active ? 'Ver todas las acciones' : 'Ver solo acciones propias'}
      onClick={onClick}
      className={cn(
        'kanban-btn-mine inline-flex h-11 min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-full border-2 px-2.5 text-left font-bold shadow-sm transition-all duration-200 sm:h-10 sm:min-h-10 sm:w-auto sm:min-w-[8.75rem] sm:px-3',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30'
          : 'border-border/80 bg-muted/35 text-muted-foreground hover:border-border hover:bg-muted/55 hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <UserRoundCheck
          className={cn(
            'h-4 w-4 shrink-0 stroke-[2.4]',
            active ? 'text-primary-foreground' : 'text-muted-foreground'
          )}
          aria-hidden
        />
        <span className="min-w-0 truncate text-[11px] sm:text-sm">
          {active ? 'Propias' : 'Todas'}
        </span>
      </span>

      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200',
          active ? 'bg-primary-foreground/25' : 'bg-muted-foreground/25'
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full shadow-sm transition-all duration-200',
            active
              ? 'translate-x-[1.125rem] bg-primary-foreground'
              : 'translate-x-0.5 bg-background ring-1 ring-border/70'
          )}
        />
      </span>

      <span className="sr-only">{active ? 'Mostrando acciones propias' : 'Mostrando todas las acciones'}</span>
    </button>
  )
}
