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
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Dashboard Ejecutivo
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Resumen del día, control de acciones y semáforo KPI. Toma decisiones con claridad.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onNewAction && (
          <Button onClick={onNewAction} size="sm" className="shadow-sm">
            <Plus className="h-4 w-4" />
            Crear acción
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 border-border/60 bg-background/80">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-border/60 bg-background/80"
          asChild
        >
          <Link to={ROUTES.KANBAN}>
            <LayoutGrid className="h-3.5 w-3.5" />
            Ir a Kanban
          </Link>
        </Button>
        {onToggleFilters && (
          <Button
            variant={filtersExpanded ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleFilters}
            className="h-8 border-border/60 bg-background/80"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
          </Button>
        )}
      </div>
    </header>
  )
}
