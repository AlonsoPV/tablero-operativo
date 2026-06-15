import type { ReactNode } from 'react'
import { SettingsPageShell } from '@/components/layout/SettingsPageShell'
import type { SettingsPageWidth } from '@/components/layout/SettingsPageShell'

export function CatalogPageShell({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode
  className?: string
  width?: SettingsPageWidth
}) {
  return (
    <SettingsPageShell className={className} width={width}>
      {children}
    </SettingsPageShell>
  )
}
