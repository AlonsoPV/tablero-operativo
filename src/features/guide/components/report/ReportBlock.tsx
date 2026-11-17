import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ReportBlock({
  number,
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: {
  number: string
  title: string
  subtitle: string
  icon: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-4', className)} aria-label={title}>
      <header className="space-y-1 border-b border-slate-200/80 pb-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#172B59]/10 text-[#172B59]">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {number}
            </p>
            <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              {title}
            </h3>
            <p className="text-sm leading-6 text-slate-500">{subtitle}</p>
          </div>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
