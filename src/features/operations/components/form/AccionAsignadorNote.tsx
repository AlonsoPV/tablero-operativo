import { cn } from '@/lib/utils'

type Props = {
  nombre?: string | null
  className?: string
  compact?: boolean
}

function assignerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

/** Indicador compacto de quién asigna la acción (paso 1). */
export function AccionAsignadorNote({ nombre, className, compact }: Props) {
  const label = nombre?.trim()
  if (!label) return null

  return (
    <div
      className={cn(
        'flex h-10 w-full items-center gap-2.5 rounded-lg border px-2.5 text-left',
        'border-border/70 bg-muted/20 text-foreground',
        className
      )}
      role="note"
      aria-label={`Asigna: ${label}`}
    >
      <span
        aria-hidden
        className="inline-flex h-6 shrink-0 items-center rounded-md bg-background px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border/70"
      >
        Asigna
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
      </span>
      {compact ? null : (
        <span
          aria-hidden
          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-background px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border/70"
        >
          {assignerInitials(label)}
        </span>
      )}
    </div>
  )
}
