/**
 * Encabezado del módulo Kanban — jerarquía clara y layout responsivo.
 */

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, LayoutGrid, SlidersHorizontal, List, Check, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KanbanMineToggle } from './KanbanMineToggle'

export type KanbanViewMode = 'kanban' | 'lista'

export interface KanbanHeaderProps {
  filtersExpanded?: boolean
  onToggleFilters?: () => void
  /** Muestra indicador cuando hay filtros aplicados (incl. responsable por defecto). */
  hasActiveFilters?: boolean
  /** Cantidad de filtros activos; si se pasa, el badge muestra el número. */
  activeFilterCount?: number
  onNewAction?: () => void
  onExportExcel?: () => void
  exportDisabled?: boolean
  exportLabel?: string
  mineActive?: boolean
  onToggleMine?: () => void
  mineDisabled?: boolean
  viewMode?: KanbanViewMode
  onViewModeChange?: (mode: KanbanViewMode) => void
  rightOfTitle?: React.ReactNode
  className?: string
}

const VIEW_LABELS: Record<KanbanViewMode, string> = {
  kanban: 'Tablero Kanban',
  lista: 'Lista',
}

const ACTION_BTN =
  'h-11 min-h-11 w-full min-w-0 justify-center gap-1.5 px-2 text-[11px] font-semibold leading-tight shadow-sm sm:h-10 sm:min-h-10 sm:w-auto sm:min-w-[6rem] sm:gap-2 sm:px-4 sm:text-sm'

const SECONDARY_ACTION_BTN =
  'border-2 border-border bg-card font-semibold text-foreground shadow-sm hover:bg-muted/60 hover:text-foreground'

const PRIMARY_ACTION_BTN =
  'flex-col gap-0.5 sm:flex-row sm:gap-2 shadow-md ring-2 ring-primary/25'

export function KanbanHeader({
  filtersExpanded,
  onToggleFilters,
  hasActiveFilters = false,
  activeFilterCount,
  onNewAction,
  onExportExcel,
  exportDisabled = false,
  exportLabel = 'Exportar Excel',
  mineActive = false,
  onToggleMine,
  mineDisabled = false,
  viewMode = 'kanban',
  onViewModeChange,
  rightOfTitle,
  className,
}: KanbanHeaderProps) {
  const filterCount = activeFilterCount ?? (hasActiveFilters ? 1 : 0)
  const filtersActive = filterCount > 0

  return (
    <header
      id="kanban-header"
      className={cn('kanban-header flex min-w-0 flex-col gap-2.5', className)}
    >
      <div className="kanban-header-title-area min-w-0 space-y-2.5">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] md:items-center md:gap-x-4 lg:gap-x-5">
          <h1
            id="kanban-title"
            className="kanban-title text-xl font-semibold tracking-tight text-foreground md:pt-0.5 md:text-2xl"
          >
            Kanban
          </h1>
          {rightOfTitle ? (
            <div className="kanban-header-right-slot col-span-2 min-w-0 w-full md:col-span-1 md:max-w-none lg:max-w-md">
              {rightOfTitle}
            </div>
          ) : (
            <div className="hidden min-w-0 md:block" aria-hidden />
          )}
          <div className="col-start-2 row-start-1 ml-auto flex shrink-0 items-center justify-end gap-2 md:col-start-3">
            {onExportExcel ? (
              <Button
                id="kanban-btn-export-excel"
                className={cn('kanban-btn-export-excel', ACTION_BTN, SECONDARY_ACTION_BTN, 'w-auto')}
                variant="outline"
                size="sm"
                onClick={onExportExcel}
                disabled={exportDisabled}
                title={exportLabel}
                aria-label={exportLabel}
              >
                <Download className="h-4 w-4 shrink-0 stroke-[2.25]" />
                <span className="truncate">Excel</span>
              </Button>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="kanban-btn-view"
                  className={cn(
                    'kanban-btn-view',
                    ACTION_BTN,
                    SECONDARY_ACTION_BTN,
                    'w-auto'
                  )}
                  variant="outline"
                  size="sm"
                >
                  {viewMode === 'kanban' ? (
                    <LayoutGrid className="h-4 w-4 shrink-0 stroke-[2.25]" />
                  ) : (
                    <List className="h-4 w-4 shrink-0 stroke-[2.25]" />
                  )}
                  <span className="truncate">Vista</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem
                  onClick={() => onViewModeChange?.('kanban')}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    {VIEW_LABELS.kanban}
                  </span>
                  {viewMode === 'kanban' ? <Check className="h-4 w-4 text-primary" /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onViewModeChange?.('lista')}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    {VIEW_LABELS.lista}
                  </span>
                  {viewMode === 'lista' ? <Check className="h-4 w-4 text-primary" /> : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className="kanban-subtitle max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {viewMode === 'kanban'
            ? 'Gestiona acciones por estado. Arrastra tarjetas entre columnas.'
            : 'Vista en lista. Toca una fila para editar la acción.'}
        </p>

        <div
          className={cn(
            'kanban-header-actions grid w-full min-w-0 grid-cols-2 gap-2 rounded-xl border border-border/70 bg-muted/25 p-2 shadow-sm ring-1 ring-border/30 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:p-3'
          )}
        >
          {onNewAction ? (
            <Button
              id="kanban-btn-new-action"
              variant="default"
              className={cn('kanban-btn-new-action', ACTION_BTN, PRIMARY_ACTION_BTN)}
              onClick={onNewAction}
              size="sm"
            >
              <Plus className="h-4 w-4 shrink-0 stroke-[2.5] sm:h-4 sm:w-4" />
              <span className="truncate sm:hidden">Nueva</span>
              <span className="hidden truncate sm:inline">Nueva acción</span>
            </Button>
          ) : null}

          {onToggleFilters ? (
            <Button
              id="kanban-btn-filters"
              className={cn(
                'kanban-btn-filters gap-2',
                ACTION_BTN,
                SECONDARY_ACTION_BTN,
                filtersExpanded && 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20',
                filtersActive &&
                  !filtersExpanded &&
                  'border-primary/50 bg-primary/5 text-primary ring-2 ring-primary/15'
              )}
              variant={filtersExpanded ? 'secondary' : 'outline'}
              size="sm"
              onClick={onToggleFilters}
              aria-expanded={filtersExpanded}
              aria-label={
                filtersActive
                  ? `Filtros, ${filterCount} activo${filterCount === 1 ? '' : 's'}`
                  : 'Filtros'
              }
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0 stroke-[2.25]" aria-hidden />
              <span className="truncate">Filtros</span>
              {filtersActive ? (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums leading-none text-primary-foreground"
                  aria-hidden
                >
                  {filterCount}
                </span>
              ) : null}
            </Button>
          ) : null}

          {onToggleMine ? (
            <KanbanMineToggle
              active={mineActive}
              disabled={mineDisabled}
              onClick={onToggleMine}
            />
          ) : null}

        </div>
      </div>
    </header>
  )
}
