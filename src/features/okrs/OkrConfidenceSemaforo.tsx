import { cn } from '@/lib/utils'

export type OkrConfidence = 'red' | 'yellow' | 'green'

export const OKR_CONFIDENCE_LEVELS = [
  {
    value: 'red' as const,
    label: 'En riesgo',
    hint: 'Poco confiado de lograrlo',
    dot: 'bg-red-500',
    selected:
      'border-red-500/45 bg-red-500/[0.09] text-red-950 ring-1 ring-red-500/20 dark:text-red-50',
  },
  {
    value: 'yellow' as const,
    label: 'Con reservas',
    hint: 'Puede lograrse, con dudas',
    dot: 'bg-amber-500',
    selected:
      'border-amber-500/45 bg-amber-500/[0.09] text-amber-950 ring-1 ring-amber-500/20 dark:text-amber-50',
  },
  {
    value: 'green' as const,
    label: 'Confío',
    hint: 'Voy a lograr el objetivo',
    dot: 'bg-emerald-500',
    selected:
      'border-emerald-500/45 bg-emerald-500/[0.09] text-emerald-950 ring-1 ring-emerald-500/20 dark:text-emerald-50',
  },
] as const

export function isOkrConfidence(value: unknown): value is OkrConfidence {
  return value === 'red' || value === 'yellow' || value === 'green'
}

export function okrConfidenceLabel(value?: OkrConfidence | null) {
  return OKR_CONFIDENCE_LEVELS.find((item) => item.value === value)?.label ?? null
}

export function OkrConfidenceSemaforo({
  value,
  onChange,
  disabled,
}: {
  value?: OkrConfidence | null
  onChange: (next: OkrConfidence) => void
  disabled?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="text-sm font-medium">
        ¿Qué tan confiado te sientes, ahora, de lograr el objetivo?
      </p>
      <div
        role="radiogroup"
        aria-label="Confianza en lograr el objetivo"
        className="grid grid-cols-3 gap-1.5"
      >
        {OKR_CONFIDENCE_LEVELS.map((level) => {
          const selected = value === level.value
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${level.label}. ${level.hint}`}
              disabled={disabled}
              onClick={() => onChange(level.value)}
              className={cn(
                'flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 text-center outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring/50',
                selected
                  ? level.selected
                  : 'border-border/70 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/35',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn('h-2.5 w-2.5 shrink-0 rounded-full', level.dot)}
                />
                <span className="text-xs font-semibold text-foreground">
                  {level.label}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function OkrConfidenceBadge({
  value,
  className,
}: {
  value?: OkrConfidence | null
  className?: string
}) {
  const level = OKR_CONFIDENCE_LEVELS.find((item) => item.value === value)
  if (!level) return null
  return (
    <span
      title={`Confianza: ${level.label}. ${level.hint}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        level.selected,
        className
      )}
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', level.dot)}
      />
      {level.label}
    </span>
  )
}
