import { cn } from '@/lib/utils'
import {
  settingsCol,
  settingsDialogContentClass,
  settingsDialogWideContentClass,
  settingsPageShellClass,
  settingsTableMinWidthClass,
  settingsTableSurfaceClass,
  type SettingsTableWidth,
} from '@/components/layout/settingsUi'

/** Contenedor estándar de páginas de catálogo (settings). */
export const catalogPageShellClass = settingsPageShellClass

export const catalogDialogContentClass = settingsDialogContentClass

export const catalogDialogWideContentClass = settingsDialogWideContentClass

export type CatalogTableWidth = SettingsTableWidth

export function catalogTableMinWidthClass(width: CatalogTableWidth = 'default') {
  return settingsTableMinWidthClass(width)
}

export const catalogCol = settingsCol

export function catalogTableSurfaceClass(minTableWidth: CatalogTableWidth = 'default') {
  return settingsTableSurfaceClass(minTableWidth)
}

/** @deprecated Use settingsFilterBarClass from settingsUi */
export const catalogFilterBarClass = cn(
  'flex flex-col gap-3 rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 sm:p-4'
)
