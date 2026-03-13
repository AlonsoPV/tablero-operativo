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

const ESTADO_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Estado' },
  ...ACTION_STATUS.map((s) => ({ value: s, label: s })),
]

const PRIORIDAD_OPTIONS = [
  { value: 'all', label: 'Prioridad' },
  { value: 'P1_Critica', label: 'Crítica' },
  { value: 'P2_Media', label: 'Media' },
  { value: 'P3_Baja', label: 'Baja' },
]

export interface KanbanToolbarProps {
  filter: AccionesFilter
  onFilterChange: (f: AccionesFilter) => void
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
        'flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 backdrop-blur-sm',
        'transition-opacity duration-200',
        className
      )}
    >
      <div className="relative flex-1 min-w-[140px] max-w-[240px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar acciones..."
          value={filter.search ?? ''}
          onChange={(e) =>
            onFilterChange({ ...filter, search: e.target.value || undefined })
          }
          className="h-8 rounded-lg border-border/60 bg-background/80 pl-9 text-sm focus-visible:ring-2"
        />
      </div>
      <Input
        type="date"
        value={filter.fecha ?? ''}
        onChange={(e) =>
          onFilterChange({ ...filter, fecha: e.target.value || undefined })
        }
        className="h-8 w-[130px] rounded-lg border-border/60 bg-background/80 text-sm"
      />
      <Select
        value={estadoValue}
        onValueChange={(v) =>
          onFilterChange({
            ...filter,
            estado: v === 'all' ? undefined : (v as ActionStatus),
          })
        }
      >
        <SelectTrigger className="h-8 w-[130px] rounded-lg border-border/60 bg-background/80 text-sm">
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
          onFilterChange({
            ...filter,
            prioridad: v === 'all' ? undefined : (v as PrioridadNc),
          })
        }
      >
        <SelectTrigger className="h-8 w-[110px] rounded-lg border-border/60 bg-background/80 text-sm">
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
          onFilterChange({ ...filter, area: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-[120px] rounded-lg border-border/60 bg-background/80 text-sm">
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
          onFilterChange({
            ...filter,
            responsable: v === 'all' ? undefined : v,
          })
        }
      >
        <SelectTrigger className="h-8 w-[140px] rounded-lg border-border/60 bg-background/80 text-sm">
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
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
