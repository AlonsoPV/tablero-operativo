/**
 * Barra de filtros tipo toolbar — compacta, elegante, estilo SaaS.
 * Búsqueda, fecha, presets (vista dashboard) y selects avanzados.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { AccionesFilter } from '@/services/acciones.service'
import type { ActionStatus } from '@/types'
import type { Status } from '@/features/catalogs/types/catalogs.types'
import { ACTION_STATUS } from '@/types'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import { priorityDisplayLabel } from '../utils/priorityLabels'
import { activeEstadoFilterOptions } from '../utils/statusCatalog'
import { Label } from '@/components/ui/label'
import { Check, ChevronDown, Search, X, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KanbanDateRangeFilter } from './KanbanDateRangeFilter'
import { KanbanFilterPopover } from './KanbanFilterPopover'

const FILTER_FIELD_ACTIVE =
  'border-primary/55 bg-primary/[0.06] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.1)] ring-2 ring-primary/15'

const FILTER_LABEL_ACTIVE = 'font-semibold text-primary'

function KanbanToolbarField({
  label,
  htmlFor,
  children,
  className,
  active = false,
  compact = false,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
  className?: string
  active?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'kanban-toolbar-field flex min-w-0 flex-col',
        compact ? 'gap-0.5' : 'gap-1',
        active && 'kanban-toolbar-field--active',
        className
      )}
    >
      <Label
        htmlFor={htmlFor}
        className={cn(
          'flex items-center gap-1.5 font-medium text-muted-foreground',
          compact ? 'sr-only' : 'text-[11px]',
          !compact && active && FILTER_LABEL_ACTIVE
        )}
      >
        {active && !compact ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.25)]"
            aria-hidden
          />
        ) : null}
        {label}
        {active ? <span className="sr-only"> (filtro activo)</span> : null}
      </Label>
      {children}
    </div>
  )
}

const ALL_FILTER_VALUE = 'all'

const DASHBOARD_FILTER_FIELD =
  'h-11 min-h-11 w-full min-w-0 rounded-lg border-2 border-border bg-card text-[11px] font-medium shadow-sm sm:h-10 sm:min-h-10 sm:text-sm'

const DASHBOARD_FILTER_FIELD_ACTIVE =
  'border-primary/50 bg-primary/5 ring-2 ring-primary/15'

const DEFAULT_FILTER_INPUT_CLASS =
  'h-9 min-w-0 rounded-md border-border/60 bg-background text-sm transition-[box-shadow,border-color,background-color]'

const DEFAULT_FILTER_SELECT_CLASS =
  'h-9 min-h-9 min-w-0 w-full rounded-md border-border/60 bg-background px-2.5 py-0 text-sm transition-[box-shadow,border-color,background-color] [&>span]:line-clamp-1 [&>span]:truncate [&>span]:text-left'

const KANBAN_FILTER_DROPDOWN_PANEL =
  'overflow-hidden rounded-lg border border-border bg-popover shadow-lg'

const KANBAN_FILTER_DROPDOWN_LIST = 'max-h-[min(17rem,68dvh)] overflow-y-auto p-1'

function normalizeEstadoFilter(estado: AccionesFilter['estado']): ActionStatus[] {
  if (estado == null) return []
  return Array.isArray(estado) ? [...estado] : [estado]
}

function EstadoMultiSelect({
  id,
  options,
  value,
  onChange,
  triggerClassName,
  active,
}: {
  id: string
  options: { value: string; label: string }[]
  value: ActionStatus[]
  onChange: (next: ActionStatus[] | undefined) => void
  triggerClassName: string
  active: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const statusOptions = options.filter((option) => option.value !== ALL_FILTER_VALUE)
  const selectedLabels = statusOptions
    .filter((option) => value.includes(option.value as ActionStatus))
    .map((option) => option.label)

  const triggerLabel =
    selectedLabels.length === 0
      ? 'Estado'
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} estados`

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = (status: ActionStatus) => {
    const next = value.includes(status)
      ? value.filter((item) => item !== status)
      : [...value, status]
    onChange(next.length > 0 ? next : undefined)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={cn(
          'kanban-toolbar-estado flex w-full items-center justify-between gap-2 px-3 text-left',
          triggerClassName,
          active && 'text-foreground'
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50', open && 'rotate-180')} aria-hidden />
      </button>

      <KanbanFilterPopover
        ref={panelRef}
        open={open}
        triggerRef={triggerRef}
        className={KANBAN_FILTER_DROPDOWN_PANEL}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Estados"
      >
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Selecciona uno o más</p>
            {value.length > 0 ? (
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                onClick={() => onChange(undefined)}
              >
                Limpiar
              </button>
            ) : null}
          </div>
          <ul className={KANBAN_FILTER_DROPDOWN_LIST}>
            {statusOptions.map((option) => {
              const checked = value.includes(option.value as ActionStatus)
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      checked ? 'bg-primary/10' : 'hover:bg-muted/60'
                    )}
                    onClick={() => toggle(option.value as ActionStatus)}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background'
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-normal leading-snug">{option.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
      </KanbanFilterPopover>
    </div>
  )
}

function KanbanSingleSelect({
  id,
  options,
  value,
  onChange,
  triggerClassName,
  active,
  placeholder,
  allValue = ALL_FILTER_VALUE,
  panelHint = 'Selecciona una opción',
  ariaLabel,
}: {
  id: string
  options: { value: string; label: string }[]
  value: string
  onChange: (next: string | undefined) => void
  triggerClassName: string
  active: boolean
  placeholder: string
  allValue?: string
  panelHint?: string
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.value === value)
  const triggerLabel = kanbanFilterTriggerLabel(value, placeholder, selectedOption?.label, allValue)
  const isFiltered = value !== allValue

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selectValue = (nextValue: string) => {
    onChange(nextValue === allValue ? undefined : nextValue)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={cn(
          'kanban-toolbar-select flex w-full items-center justify-between gap-2 px-3 text-left',
          triggerClassName,
          active && 'text-foreground'
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50', open && 'rotate-180')} aria-hidden />
      </button>

      <KanbanFilterPopover
        ref={panelRef}
        open={open}
        triggerRef={triggerRef}
        className={KANBAN_FILTER_DROPDOWN_PANEL}
        role="listbox"
        aria-label={ariaLabel}
      >
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">{panelHint}</p>
            {isFiltered ? (
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                onClick={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
              >
                Limpiar
              </button>
            ) : null}
          </div>
          <ul className={KANBAN_FILTER_DROPDOWN_LIST}>
            {options.map((option) => {
              const checked = option.value === value
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      checked ? 'bg-primary/10' : 'hover:bg-muted/60'
                    )}
                    onClick={() => selectValue(option.value)}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background'
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-normal leading-snug">{option.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
      </KanbanFilterPopover>
    </div>
  )
}

export function createKanbanDefaultFilter(userId?: string): AccionesFilter {
  return userId ? { responsable: userId } : {}
}

export function hasKanbanActiveFilters(filter: AccionesFilter): boolean {
  return countKanbanActiveFilters(filter) > 0
}

export function countKanbanActiveFilters(filter: AccionesFilter): number {
  let count = 0
  if (filter.search != null && filter.search.trim() !== '') count++
  if (
    (filter.fecha_min != null && filter.fecha_min !== '') ||
    (filter.fecha_max != null && filter.fecha_max !== '')
  ) {
    count++
  }
  if (filter.estado != null) count++
  if (filter.prioridad != null || filter.prioridad_id != null) count++
  if (filter.area != null && filter.area !== '') count++
  if (filter.responsable != null) count++
  if (filter.created_by != null) count++
  if (filter.involved_user_id != null) count++
  return count
}

/** En el trigger: nombre del filtro si está en “todos”; si no, la opción elegida. */
function kanbanFilterTriggerLabel(
  value: string,
  filterLabel: string,
  selectedLabel?: string,
  allValue = ALL_FILTER_VALUE
): string {
  if (value === allValue) return filterLabel
  return selectedLabel ?? filterLabel
}

export type KanbanToolbarLayout = 'default' | 'dashboard'

export interface KanbanToolbarProps {
  filter: AccionesFilter
  /** Puede recibir el filtro completo o solo los campos que cambian (merge con estado actual). */
  onFilterChange: (f: AccionesFilter | Partial<AccionesFilter>) => void
  onClear: () => void
  /** Ocultar completamente (ej. cuando filtros colapsados en Kanban) */
  visible?: boolean
  /** Vista dashboard: primera fila compacta + presets; selects en fila separada según `advancedExpanded`. */
  layout?: KanbanToolbarLayout
  /** Solo `layout="dashboard"`: muestra estado, prioridad, área, creada por y responsable. */
  advancedExpanded?: boolean
  /** Si se omite, el filtro de estado usa solo claves internas (legacy). */
  statuses?: Status[]
  className?: string
}

export function KanbanToolbar({
  filter,
  onFilterChange,
  onClear,
  visible = true,
  layout = 'default',
  advancedExpanded,
  statuses = [],
  className,
}: KanbanToolbarProps) {
  const { data: users = [] } = useUsers({ activo: true })
  const { data: areas = [] } = useAreas({ activo: true })
  const { data: priorities = [] } = usePriorities({ activo: true })
  const estadoOptions = useMemo(
    () => activeEstadoFilterOptions(statuses, ACTION_STATUS, 'Todos los estados'),
    [statuses]
  )
  const priorityOptions = useMemo(
    () => [
      { value: ALL_FILTER_VALUE, label: 'Todas las prioridades' },
      ...[...priorities]
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
        .map((p) => ({
          value: p.id,
          label: priorityDisplayLabel(p.nombre),
        })),
    ],
    [priorities]
  )

  const hasFilters = hasKanbanActiveFilters(filter)
  const activeFilterCount = countKanbanActiveFilters(filter)

  const estadoValues = normalizeEstadoFilter(filter.estado)
  const prioridadValue = Array.isArray(filter.prioridad_id)
    ? (filter.prioridad_id[0] ?? 'all')
    : (filter.prioridad_id ?? (Array.isArray(filter.prioridad) ? (filter.prioridad[0] ?? 'all') : (filter.prioridad ?? 'all')))
  const areaValue = filter.area ?? ALL_FILTER_VALUE
  const creadaPorValue = filter.created_by ?? ALL_FILTER_VALUE
  const responsableValue = filter.responsable ?? ALL_FILTER_VALUE

  const estadoActive = estadoValues.length > 0
  const prioridadActive = prioridadValue !== ALL_FILTER_VALUE
  const areaActive = areaValue !== ALL_FILTER_VALUE
  const creadaPorActive = creadaPorValue !== ALL_FILTER_VALUE
  const responsableActive = responsableValue !== ALL_FILTER_VALUE
  const searchActive = Boolean(filter.search?.trim())
  const fechaRangeActive = Boolean(filter.fecha_min || filter.fecha_max)

  const showAdvancedRow = layout !== 'dashboard' || advancedExpanded !== false

  const selectTriggerClass = (active = false) =>
    layout === 'dashboard'
      ? cn(
          DASHBOARD_FILTER_FIELD,
          '[&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left [&>span]:text-[11px] sm:[&>span]:text-sm',
          active && DASHBOARD_FILTER_FIELD_ACTIVE
        )
      : cn(DEFAULT_FILTER_SELECT_CLASS, active && FILTER_FIELD_ACTIVE)

  const inputFieldClass = (active = false) =>
    layout === 'dashboard'
      ? cn(DASHBOARD_FILTER_FIELD, active && DASHBOARD_FILTER_FIELD_ACTIVE)
      : cn(DEFAULT_FILTER_INPUT_CLASS, active && FILTER_FIELD_ACTIVE)

  const advancedSelects = (compact = false) => (
    <>
      <KanbanToolbarField label="Estado" htmlFor="kanban-filter-estado" active={estadoActive} compact={compact}>
        <EstadoMultiSelect
          id="kanban-filter-estado"
          options={estadoOptions}
          value={estadoValues}
          active={estadoActive}
          triggerClassName={selectTriggerClass(estadoActive)}
          onChange={(next) => onFilterChange({ estado: next })}
        />
      </KanbanToolbarField>
      <KanbanToolbarField label="Prioridad" htmlFor="kanban-filter-prioridad" active={prioridadActive} compact={compact}>
        <KanbanSingleSelect
          id="kanban-filter-prioridad"
          placeholder="Prioridad"
          ariaLabel="Prioridad"
          options={priorityOptions}
          value={prioridadValue}
          active={prioridadActive}
          triggerClassName={selectTriggerClass(prioridadActive)}
          onChange={(v) => {
            if (!v) {
              onFilterChange({ prioridad_id: undefined, prioridad: undefined })
              return
            }
            const priority = priorities.find((p) => p.id === v)
            onFilterChange({ prioridad_id: v, prioridad: priority?.nombre ?? undefined })
          }}
        />
      </KanbanToolbarField>
      <KanbanToolbarField label="Área" htmlFor="kanban-filter-area" active={areaActive} compact={compact}>
        <KanbanSingleSelect
          id="kanban-filter-area"
          placeholder="Área"
          ariaLabel="Área"
          options={[
            { value: ALL_FILTER_VALUE, label: 'Todas las áreas' },
            ...areas.map((area) => ({ value: area.nombre, label: area.nombre })),
          ]}
          value={areaValue}
          active={areaActive}
          triggerClassName={selectTriggerClass(areaActive)}
          onChange={(v) => onFilterChange({ area: v === ALL_FILTER_VALUE || !v ? undefined : v })}
        />
      </KanbanToolbarField>
      <KanbanToolbarField label="Creada por" htmlFor="kanban-filter-creada-por" active={creadaPorActive} compact={compact}>
        <KanbanSingleSelect
          id="kanban-filter-creada-por"
          placeholder="Creada por"
          ariaLabel="Creada por"
          options={[
            { value: ALL_FILTER_VALUE, label: 'Todos los creadores' },
            ...users.map((user) => ({ value: user.id, label: user.nombre })),
          ]}
          value={creadaPorValue}
          active={creadaPorActive}
          triggerClassName={selectTriggerClass(creadaPorActive)}
          onChange={(v) => onFilterChange({ created_by: v === ALL_FILTER_VALUE || !v ? undefined : v })}
        />
      </KanbanToolbarField>
      <KanbanToolbarField label="Responsable" htmlFor="kanban-filter-responsable" active={responsableActive} compact={compact}>
        <KanbanSingleSelect
          id="kanban-filter-responsable"
          placeholder="Responsable"
          ariaLabel="Responsable"
          options={[
            { value: ALL_FILTER_VALUE, label: 'Todos los responsables' },
            ...users.map((user) => ({ value: user.id, label: user.nombre })),
          ]}
          value={responsableValue}
          active={responsableActive}
          triggerClassName={selectTriggerClass(responsableActive)}
          onChange={(v) => onFilterChange({ responsable: v === ALL_FILTER_VALUE || !v ? undefined : v })}
        />
      </KanbanToolbarField>
    </>
  )

  if (!visible) return null

  if (layout !== 'dashboard') {
    return (
      <div
        id="kanban-toolbar"
        className={cn(
          'kanban-toolbar flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-gradient-to-b from-card via-card to-muted/20 p-2.5 shadow-sm sm:gap-2.5 sm:p-3',
          hasFilters && 'border-primary/25 shadow-[0_1px_0_0_hsl(var(--primary)/0.08)]',
          'transition-[border-color,box-shadow] duration-200',
          className
        )}
      >
        {/* Fila 1: búsqueda, fechas y acciones */}
        <div
          className="kanban-toolbar-row-primary grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
          role="group"
          aria-label="Búsqueda y rango de fechas"
        >
          <div className="col-span-2 flex min-w-0 items-center gap-2 lg:col-span-1 lg:block">
            <div className="relative min-w-0 flex-1 lg:w-full">
              <Search
                className={cn(
                  'pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors',
                  searchActive ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-hidden
              />
              <Input
                id="kanban-filter-search"
                className={cn('kanban-toolbar-search h-9 w-full pl-8', inputFieldClass(searchActive))}
                type="search"
                placeholder="Buscar acciones…"
                value={filter.search ?? ''}
                onChange={(e) => onFilterChange({ search: e.target.value || undefined })}
                aria-label="Buscar por título, descripción o evidencia"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
              {activeFilterCount > 0 ? (
                <span
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 text-[11px] font-semibold text-primary"
                  aria-label={`${activeFilterCount} filtros activos`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="tabular-nums">{activeFilterCount}</span>
                </span>
              ) : null}
              {hasFilters ? (
                <Button
                  id="kanban-toolbar-clear"
                  className="kanban-toolbar-clear h-9 shrink-0 border-primary/25 bg-primary/5 px-2 text-primary hover:bg-primary/10 hover:text-primary"
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onClear}
                  aria-label="Limpiar filtros"
                >
                  <X className="h-3.5 w-3.5 shrink-0" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 lg:w-auto lg:max-w-[11rem]">
            <KanbanDateRangeFilter
              dateFrom={filter.fecha_min}
              dateTo={filter.fecha_max}
              onChange={onFilterChange}
              active={fechaRangeActive}
            />
          </div>

          <div className="hidden items-center justify-end gap-1.5 lg:flex">
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 text-[11px] font-semibold text-primary">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {activeFilterCount} activo{activeFilterCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 text-[11px] font-medium text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Filtros
              </span>
            )}
            {hasFilters ? (
              <Button
                className="h-9 shrink-0 gap-1 border-primary/25 bg-primary/5 px-2.5 text-primary hover:bg-primary/10 hover:text-primary"
                type="button"
                variant="outline"
                size="sm"
                onClick={onClear}
              >
                <X className="h-3.5 w-3.5 shrink-0" />
                Limpiar
              </Button>
            ) : null}
          </div>
        </div>

        {/* Fila 2: filtros avanzados */}
        <div
          className="kanban-toolbar-row-filters grid min-w-0 grid-cols-2 gap-2 border-t border-border/40 pt-2 sm:grid-cols-3 lg:grid-cols-5 lg:pt-2.5"
          aria-label="Filtros avanzados"
        >
          {advancedSelects(true)}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'kanban-toolbar-dashboard flex min-w-0 flex-col gap-3',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-xs font-semibold text-foreground sm:text-sm">Refinar resultados</p>
          {activeFilterCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          ) : null}
        </div>
        {hasFilters ? (
          <Button
            id="kanban-toolbar-clear"
            className="h-8 shrink-0 gap-1.5 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground sm:h-9 sm:text-xs"
            type="button"
            variant="outline"
            size="sm"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5 shrink-0" />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="kanban-filter-search"
            className={cn(
              inputFieldClass(Boolean(filter.search?.trim())),
              'pl-8 sm:pl-9'
            )}
            type="search"
            placeholder="Buscar"
            value={filter.search ?? ''}
            onChange={(e) => onFilterChange({ search: e.target.value || undefined })}
          />
        </div>

        <KanbanDateRangeFilter
          dateFrom={filter.fecha_min}
          dateTo={filter.fecha_max}
          onChange={onFilterChange}
          compact
          active={fechaRangeActive}
        />
      </div>

      {showAdvancedRow ? (
        <div
          className="grid min-w-0 grid-cols-2 gap-2 border-t border-border/35 pt-2 sm:grid-cols-3 lg:grid-cols-5"
          aria-label="Filtros avanzados"
        >
          {advancedSelects(true)}
        </div>
      ) : null}
    </div>
  )
}
