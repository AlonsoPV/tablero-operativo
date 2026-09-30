import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionCard({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
        className
      )}
      {...props}
    >
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
        'flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2
            id={titleId}
            className="text-sm font-semibold leading-snug tracking-tight text-foreground sm:text-[15px]"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className="w-full min-w-0 shrink-0 sm:w-auto sm:max-w-[min(100%,28rem)]">
          {action}
        </div>
      ) : null}
    </div>
  )
}

export function SectionCardBody({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('p-4 sm:p-6', className)} {...props}>
      {children}
    </div>
  )
}
