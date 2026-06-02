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
import { Plus, LayoutGrid, SlidersHorizontal, List, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KanbanViewMode = 'kanban' | 'lista'

export interface KanbanHeaderProps {
  filtersExpanded?: boolean
  onToggleFilters?: () => void
  onNewAction?: () => void
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
  'h-10 w-full justify-center gap-1.5 text-sm md:h-9 md:w-auto md:min-w-[5.25rem]'

export function KanbanHeader({
  filtersExpanded,
  onToggleFilters,
  onNewAction,
  viewMode = 'kanban',
  onViewModeChange,
  rightOfTitle,
  className,
}: KanbanHeaderProps) {
  return (
    <header
      id="kanban-header"
      className={cn(
        'kanban-header flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6',
        className
      )}
    >
      <div className="kanban-header-title-area min-w-0 flex-1 space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Operaciones
        </p>

        <div className="grid min-w-0 gap-2.5 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)] md:items-start md:gap-x-4 lg:gap-x-5">
          <h1
            id="kanban-title"
            className="kanban-title text-xl font-semibold tracking-tight text-foreground md:pt-0.5 md:text-2xl"
          >
            Kanban
          </h1>
          {rightOfTitle ? (
            <div className="kanban-header-right-slot min-w-0 w-full md:max-w-none lg:max-w-md">
              {rightOfTitle}
            </div>
          ) : null}
        </div>

        <p className="kanban-subtitle max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {viewMode === 'kanban'
            ? 'Gestiona acciones por estado. Arrastra tarjetas entre columnas.'
            : 'Vista en lista. Toca una fila para editar la acción.'}
        </p>
      </div>

      <div className="kanban-header-actions flex w-full min-w-0 shrink-0 flex-col gap-2 md:w-auto">
        {onNewAction ? (
          <Button
            id="kanban-btn-new-action"
            variant="default"
            className="kanban-btn-new-action h-11 w-full shadow-sm md:h-9 md:w-auto"
            onClick={onNewAction}
            size="sm"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Nueva acción
          </Button>
        ) : null}

        <div className="kanban-header-actions-secondary grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap md:items-center md:justify-end md:gap-2">
          {onToggleFilters ? (
            <Button
              id="kanban-btn-filters"
              className={cn(
                'kanban-btn-filters border-border/60 bg-background/80',
                ACTION_BTN,
                filtersExpanded && 'border-primary/40 bg-primary/5 text-primary'
              )}
              variant={filtersExpanded ? 'secondary' : 'outline'}
              size="sm"
              onClick={onToggleFilters}
              aria-expanded={filtersExpanded}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Filtros</span>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="kanban-btn-view"
                className={cn('kanban-btn-view border-border/60 bg-background/80', ACTION_BTN)}
                variant="outline"
                size="sm"
              >
                {viewMode === 'kanban' ? (
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <List className="h-3.5 w-3.5 shrink-0" />
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
    </header>
  )
}
