import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CatalogFilter } from '../types/catalogs.types'
import { Search, X } from 'lucide-react'

const ACTIVO_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'true', label: 'Activos' },
  { value: 'false', label: 'Inactivos' },
] as const

export interface CatalogFilterBarProps {
  filter: CatalogFilter
  onFilterChange: (f: CatalogFilter) => void
  onClear: () => void
  /** Placeholder del buscador */
  searchPlaceholder?: string
  /** Etiqueta del select de estatus (por defecto "Estatus") */
  activoLabel?: string
  /** Si true, no se muestra el select activo (solo búsqueda) */
  hideActivoFilter?: boolean
}

export function CatalogFilterBar({
  filter,
  onFilterChange,
  onClear,
  searchPlaceholder = 'Nombre o descripción...',
  activoLabel = 'Estatus',
  hideActivoFilter = false,
}: CatalogFilterBarProps) {
  const hasFilters =
    (filter.search != null && filter.search !== '') || filter.activo != null

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
      <div className="min-w-[200px] flex-1 space-y-2">
        <Label htmlFor="catalog-search">Buscar</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="catalog-search"
            placeholder={searchPlaceholder}
            value={filter.search ?? ''}
            onChange={(e) =>
              onFilterChange({ ...filter, search: e.target.value || undefined })
            }
            className="pl-9"
            aria-label="Buscar"
          />
        </div>
      </div>
      {!hideActivoFilter && (
        <div className="w-[140px] space-y-2">
          <Label htmlFor="catalog-activo">{activoLabel}</Label>
          <Select
            value={
              filter.activo === undefined ? 'all' : filter.activo ? 'true' : 'false'
            }
            onValueChange={(v) =>
              onFilterChange({
                ...filter,
                activo: v === 'all' ? undefined : v === 'true',
              })
            }
          >
            <SelectTrigger id="catalog-activo">
              <SelectValue placeholder={activoLabel} />
            </SelectTrigger>
            <SelectContent>
              {ACTIVO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          aria-label="Limpiar filtros"
        >
          <X className="mr-1 h-4 w-4" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
