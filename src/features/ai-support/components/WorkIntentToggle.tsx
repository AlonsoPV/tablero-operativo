import { cn } from '@/lib/utils'
import type { WriteIntent } from '@/features/ai-support/writeIntent'

type WorkIntentToggleProps = {
  value: WriteIntent
  onChange: (value: WriteIntent) => void
  className?: string
}

export function WorkIntentToggle({ value, onChange, className }: WorkIntentToggleProps) {
  return (
    <div
      className={cn('grid shrink-0 grid-cols-2 gap-0.5 rounded-full bg-muted/40 p-0.5', className)}
      role="radiogroup"
      aria-label="Que quieres hacer"
    >
      {(
        [
          { id: 'consult' as const, label: 'Consultar' },
          { id: 'create' as const, label: 'Crear' },
        ] as const
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === option.id
              ? option.id === 'create'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
