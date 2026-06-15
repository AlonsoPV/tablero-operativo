import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/InfoHint'
import { SectionCard, SectionCardBody } from '@/components/SectionCard'
import { cn } from '@/lib/utils'

export type AccionFormSectionProps = {
  sectionId: string
  icon?: LucideIcon
  eyebrow?: string
  title: string
  subtitle?: string
  children?: ReactNode
  bodyClassName?: string
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  /** Texto breve en cabecera cuando la sección está colapsada. */
  collapsedHint?: string
  /** Ayuda de la sección (icono junto al título; sustituye subtítulo largo). */
  infoHint?: string
}

export function AccionFormSection({
  sectionId,
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  children,
  bodyClassName,
  collapsible,
  expanded = true,
  onToggle,
  collapsedHint,
  infoHint,
}: AccionFormSectionProps) {
  const bodyId = `${sectionId}-body`
  const hintText = infoHint
    ? collapsible && !expanded
      ? collapsedHint
      : expanded
        ? subtitle
        : undefined
    : collapsible && !expanded
      ? (collapsedHint ?? subtitle)
      : subtitle

  const toggleButton = (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={bodyId}
      className={cn(
        'accion-form-section-toggle flex w-full touch-manipulation text-left transition-colors',
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
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex min-w-0 items-center gap-1.5">
            <h2
              id={`${sectionId}-title`}
              className="text-sm font-semibold leading-snug text-foreground sm:text-[15px]"
            >
              {title}
            </h2>
            {infoHint ? <InfoHint text={infoHint} className="shrink-0" /> : null}
          </div>
        </div>

        <div className="col-start-3 row-start-1 flex shrink-0 items-center gap-1">
          <ChevronDown
            className={cn(
              'h-5 w-5 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-180 text-foreground'
            )}
            aria-hidden
          />
        </div>

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
  )

  if (collapsible) {
    return (
      <SectionCard
        className={cn(
          'accion-form-section transition-[border-color,box-shadow]',
          sectionId,
          expanded && 'border-primary/25 shadow-sm ring-1 ring-primary/10'
        )}
        data-expanded={expanded ? 'true' : 'false'}
      >
        {toggleButton}
        {expanded && children ? (
          <div id={bodyId}>
            <SectionCardBody className={cn('space-y-4 px-3 py-3 sm:p-4 md:p-6', bodyClassName)}>
              {children}
            </SectionCardBody>
          </div>
        ) : null}
      </SectionCard>
    )
  }

  return (
    <SectionCard className={cn('accion-form-section', sectionId)}>
      <div className="border-b border-border/50 px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted sm:h-10 sm:w-10">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex items-center gap-1.5">
              <h2 id={`${sectionId}-title`} className="text-sm font-semibold sm:text-[15px]">
                {title}
              </h2>
              {infoHint ? <InfoHint text={infoHint} className="shrink-0" /> : null}
            </div>
            {subtitle ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
      {children ? (
        <SectionCardBody className={cn('space-y-4 px-3 py-3 sm:p-4 md:p-6', bodyClassName)}>{children}</SectionCardBody>
      ) : null}
    </SectionCard>
  )
}

export function AccionFormField({
  label,
  htmlFor,
  hint,
  hintAsIcon = false,
  required,
  error,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  /** Texto de ayuda: párrafo debajo del label o tooltip (icono) si hintAsIcon. */
  hint?: string
  hintAsIcon?: boolean
  required?: boolean
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {hint && hintAsIcon ? <InfoHint text={hint} className="shrink-0" /> : null}
      </div>
      {hint && !hintAsIcon ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
