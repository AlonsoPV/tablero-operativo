import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, SectionCardHeader, SectionCardBody } from '@/components/SectionCard'

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
  icon,
  expanded,
  onToggle,
  children,
  collapsedSummary,
  editProtected = false,
}: AccionFormBlockProps) {
  return (
    <SectionCard
      className={cn('accion-form-block', blockId)}
      data-accion-edit-protected={editProtected ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full min-h-11 touch-manipulation text-left transition-colors hover:bg-muted/15',
          expanded && 'border-b border-border/50'
        )}
        aria-expanded={expanded}
      >
        <SectionCardHeader
          className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
          eyebrow={`Paso ${step}`}
          title={title}
          subtitle={expanded ? subtitle : (collapsedSummary ?? subtitle)}
          icon={icon}
          action={
            <ChevronDown
              className={cn(
                'h-5 w-5 shrink-0 text-muted-foreground transition-transform sm:h-4 sm:w-4',
                expanded && 'rotate-180'
              )}
            />
          }
        />
      </button>
      {expanded ? (
        <SectionCardBody className="space-y-3 px-3 py-3 sm:space-y-4 sm:p-4 md:p-6">
          {children}
        </SectionCardBody>
      ) : null}
    </SectionCard>
  )
}
