/**
 * Encabezado premium del módulo Kanban — estilo SaaS/producto moderno.
 * Título fuerte, subtítulo secundario, acciones rápidas a la derecha.
 */

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Download, LayoutGrid, SlidersHorizontal, List, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KanbanViewMode = 'kanban' | 'lista'

export interface KanbanHeaderProps {
  /** Si el toolbar de filtros está expandido (para alternar desde "Filtros") */
  filtersExpanded?: boolean
  onToggleFilters?: () => void
  onNewAction?: () => void
  /** Vista actual: Kanban (tablero) o Lista */
  viewMode?: KanbanViewMode
  onViewModeChange?: (mode: KanbanViewMode) => void
  /** Nodo opcional a la derecha del título (ej. resumen o countdown) */
  rightOfTitle?: React.ReactNode
  className?: string
}

const VIEW_LABELS: Record<KanbanViewMode, string> = {
  kanban: 'Tablero Kanban',
  lista: 'Lista',
}

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
        'kanban-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="kanban-header-title-area space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 id="kanban-title" className="kanban-title text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Kanban
          </h1>
          {rightOfTitle}
        </div>
        <p className="kanban-subtitle text-sm text-muted-foreground max-w-xl">
          {viewMode === 'kanban'
            ? 'Gestiona tus acciones por estado. Arrastra las tarjetas entre columnas para actualizar el progreso.'
            : 'Vista en lista. Haz clic en una fila para editar la acción.'}
        </p>
      </div>
      <div className="kanban-header-actions flex flex-wrap items-center gap-2">
        {onNewAction && (
          <Button id="kanban-btn-new-action" className="kanban-btn-new-action shadow-sm" onClick={onNewAction} size="sm">
            <Plus className="h-4 w-4" />
            Nueva acción
          </Button>
        )}
        <Button id="kanban-btn-export" className="kanban-btn-export h-8 border-border/60 bg-background/80" variant="outline" size="sm">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id="kanban-btn-view"
              className="kanban-btn-view h-8 min-w-[90px] justify-between gap-1.5 border-border/60 bg-background/80"
              variant="outline"
              size="sm"
            >
              {viewMode === 'kanban' ? (
                <LayoutGrid className="h-3.5 w-3.5" />
              ) : (
                <List className="h-3.5 w-3.5" />
              )}
              Vista
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
              {viewMode === 'kanban' && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewModeChange?.('lista')}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <List className="h-4 w-4" />
                {VIEW_LABELS.lista}
              </span>
              {viewMode === 'lista' && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onToggleFilters && (
          <Button
            id="kanban-btn-filters"
            className="kanban-btn-filters h-8 border-border/60 bg-background/80"
            variant={filtersExpanded ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleFilters}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
          </Button>
        )}
      </div>
    </header>
  )
}
