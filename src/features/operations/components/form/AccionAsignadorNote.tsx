import { UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  nombre?: string | null
  className?: string
}

function assignerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

/** Indicador compacto de quién asigna la acción (paso 1). */
export function AccionAsignadorNote({ nombre, className }: Props) {
  const label = nombre?.trim()
  if (!label) return null

  const initials = assignerInitials(label)

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-border/55 border-l-[3px] border-l-primary/75',
        'bg-gradient-to-r from-primary/[0.07] via-muted/20 to-muted/10 px-3 py-2.5 shadow-sm',
        className
      )}
      role="note"
      aria-label={`Asigna: ${label}`}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold tracking-tight text-primary ring-1 ring-inset ring-primary/20"
        aria-hidden
      >
        {initials.length >= 2 ? initials : <UserRound className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-snug text-muted-foreground">
          Asigna:{' '}
          <span className="font-semibold text-foreground">{label}</span>
        </p>
      </div>
    </div>
  )
}
