import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toneSoftClass, type AssistantTone } from './tones'

type StatTileProps = {
  value: number | string
  label: string
  icon?: LucideIcon
  tone?: AssistantTone
  hint?: string
  compact?: boolean
  onClick?: () => void
  disabled?: boolean
}

export function StatTile({
  value,
  label,
  icon: Icon,
  tone = 'neutral',
  hint,
  compact = false,
  onClick,
  disabled,
}: StatTileProps) {
  const content = (
    <>
      {Icon ? (
        <span
          className={cn(
            'shrink-0 items-center justify-center rounded-xl ring-1',
            toneSoftClass[tone],
            compact ? 'inline-flex h-7 w-7' : 'hidden h-9 w-9 sm:inline-flex'
          )}
          aria-hidden
        >
          <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </span>
      ) : null}
      <span className="min-w-0 text-left">
        <span
          className={cn(
            'block font-semibold leading-none tracking-tight tabular-nums text-foreground',
            compact ? 'text-lg' : 'text-2xl'
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            'mt-1 block truncate font-medium text-muted-foreground',
            compact ? 'text-[11px]' : 'text-xs'
          )}
        >
          {label}
        </span>
      </span>
    </>
  )

  const base = cn(
    'flex min-w-0 items-center gap-2.5 rounded-2xl bg-card text-left ring-1 ring-border/70',
    compact ? 'px-2.5 py-2' : 'px-3 py-3',
    'shadow-[0_10px_24px_-22px_hsl(var(--foreground)/0.5)]'
  )

  if (!onClick) {
    return (
      <div className={base} title={hint}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        base,
        'transition duration-150 hover:-translate-y-0.5 hover:ring-primary/35 hover:shadow-[0_16px_30px_-22px_hsl(var(--primary)/0.55)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'active:translate-y-0 disabled:pointer-events-none disabled:opacity-50'
      )}
    >
      {content}
    </button>
  )
}
