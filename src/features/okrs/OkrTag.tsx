import { cn } from '@/lib/utils'

export function OkrTag({
  label = 'OKR',
  title,
  className,
}: {
  label?: string
  title?: string
  className?: string
}) {
  return (
    <span
      title={title ?? label}
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200',
        className
      )}
    >
      {label}
    </span>
  )
}

/** Chip compacto para marcar una acción como parte del seguimiento OKR. */
export function EsOkrToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={
        checked
          ? 'Acción marcada para OKRs. Solo estas se pueden vincular como iniciativas.'
          : 'Marcar esta acción para OKRs. Solo las marcadas se pueden vincular como iniciativas.'
      }
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex h-10 w-full items-center gap-2.5 rounded-lg border px-2.5 text-left outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
        checked
          ? 'border-sky-500/40 bg-sky-500/[0.09] text-sky-950 dark:text-sky-50'
          : 'border-border/70 bg-muted/20 text-foreground hover:border-border hover:bg-muted/35',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
          checked
            ? 'bg-sky-500 text-white'
            : 'bg-background text-muted-foreground ring-1 ring-inset ring-border/70'
        )}
      >
        OKR
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {checked ? 'Se puede vincular a un KR' : 'Marcar para vincular a un KR'}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-sky-500' : 'bg-muted-foreground/25'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </span>
    </button>
  )
}
