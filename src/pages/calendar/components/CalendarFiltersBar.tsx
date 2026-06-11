import { X } from 'lucide-react'
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

export interface CalendarFiltersBarProps {
  filters: CalendarFilters
  onFiltersChange: (next: CalendarFilters) => void
  areas: Area[]
  users: { id: string; nombre: string }[]
  hasActiveFilters: boolean
}

export function CalendarFiltersBar({
  filters,
  onFiltersChange,
  areas,
  users,
  hasActiveFilters,
}: CalendarFiltersBarProps) {
  return (
    <div
      id="calendar-filters"
      className="calendar-filters rounded-xl border border-border/60 bg-muted/10 p-2.5 sm:p-3"
    >
      <div className="flex items-center justify-between gap-2 pb-2.5 sm:pb-3">
        <p className="text-xs font-semibold text-foreground sm:text-sm">Filtros</p>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onFiltersChange({})}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Limpiar
          </Button>
        ) : null}
      </div>

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

      </div>
    </div>
  )
}
