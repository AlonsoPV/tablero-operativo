import { cn } from '@/lib/utils'
import type { WriteIntent } from '@/features/ai-support/writeIntent'

export type WorkIntentOption<T extends string = string> = {
  id: T
  label: string
}

type WorkIntentToggleProps<T extends string = WriteIntent> = {
  value: T
  onChange: (value: T) => void
  className?: string
  /** Por defecto: Consultar | Crear (asistente). Guía pasa Accion/WhatsApp/Correo. */
  options?: ReadonlyArray<WorkIntentOption<T>>
  'aria-label'?: string
}

const DEFAULT_OPTIONS: ReadonlyArray<WorkIntentOption<WriteIntent>> = [
  { id: 'consult', label: 'Consultar' },
  { id: 'create', label: 'Crear' },
]

const EMPHASIS = new Set(['create', 'action', 'whatsapp', 'email'])

export function WorkIntentToggle<T extends string = WriteIntent>({
  value,
  onChange,
  className,
  options,
  'aria-label': ariaLabel = 'Que quieres hacer',
}: WorkIntentToggleProps<T>) {
  const items = (options ?? (DEFAULT_OPTIONS as ReadonlyArray<WorkIntentOption<T>>)) as ReadonlyArray<
    WorkIntentOption<T>
  >
  const cols = Math.min(Math.max(items.length, 2), 4)

  return (
    <div
      className={cn('max-w-full min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      <div
        className={cn(
          'inline-grid w-max gap-0.5 rounded-full bg-muted/40 p-0.5',
          cols === 2 && 'grid-cols-2',
          cols === 3 && 'grid-cols-3',
          cols === 4 && 'grid-cols-4'
        )}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {items.map((option) => {
          const selected = value === option.id
          const emphasize = EMPHASIS.has(option.id)
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                'whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? emphasize
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
