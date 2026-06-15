import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { settingsTableShellClass } from './settingsUi'

export function SettingsListSection({
  filter,
  toolbar,
  children,
  className,
}: {
  filter?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn(settingsTableShellClass, className)}>
      {filter ? (
        <div className="border-b border-border/50 bg-muted/15">{filter}</div>
      ) : null}
      {toolbar ? (
        <div className="border-b border-border/50 bg-muted/5 px-3 py-3 sm:px-4">{toolbar}</div>
      ) : null}
      <div className="min-w-0">{children}</div>
    </section>
  )
}
