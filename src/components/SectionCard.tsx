import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm', className)}>
      {children}
    </div>
  )
}

export function SectionCardHeader({
  eyebrow,
  title,
  titleId,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  /** Para `aria-labelledby` en la sección contenedora. */
  titleId?: string
  subtitle?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-border/50 px-5 py-4 sm:px-6',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
          ) : null}
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function SectionCardBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('p-5 sm:p-6', className)}>{children}</div>
}
