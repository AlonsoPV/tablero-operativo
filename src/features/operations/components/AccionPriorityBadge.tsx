import { cn } from '@/lib/utils'
import { priorityDisplayLabel } from '../utils/priorityLabels'
import { priorityColorClasses, priorityColorFor, priorityDotClasses } from '../utils/priorityColors'

type AccionPriorityBadgeProps = {
  prioridad: string
  catalogColor?: string | null
  className?: string
  compact?: boolean
  showDot?: boolean
}

export function AccionPriorityBadge({
  prioridad,
  catalogColor,
  className,
  compact = false,
  showDot = true,
}: AccionPriorityBadgeProps) {
  const color = priorityColorFor(prioridad, catalogColor)

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center rounded-md border font-semibold',
        compact ? 'gap-1 px-1.5 py-0.5 text-[10px]' : 'gap-1.5 px-2 py-0.5 text-xs',
        priorityColorClasses(color),
        className
      )}
      title={priorityDisplayLabel(prioridad)}
    >
      {showDot ? (
        <span className={cn('h-2 w-2 shrink-0 rounded-full', priorityDotClasses(color))} aria-hidden />
      ) : null}
      <span className="truncate">{priorityDisplayLabel(prioridad)}</span>
    </span>
  )
}
