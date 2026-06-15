import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, SectionCardBody } from '@/components/SectionCard'

type AccionFormBlockProps = {
  blockId: string
  step: number
  title: string
  subtitle: string
  icon?: LucideIcon
  expanded: boolean
  onToggle: () => void
  children: ReactNode
  /** Resumen en cabecera cuando está colapsado. */
  collapsedSummary?: string
  editProtected?: boolean
}

export function AccionFormBlock({
  blockId,
  step,
  title,
  subtitle,
  icon: Icon,
  expanded,
  onToggle,
  children,
  collapsedSummary,
  editProtected = false,
}: AccionFormBlockProps) {
  const bodyId = `${blockId}-body`
  const hintText = expanded ? subtitle : (collapsedSummary ?? subtitle)

  return (
    <SectionCard
      className={cn(
        'accion-form-block transition-[border-color,box-shadow]',
        blockId,
        expanded && 'border-primary/25 shadow-sm ring-1 ring-primary/10'
      )}
      data-accion-edit-protected={editProtected ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className={cn(
          'accion-form-block-toggle flex w-full touch-manipulation text-left transition-colors',
          'px-3 py-3 sm:px-4 sm:py-3.5',
          expanded
            ? 'border-b border-border/50 bg-card hover:bg-muted/10'
            : 'bg-muted/20 hover:bg-muted/30 active:bg-muted/40'
        )}
      >
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 sm:gap-x-3">
          {Icon ? (
            <div
              className={cn(
                'row-span-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10',
                expanded
                  ? 'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20'
                  : 'bg-background/80 text-muted-foreground ring-1 ring-inset ring-border/60'
              )}
            >
              <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
            </div>
          ) : null}

          <div className={cn('min-w-0', Icon ? 'col-start-2' : 'col-span-2 col-start-1')}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                Paso {step}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground sm:text-[15px]">{title}</p>
          </div>

          <ChevronDown
            className={cn(
              'col-start-3 row-start-1 mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-180 text-foreground'
            )}
            aria-hidden
          />

          {hintText ? (
            <p
              className={cn(
                Icon ? 'col-start-2 col-span-1' : 'col-span-2 col-start-1',
                'text-xs leading-relaxed sm:text-sm',
                expanded
                  ? 'text-muted-foreground'
                  : 'font-medium text-foreground/80 [overflow-wrap:anywhere] sm:line-clamp-2'
              )}
            >
              {hintText}
            </p>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div id={bodyId}>
          <SectionCardBody className="space-y-3 px-3 py-3 sm:space-y-4 sm:p-4 md:p-6">
            {children}
          </SectionCardBody>
        </div>
      ) : null}
    </SectionCard>
  )
}
