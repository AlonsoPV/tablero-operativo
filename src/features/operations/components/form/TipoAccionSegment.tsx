import { cn } from '@/lib/utils'
import type { TipoAccion } from '../../utils/tipoAccionConfig'

export type TipoAccionSegmentOption = {
  value: TipoAccion
  title: string
  description: string
  badge: string
}

type TipoAccionSegmentProps = {
  value: TipoAccion
  options: TipoAccionSegmentOption[]
  onChange: (value: TipoAccion) => void
  disabled?: boolean
}

export function TipoAccionSegment({ value, options, onChange, disabled }: TipoAccionSegmentProps) {
  return (
    <div
      className="grid gap-2 sm:grid-cols-3"
      role="radiogroup"
      aria-label="Tipo de acción"
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors',
              selected
                ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/25'
                : 'border-border bg-background hover:border-primary/40 hover:bg-muted/20',
              disabled && 'opacity-50'
            )}
          >
            <span
              className={cn(
                'inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              {opt.badge}
            </span>
            <span className="text-sm font-semibold text-foreground">{opt.title}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{opt.description}</span>
          </button>
        )
      })}
    </div>
  )
}
