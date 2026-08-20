/**
 * Centro de control — cabecera del dashboard: título y alcance temporal/filtros.
 */

import type { ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DashboardHeaderProps {
  filtersExpanded?: boolean
  /** Hay filtros activos (búsqueda, fechas, estado, etc.). */
  advancedFiltersActive?: boolean
  title?: string
  eyebrow?: string
  onToggleFilters?: () => void
  /** Panel de filtros (se muestra al expandir). */
  filtersPanel?: ReactNode
  className?: string
}

export function DashboardHeader({
  filtersExpanded,
  advancedFiltersActive,
  title = 'Salud operativa',
  eyebrow = 'Tablero ejecutivo',
  onToggleFilters,
  filtersPanel,
  className,
}: DashboardHeaderProps) {
  return (
    <header
      id="dashboard-header"
      className={cn('dashboard-header min-w-0 space-y-4', className)}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="dashboard-header-title-area min-w-0 max-w-2xl space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
          <h1
            id="dashboard-title"
            className="dashboard-title text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            {title}
          </h1>
          <p className="dashboard-subtitle text-pretty text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Prioridades, atrasos y confiabilidad del trabajo abierto, según el alcance que elijas.
          </p>
        </div>

        {onToggleFilters ? (
          <button
            id="dashboard-btn-filters"
            type="button"
            onClick={onToggleFilters}
            aria-expanded={filtersExpanded}
            aria-controls="dashboard-toolbar"
            className={cn(
              'dashboard-btn-filters group flex h-12 w-full shrink-0 items-center gap-3 rounded-xl border-2 px-3.5 text-left shadow-sm transition-all sm:w-auto sm:min-w-[14rem]',
              filtersExpanded
                ? 'border-foreground bg-foreground text-background shadow-md'
                : advancedFiltersActive
                  ? 'border-amber-600 bg-amber-500 text-amber-950 hover:bg-amber-400'
                  : 'border-foreground/15 bg-foreground text-background hover:bg-foreground/90 hover:shadow-md'
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                filtersExpanded || !advancedFiltersActive
                  ? 'bg-background/15 text-background'
                  : 'bg-amber-950/15 text-amber-950'
              )}
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-none tracking-tight">
                {filtersExpanded ? 'Ocultar filtros' : 'Ajustar alcance'}
              </span>
              <span
                className={cn(
                  'mt-1 block text-[11px] font-medium leading-none',
                  filtersExpanded || !advancedFiltersActive
                    ? 'text-background/75'
                    : 'text-amber-950/75'
                )}
              >
                {advancedFiltersActive ? 'Filtros activos' : 'Área, fecha y más'}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200',
                filtersExpanded ? 'rotate-180 text-background/85' : 'text-background/80',
                advancedFiltersActive && !filtersExpanded && 'text-amber-950/80'
              )}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {filtersExpanded && filtersPanel ? (
        <div
          id="dashboard-toolbar"
          className="dashboard-toolbar-wrapper relative z-10 overflow-visible rounded-xl border border-border/50 bg-background/70 p-3 sm:p-4"
          role="region"
          aria-label="Filtros del tablero"
        >
          {filtersPanel}
        </div>
      ) : null}
    </header>
  )
}
