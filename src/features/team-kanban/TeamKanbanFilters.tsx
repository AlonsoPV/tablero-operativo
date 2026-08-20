import { Search, SlidersHorizontal, UserRoundCheck, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import type { TeamFilters, TeamState } from './types'

type TeamKanbanFiltersProps = {
  value: TeamFilters
  states: TeamState[]
  priorities: Priority[]
  currentUserId?: string
  onChange: (value: TeamFilters) => void
  onClear: () => void
}

export function TeamKanbanFilters({
  value,
  states,
  priorities,
  currentUserId,
  onChange,
  onClear,
}: TeamKanbanFiltersProps) {
  const count = [
    value.search,
    value.dateFrom,
    value.dateTo,
    value.priority !== 'all' ? 'x' : '',
    value.stateId !== 'all' ? 'x' : '',
    currentUserId && value.mine ? 'x' : '',
  ].filter(Boolean).length
  const field = 'h-9 min-w-0 rounded-md border-border/60 bg-background text-sm transition-[box-shadow,border-color,background-color]'
  const active = 'border-primary/55 bg-primary/[0.06] ring-2 ring-primary/15'

  const mineButton = (
    <Button
      type="button"
      variant={value.mine ? 'default' : 'outline'}
      size="sm"
      className={cn(
        'h-9 shrink-0 gap-1.5 font-semibold',
        value.mine
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'border-border/70 bg-background text-muted-foreground hover:text-foreground'
      )}
      onClick={() => onChange({ ...value, mine: !value.mine })}
      disabled={!currentUserId}
      aria-pressed={value.mine}
      aria-label={value.mine ? 'Quitar filtro Mias' : 'Mostrar mis acciones'}
      title={value.mine ? 'Quitar filtro Mias' : 'Mostrar acciones donde soy responsable o creador'}
    >
      <UserRoundCheck className="h-3.5 w-3.5" aria-hidden />
      Mias
    </Button>
  )

  return (
    <div
      className={cn(
        'kanban-toolbar flex min-w-0 flex-col gap-2 rounded-xl border bg-gradient-to-b from-card via-card to-muted/20 p-2.5 shadow-sm sm:p-3',
        count ? 'border-primary/25' : 'border-border/60'
      )}
    >
      <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_7.25rem_7.25rem_auto] lg:items-center">
        <div className="relative col-span-2 min-w-0 lg:col-span-1">
          <Search
            className={cn(
              'pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2',
              value.search ? 'text-primary' : 'text-muted-foreground'
            )}
            aria-hidden
          />
          <Input
            type="search"
            value={value.search}
            onChange={(event) => onChange({ ...value, search: event.target.value })}
            placeholder="Buscar acciones..."
            aria-label="Buscar acciones"
            className={cn(field, 'w-full pl-8', value.search && active)}
          />
        </div>
        <Input
          type="date"
          value={value.dateFrom}
          onChange={(event) => onChange({ ...value, dateFrom: event.target.value })}
          aria-label="Fecha limite desde"
          title="Desde"
          className={cn(field, value.dateFrom && active)}
        />
        <Input
          type="date"
          value={value.dateTo}
          onChange={(event) => onChange({ ...value, dateTo: event.target.value })}
          aria-label="Fecha limite hasta"
          title="Hasta"
          className={cn(field, value.dateTo && active)}
        />
        <div className="hidden items-center justify-end gap-1.5 lg:flex">
          {mineButton}
          {count ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 text-[11px] font-semibold text-primary">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {count} activo{count === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 text-[11px] text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Filtros
            </span>
          )}
          {count ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1 border-primary/25 bg-primary/5 text-primary"
              onClick={onClear}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Limpiar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 border-t border-border/40 pt-2 lg:grid-cols-[1fr_1fr_auto]">
        <Select value={value.stateId} onValueChange={(stateId) => onChange({ ...value, stateId })}>
          <SelectTrigger
            aria-label="Estado"
            className={cn(field, 'w-full', value.stateId !== 'all' && active)}
          >
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {states.map((state) => (
              <SelectItem key={state.id} value={state.id}>
                {state.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value.priority} onValueChange={(priority) => onChange({ ...value, priority })}>
          <SelectTrigger
            aria-label="Prioridad"
            className={cn(field, 'w-full', value.priority !== 'all' && active)}
          >
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las prioridades</SelectItem>
            {priorities.map((priority) => (
              <SelectItem key={priority.id} value={priority.nombre}>
                {priority.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="col-span-2 flex gap-2 lg:col-span-1 lg:hidden">
          {mineButton}
          {count ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 gap-1 border-primary/25 bg-primary/5 text-primary"
              onClick={onClear}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
