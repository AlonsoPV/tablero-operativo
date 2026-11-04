import { cn } from '@/lib/utils'
import type { CopilotClarification } from '@/features/ai-support/copilot/types'

type AssistantClarificationChipsProps = {
  clarification: CopilotClarification
  compact?: boolean
  onSelect: (label: string) => void
}

export function AssistantClarificationChips({
  clarification,
  compact = false,
  onSelect,
}: AssistantClarificationChipsProps) {
  return (
    <div className="mt-2 space-y-1.5" role="group" aria-label="Opciones para aclarar">
      <p className={cn('text-muted-foreground', compact ? 'text-[12px]' : 'text-[13px]')}>
        {clarification.question}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {clarification.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.label)}
            className={cn(
              'rounded-full bg-background px-2.5 py-1 text-left ring-1 ring-border/60 transition',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              compact ? 'text-[11px] font-medium' : 'text-xs font-medium'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
