import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Area } from '@/features/catalogs/types/catalogs.types'
import { ACTION_STATUS, type ActionStatus } from '@/types'
import type { CalendarFilters } from '@/features/calendar'
import { cn } from '@/lib/utils'

export interface CalendarFiltersBarProps {
  filters: CalendarFilters
  onFiltersChange: (next: CalendarFilters) => void
  areas: Area[]
  users: { id: string; nombre: string }[]
  expanded: boolean
  onToggleExpanded: () => void
  hasActiveFilters: boolean
}

export function CalendarFiltersBar({
  filters,
  onFiltersChange,
  areas,
  users,
  expanded,
  onToggleExpanded,
  hasActiveFilters,
}: CalendarFiltersBarProps) {
  return (
    <div id="calendar-filters" className="calendar-filters border-b border-border/60 bg-muted/10 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Filtros</p>
            <p className="hidden text-xs text-muted-foreground sm:block">Vista mensual</p>
          </div>
          {hasActiveFilters ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Activos
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden h-8 text-xs sm:inline-flex"
              onClick={() => onFiltersChange({})}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Limpiar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs md:hidden"
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? 'Ocultar' : 'Mostrar'}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'mt-0 grid transition-[grid-template-rows] duration-200 md:mt-3 md:grid-rows-[1fr]',
          expanded ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr] md:grid-rows-[1fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:flex lg:flex-wrap lg:items-end lg:justify-end">
            <div className="space-y-1">
              <Label className="text-[10px] sm:text-xs">Mostrar</Label>
              <Select
                value={filters.itemType ?? 'todos'}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, itemType: value as CalendarFilters['itemType'] })
                }
              >
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="acciones">Acciones</SelectItem>
                  <SelectItem value="recordatorios">Recordatorios</SelectItem>
                  <SelectItem value="minutas">Minutas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] sm:text-xs">Área</Label>
              <Select
                value={filters.area ?? 'all'}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, area: value === 'all' ? undefined : value })
                }
              >
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.nombre}>
                      {area.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] sm:text-xs">Responsable</Label>
              <Select
                value={filters.responsable ?? 'all'}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, responsable: value === 'all' ? undefined : value })
                }
              >
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] sm:text-xs">Estado</Label>
              <Select
                value={filters.estado ?? 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    estado: value === 'all' ? undefined : (value as ActionStatus),
                  })
                }
              >
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {ACTION_STATUS.map((estado) => (
                    <SelectItem key={estado} value={estado}>
                      {estado}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="col-span-2 h-9 w-full sm:col-span-1 md:hidden"
                onClick={() => onFiltersChange({})}
              >
                <X className="h-4 w-4" aria-hidden />
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
