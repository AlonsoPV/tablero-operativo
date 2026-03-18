/**
 * Encabezado premium del Dashboard Ejecutivo — estilo Stripe/Linear.
 */

import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Download,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants'

export interface DashboardHeaderProps {
  filtersExpanded?: boolean
  onToggleFilters?: () => void
  onNewAction?: () => void
  className?: string
}

export function DashboardHeader({
  filtersExpanded,
  onToggleFilters,
  onNewAction,
  className,
}: DashboardHeaderProps) {
  return (
    <header
      id="dashboard-header"
      className={cn(
        'dashboard-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="dashboard-header-title-area space-y-1">
        <h1 id="dashboard-title" className="dashboard-title text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Dashboard Ejecutivo
        </h1>
        <p className="dashboard-subtitle text-sm text-muted-foreground max-w-xl">
          Resumen del día, control de acciones y semáforo KPI. Toma decisiones con claridad.
        </p>
      </div>
      <div className="dashboard-header-actions flex flex-wrap items-center gap-2">
        {onNewAction && (
          <Button id="dashboard-btn-new-action" className="dashboard-btn-new-action shadow-sm" onClick={onNewAction} size="sm">
            <Plus className="h-4 w-4" />
            Crear acción
          </Button>
        )}
        <Button id="dashboard-btn-export" className="dashboard-btn-export h-8 border-border/60 bg-background/80" variant="outline" size="sm">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
        <Button
          id="dashboard-btn-kanban"
          className="dashboard-btn-kanban h-8 border-border/60 bg-background/80"
          variant="outline"
          size="sm"
          asChild
        >
          <Link to={ROUTES.KANBAN}>
            <LayoutGrid className="h-3.5 w-3.5" />
            Ir a Kanban
          </Link>
        </Button>
        {onToggleFilters && (
          <Button
            id="dashboard-btn-filters"
            className="dashboard-btn-filters h-8 border-border/60 bg-background/80"
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
