import { cn } from '@/lib/utils'
import { CHALLENGE_IMPACT_OPTIONS } from '../constants'
import type { ChallengeImpactType } from '../types'

export function ImpactChipSelector({
  value,
  onChange,
}: {
  value: ChallengeImpactType[]
  onChange: (next: ChallengeImpactType[]) => void
}) {
  const toggle = (impact: ChallengeImpactType) => {
    onChange(value.includes(impact) ? value.filter((item) => item !== impact) : [...value, impact])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {CHALLENGE_IMPACT_OPTIONS.map((option) => {
        const selected = value.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-200',
              selected
                ? 'scale-[1.03] border-primary/40 bg-primary/10 text-primary shadow-sm shadow-primary/10'
                : 'border-border/70 bg-background text-muted-foreground hover:border-border hover:text-foreground active:scale-95'
            )}
            aria-pressed={selected}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
