import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  settingsTableShellClass,
  settingsTableShellEmbeddedClass,
  settingsTableSurfaceClass,
  type SettingsTableWidth,
} from './settingsUi'

export interface SettingsTableLayoutProps {
  isLoading?: boolean
  error?: Error | null
  emptyTitle?: string
  emptyDescription?: string
  itemCount?: number
  minTableWidth?: SettingsTableWidth
  embedded?: boolean
  children: ReactNode
  emptyState?: ReactNode
}

export function SettingsTableLayout({
  isLoading = false,
  error = null,
  emptyTitle = 'No hay registros',
  emptyDescription = 'Ajusta los filtros o crea el primer registro.',
  itemCount = 0,
  minTableWidth = 'default',
  embedded = false,
  children,
  emptyState,
}: SettingsTableLayoutProps) {
  const shellClass = embedded ? settingsTableShellEmbeddedClass : settingsTableShellClass

  if (error) {
    return (
      <div
        className={cn(
          shellClass,
          'border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive',
          !embedded && 'rounded-xl border'
        )}
        role="alert"
      >
        {error.message}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          shellClass,
          'flex h-56 items-center justify-center bg-card text-sm text-muted-foreground sm:h-64',
          !embedded && 'rounded-xl border'
        )}
        aria-busy="true"
        aria-live="polite"
      >
        Cargando...
      </div>
    )
  }

  if (itemCount === 0) {
    if (emptyState) return <>{emptyState}</>
    return (
      <div
        className={cn(
          shellClass,
          'flex flex-col items-center justify-center gap-2 bg-card px-4 py-14 text-center sm:py-16',
          !embedded && 'rounded-xl border'
        )}
      >
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className={cn(shellClass, !embedded && 'overflow-hidden')}>
      <div
        className="overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:thin] md:[scrollbar-width:auto] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
        role="region"
        aria-label="Tabla de datos"
        tabIndex={0}
      >
        <table className={cn('w-full caption-bottom text-sm', settingsTableSurfaceClass(minTableWidth))}>
          {children}
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground md:hidden">
        <span>
          {itemCount} registro{itemCount === 1 ? '' : 's'}
        </span>
        <span className="text-right">Desliza ↔ para más columnas</span>
      </div>
    </div>
  )
}
