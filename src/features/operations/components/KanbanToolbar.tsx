/**
 * Barra de filtros tipo toolbar — compacta, elegante, estilo SaaS.
 * Búsqueda destacada, selects compactos, limpiar filtros.
 */

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AccionesFilter } from '@/services/acciones.service'
import type { ActionStatus, PrioridadNc } from '@/types'
import { ACTION_STATUS } from '@/types'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ESTADO_LABELS: Record<string, string> = {
  Pendiente: 'Pendiente',
  Hoy: 'Hoy',
  En_Ejecucion: 'En ejecución',
  Bloqueado: 'Bloqueado',
  Retraso: 'Retraso',
  Hecho: 'Hecho',
  Verificado: 'Verificado',
}

const ESTADO_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Estado' },
  ...ACTION_STATUS.map((s) => ({ value: s, label: ESTADO_LABELS[s] ?? s })),
]

const PRIORIDAD_OPTIONS = [
  { value: 'all', label: 'Prioridad' },
  { value: 'P1_Critica', label: 'Crítica' },
  { value: 'P2_Media', label: 'Media' },
  { value: 'P3_Baja', label: 'Baja' },
]

export interface KanbanToolbarProps {
  filter: AccionesFilter
  /** Puede recibir el filtro completo o solo los campos que cambian (merge con estado actual). */
  onFilterChange: (f: AccionesFilter | Partial<AccionesFilter>) => void
  onClear: () => void
  /** Ocultar completamente (ej. cuando filtros colapsados) */
  visible?: boolean
  className?: string
}

export function KanbanToolbar({
  filter,
  onFilterChange,
  onClear,
  visible = true,
  className,
}: KanbanToolbarProps) {
  const { data: users = [] } = useUsers({ activo: true })
  const { data: areas = [] } = useAreas({ activo: true })

  const hasFilters =
    (filter.search != null && filter.search !== '') ||
    filter.fecha_creacion != null ||
    filter.estado != null ||
    filter.prioridad != null ||
    (filter.area != null && filter.area !== '') ||
    filter.responsable != null

  const estadoValue = Array.isArray(filter.estado)
    ? (filter.estado[0] ?? 'all')
    : (filter.estado ?? 'all')
  const prioridadValue = Array.isArray(filter.prioridad)
    ? (filter.prioridad[0] ?? 'all')
    : (filter.prioridad ?? 'all')

  if (!visible) return null

  return (
    <div
      className={cn(
        'kanban-toolbar flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 backdrop-blur-sm',
        'transition-opacity duration-200',
        className
      )}
    >
      <div className="kanban-toolbar-search-wrap relative flex-1 min-w-[140px] max-w-[240px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          id="kanban-filter-search"
          className="kanban-toolbar-search h-8 rounded-lg border-border/60 bg-background/80 pl-9 text-sm focus-visible:ring-2"
          type="search"
          placeholder="Buscar acciones..."
          value={filter.search ?? ''}
          onChange={(e) =>
            onFilterChange({ search: e.target.value || undefined })
          }
        />
      </div>
      <Input
        id="kanban-filter-fecha"
        className="kanban-toolbar-fecha h-8 w-[130px] rounded-lg border-border/60 bg-background/80 text-sm"
        type="date"
        value={filter.fecha_creacion ?? ''}
        onChange={(e) =>
          onFilterChange({ fecha_creacion: e.target.value || undefined })
        }
        title="Ver acciones creadas hasta este día"
      />
      <Select
        value={estadoValue}
        onValueChange={(v) =>
          onFilterChange({ estado: v === 'all' ? undefined : (v as ActionStatus) })
        }
      >
        <SelectTrigger id="kanban-filter-estado" className="kanban-toolbar-estado h-8 w-[130px] rounded-lg border-border/60 bg-background/80 text-sm">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          {ESTADO_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={prioridadValue}
        onValueChange={(v) =>
          onFilterChange({ prioridad: v === 'all' ? undefined : (v as PrioridadNc) })
        }
      >
        <SelectTrigger id="kanban-filter-prioridad" className="kanban-toolbar-prioridad h-8 w-[110px] rounded-lg border-border/60 bg-background/80 text-sm">
          <SelectValue placeholder="Prioridad" />
        </SelectTrigger>
        <SelectContent>
          {PRIORIDAD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.area ?? 'all'}
        onValueChange={(v) =>
          onFilterChange({ area: v === 'all' ? undefined : v })}
      >
        <SelectTrigger id="kanban-filter-area" className="kanban-toolbar-area h-8 w-[120px] rounded-lg border-border/60 bg-background/80 text-sm">
          <SelectValue placeholder="Área" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las áreas</SelectItem>
          {areas.map((a) => (
            <SelectItem key={a.id} value={a.nombre}>
              {a.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.responsable ?? 'all'}
        onValueChange={(v) =>
          onFilterChange({ responsable: v === 'all' ? undefined : v })
        }
      >
        <SelectTrigger id="kanban-filter-responsable" className="kanban-toolbar-responsable h-8 w-[140px] rounded-lg border-border/60 bg-background/80 text-sm">
          <SelectValue placeholder="Responsable" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button
          id="kanban-toolbar-clear"
          className="kanban-toolbar-clear h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
