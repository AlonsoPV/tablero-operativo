import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AssistantActivityStage = 'querying' | 'preparing'

const STAGES: Array<{ id: AssistantActivityStage; label: string }> = [
  { id: 'querying', label: 'Consultando información' },
  { id: 'preparing', label: 'Preparando acción' },
]

export function AssistantActivity({
  stage,
  compact = false,
}: {
  stage: AssistantActivityStage
  compact?: boolean
}) {
  const visible = stage === 'preparing' ? STAGES : STAGES.slice(0, 1)
  const activeIndex = visible.findIndex((item) => item.id === stage)

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-card px-3 py-2 ring-1 ring-border/60',
        'animate-in fade-in-0 slide-in-from-bottom-1 duration-200',
        compact ? 'text-[11px]' : 'text-xs'
      )}
    >
      {visible.map((item, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <span
            key={item.id}
            className={cn(
              'inline-flex items-center gap-1.5 font-medium',
              active ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {done ? (
              <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
            )}
            {item.label}
            {active ? <span className="sr-only">en curso</span> : null}
          </span>
        )
      })}
    </div>
  )
}
