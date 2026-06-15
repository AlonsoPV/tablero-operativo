import { cn } from '@/lib/utils'

/** Contenedor estándar de páginas bajo /settings. */
export const settingsPageShellClass =
  'mx-auto min-w-0 w-full max-w-5xl space-y-5 overflow-x-hidden sm:space-y-6'

export const settingsPageShellNarrowClass = 'max-w-3xl'
export const settingsPageShellWideClass = 'max-w-6xl'

export const settingsFilterBarClass = cn(
  'grid gap-3 rounded-xl border border-border/60 bg-card/90 p-3 shadow-sm',
  'sm:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(8rem,auto))] sm:items-end sm:gap-3 sm:p-4'
)

export const settingsFilterBarEmbeddedClass = cn(
  'grid gap-3 p-3 sm:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(8rem,auto))] sm:items-end sm:gap-3 sm:p-4'
)

export const settingsDialogContentClass = cn(
  'max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6'
)

export const settingsDialogWideContentClass = cn(
  'max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto p-4 sm:p-6'
)

export type SettingsTableWidth = 'default' | 'wide'

export function settingsTableMinWidthClass(width: SettingsTableWidth = 'default') {
  if (width === 'wide') {
    return 'w-full min-w-[42rem] md:min-w-[52rem] xl:min-w-[64rem]'
  }
  return 'w-full min-w-[32rem] sm:min-w-[36rem] md:min-w-[40rem] lg:min-w-full'
}

/** Clases reutilizables en celdas/columnas de tablas en settings. */
export const settingsCol = {
  hideMobile: 'hidden sm:table-cell',
  hideTablet: 'hidden md:table-cell',
  numeric: 'text-right tabular-nums whitespace-nowrap',
  muted: 'text-muted-foreground',
  truncate: 'max-w-[9rem] truncate sm:max-w-[12rem] md:max-w-none',
  truncateWide: 'max-w-[10rem] sm:max-w-[14rem] md:max-w-[18rem] lg:max-w-none',
  actions: 'w-[3.25rem] px-1 sm:w-[4.5rem] sm:px-2',
} as const

export function settingsTableSurfaceClass(minTableWidth: SettingsTableWidth = 'default') {
  return cn(
    settingsTableMinWidthClass(minTableWidth),
    '[&_th]:h-10 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border/60 [&_th]:px-2.5 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground sm:[&_th]:h-11 sm:[&_th]:px-3 md:[&_th]:px-4',
    '[&_td]:border-b [&_td]:border-border/40 [&_td]:px-2.5 [&_td]:py-3 [&_td]:align-middle [&_td]:text-xs sm:[&_td]:px-3 sm:[&_td]:py-3.5 md:[&_td]:px-4 md:[&_td]:text-sm',
    '[&_tbody_tr:last-child_td]:border-b-0',
    '[&_thead]:bg-muted/35',
    '[&_tbody_tr]:transition-colors',
    '[&_tbody_tr:nth-child(even)]:bg-muted/10',
    '[&_tbody_tr:hover]:bg-muted/30',
    '[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-muted/95',
    '[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-card',
    '[&_tbody_tr:hover_td:first-child]:bg-muted/40',
    '[&_th:last-child]:sticky [&_th:last-child]:right-0 [&_th:last-child]:z-20 [&_th:last-child]:bg-muted/95',
    '[&_td:last-child]:sticky [&_td:last-child]:right-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-card',
    '[&_tbody_tr:hover_td:last-child]:bg-muted/40',
    '[&_td:first-child]:shadow-[4px_0_10px_-6px_rgba(0,0,0,0.12)]',
    '[&_td:last-child]:shadow-[-4px_0_10px_-6px_rgba(0,0,0,0.12)]',
    minTableWidth === 'default' &&
      'lg:[&_th:first-child]:static lg:[&_td:first-child]:static lg:[&_th:last-child]:static lg:[&_td:last-child]:static lg:[&_td:first-child]:shadow-none lg:[&_td:last-child]:shadow-none'
  )
}

export const settingsTableShellClass =
  'overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm ring-1 ring-black/[0.015]'

export const settingsTableShellEmbeddedClass = 'min-w-0'
