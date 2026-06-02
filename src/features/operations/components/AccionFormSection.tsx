import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/InfoHint'
import { SectionCard, SectionCardHeader, SectionCardBody } from '@/components/SectionCard'
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
  icon,
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
  const headerSubtitle = infoHint
    ? collapsible && !expanded
      ? collapsedHint
      : undefined
    : collapsible && !expanded
      ? (collapsedHint ?? subtitle)
      : subtitle

  const headerActions = (
    <div className="flex shrink-0 items-center gap-1.5">
      {infoHint ? <InfoHint text={infoHint} className="shrink-0" /> : null}
      {collapsible ? (
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />
      ) : null}
    </div>
  )

  const header = (
    <SectionCardHeader
      titleId={`${sectionId}-title`}
      eyebrow={eyebrow}
      title={title}
      subtitle={headerSubtitle}
      icon={icon}
      action={infoHint || collapsible ? headerActions : undefined}
    />
  )

  if (collapsible) {
    return (
      <SectionCard className={cn('accion-form-section', sectionId)}>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex w-full text-left transition-colors hover:bg-muted/20',
            expanded && 'border-b border-border/50'
          )}
          aria-expanded={expanded}
          aria-controls={`${sectionId}-body`}
        >
          {header}
        </button>
        {expanded && children ? (
          <div id={`${sectionId}-body`}>
            <SectionCardBody className={cn('space-y-4', bodyClassName)}>{children}</SectionCardBody>
          </div>
        ) : null}
      </SectionCard>
    )
  }

  return (
    <SectionCard className={cn('accion-form-section', sectionId)}>
      {header}
      {children ? (
        <SectionCardBody className={cn('space-y-4', bodyClassName)}>{children}</SectionCardBody>
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
