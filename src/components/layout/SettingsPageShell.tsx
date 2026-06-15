import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  settingsPageShellClass,
  settingsPageShellNarrowClass,
  settingsPageShellWideClass,
} from './settingsUi'

export type SettingsPageWidth = 'default' | 'narrow' | 'wide'

export function SettingsPageShell({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode
  className?: string
  width?: SettingsPageWidth
}) {
  return (
    <div
      className={cn(
        settingsPageShellClass,
        width === 'narrow' && settingsPageShellNarrowClass,
        width === 'wide' && settingsPageShellWideClass,
        className
      )}
    >
      {children}
    </div>
  )
}
