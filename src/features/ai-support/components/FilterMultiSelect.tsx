import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
}

export function FilterMultiSelect({
  label,
  emptyLabel,
  icon,
  options,
  values,
  onChange,
  disabled,
  className,
  tone = 'default',
}: {
  label: string
  emptyLabel: string
  icon?: ReactNode
  options: Array<{ value: string; label: string }>
  values: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  className?: string
  /** `focus` = dropdown de contexto (distinto al switch Hablar/Escribir). */
  tone?: 'default' | 'focus'
}) {
  const hasSelection = values.length > 0
  const isFocus = tone === 'focus'
  const summary =
    values.length === 0
      ? emptyLabel
      : values.length === 1
        ? options.find((item) => item.value === values[0])?.label || label
        : `${values.length} ${label.toLowerCase()}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || options.length === 0}>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || options.length === 0}
          className={cn(
            'group h-9 w-full justify-between gap-2 px-2.5 text-[12px] font-medium transition duration-200',
            'focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:translate-y-0 disabled:opacity-50',
            isFocus
              ? [
                  'rounded-lg border border-dashed border-border/70 bg-background text-muted-foreground shadow-none',
                  'hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground',
                  hasSelection &&
                    'border-solid border-primary/30 bg-primary/[0.06] text-foreground hover:bg-primary/[0.1]',
                ]
              : [
                  'rounded-2xl border border-border/50 bg-background/70 shadow-[0_10px_24px_-22px_hsl(var(--foreground)/0.45)] backdrop-blur-sm',
                  'hover:-translate-y-px hover:border-primary/35 hover:bg-background',
                  hasSelection &&
                    'border-primary/30 bg-primary/[0.08] text-foreground hover:bg-primary/[0.12]',
                ],
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center justify-center transition',
                  isFocus
                    ? cn('h-5 w-5 rounded-md', hasSelection ? 'text-primary' : 'text-muted-foreground')
                    : cn(
                        'h-6 w-6 rounded-xl',
                        hasSelection
                          ? 'bg-primary/15 text-primary'
                          : 'bg-primary/[0.06] text-muted-foreground group-hover:text-primary'
                      )
                )}
              >
                {icon}
              </span>
            ) : null}
            <span className="truncate tracking-tight">{summary}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {values.length > 1 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                {values.length}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition duration-200 group-data-[state=open]:rotate-180',
                hasSelection ? 'text-primary/80' : 'text-muted-foreground/70'
              )}
              aria-hidden
            />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-[min(20rem,var(--radix-dropdown-menu-trigger-width))] overflow-y-auto rounded-2xl border-border/60 p-1.5 shadow-[0_18px_40px_-28px_hsl(var(--foreground)/0.55)]"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold tracking-tight text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1" />
        {options.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">Sin opciones</p>
        ) : (
          options.map((option) => {
            const checked = values.includes(option.value)
            return (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={checked}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onChange(toggleId(values, option.value))}
                className="rounded-xl text-[12px]"
              >
                <span className="flex items-center gap-1.5">
                  {checked ? <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden /> : null}
                  <span className="truncate">{option.label}</span>
                </span>
              </DropdownMenuCheckboxItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CompactToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15'
          : 'bg-background text-muted-foreground ring-border/70 hover:text-foreground'
      )}
    >
      {active ? 'Usando' : 'Pausado'}
    </button>
  )
}
