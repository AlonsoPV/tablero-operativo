import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarRange, ChevronDown, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { addCalendarDays, firstDayOfMonth, lastDayOfMonth, todayWallClockCDMX } from '@/lib/dateUtils'
import { KanbanFilterPopover } from './KanbanFilterPopover'

function formatFilterDateShort(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'numeric' })
}

type DatePreset = {
  key: string
  label: string
  range: () => { fecha_min?: string; fecha_max?: string }
}

function buildDatePresets(today: string): DatePreset[] {
  const [year, month] = today.split('-').map(Number)
  return [
    {
      key: 'hoy',
      label: 'Hoy',
      range: () => ({ fecha_min: today, fecha_max: today }),
    },
    {
      key: '7d',
      label: '7 días',
      range: () => ({ fecha_min: today, fecha_max: addCalendarDays(today, 6) }),
    },
    {
      key: 'mes',
      label: 'Este mes',
      range: () => ({
        fecha_min: firstDayOfMonth(year, month),
        fecha_max: lastDayOfMonth(year, month),
      }),
    },
  ]
}

function matchesPreset(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  preset: DatePreset
): boolean {
  const range = preset.range()
  return range.fecha_min === dateFrom && range.fecha_max === dateTo
}

type Props = {
  dateFrom?: string
  dateTo?: string
  onChange: (patch: { fecha_min?: string; fecha_max?: string }) => void
  className?: string
  compact?: boolean
  active?: boolean
}

export function KanbanDateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
  className,
  compact = false,
  active = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const today = todayWallClockCDMX()
  const presets = useMemo(() => buildDatePresets(today), [today])

  const hasRange = Boolean(dateFrom || dateTo)
  const triggerLabel =
    dateFrom && dateTo
      ? `${formatFilterDateShort(dateFrom)} – ${formatFilterDateShort(dateTo)}`
      : dateFrom
        ? `Desde ${formatFilterDateShort(dateFrom)}`
        : dateTo
          ? `Hasta ${formatFilterDateShort(dateTo)}`
          : 'Fechas'

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

  const applyPreset = (preset: DatePreset) => {
    onChange(preset.range())
  }

  const triggerClass = cn(
    'kanban-date-range-trigger inline-flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border bg-background text-left font-medium shadow-sm transition-[box-shadow,border-color,background-color] hover:bg-muted/40',
    compact
      ? 'h-11 min-h-11 rounded-lg border-2 border-border px-3 text-[11px] sm:h-10 sm:min-h-10 sm:text-sm'
      : 'h-9 border-border/60 px-2.5 text-xs sm:text-sm',
    active && 'border-primary/55 bg-primary/[0.06] text-primary ring-2 ring-primary/15',
    open && !active && 'border-border bg-muted/30',
    className
  )

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        id="kanban-filter-fecha-range"
        className={triggerClass}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        title={hasRange ? triggerLabel : 'Filtrar por rango de fecha límite'}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      <KanbanFilterPopover
        ref={panelRef}
        open={open}
        triggerRef={triggerRef}
        align="end"
        minWidth={264}
        id={panelId}
        role="dialog"
        aria-label="Rango de fecha límite"
        className="overflow-hidden rounded-xl border border-border/70 bg-popover shadow-xl ring-1 ring-black/5"
      >
          <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
            <p className="text-xs font-semibold text-foreground">Fecha límite</p>
            {hasRange ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                onClick={() => onChange({ fecha_min: undefined, fecha_max: undefined })}
              >
                <X className="h-3 w-3" aria-hidden />
                Limpiar
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">Rango opcional</span>
            )}
          </div>

          <div className="space-y-2.5 p-3">
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const selected = matchesPreset(dateFrom, dateTo, preset)
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                      selected
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'
                    )}
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/15 p-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                <div className="min-w-0 space-y-1">
                  <label
                    htmlFor="kanban-filter-fecha-desde"
                    className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Desde
                  </label>
                  <Input
                    id="kanban-filter-fecha-desde"
                    type="date"
                    className="h-8 border-border/60 bg-background px-2 text-xs"
                    value={dateFrom ?? ''}
                    max={dateTo || undefined}
                    onChange={(event) => onChange({ fecha_min: event.target.value || undefined })}
                  />
                </div>

                <ArrowRight className="mt-4 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />

                <div className="min-w-0 space-y-1">
                  <label
                    htmlFor="kanban-filter-fecha-hasta"
                    className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Hasta
                  </label>
                  <Input
                    id="kanban-filter-fecha-hasta"
                    type="date"
                    className="h-8 border-border/60 bg-background px-2 text-xs"
                    value={dateTo ?? ''}
                    min={dateFrom || undefined}
                    onChange={(event) => onChange({ fecha_max: event.target.value || undefined })}
                  />
                </div>
              </div>
            </div>
          </div>
      </KanbanFilterPopover>
    </div>
  )
}
