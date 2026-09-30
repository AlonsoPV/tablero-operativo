import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Download,
  RefreshCw,
  SlidersHorizontal,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { okrService } from './service'
import {
  emptyReportFilters,
  filterReport,
  reportCsv,
  reportDate,
  type ReportFilters,
} from './reporting'
import { OkrDashboardOverview } from './OkrDashboardOverview'

const control =
  'min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm'

export function OkrReportingPanel({
  filters: externalFilters,
  onFiltersChange,
}: {
  filters?: ReportFilters
  onFiltersChange?: (filters: ReportFilters) => void
} = {}) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['okrs'],
    queryFn: okrService.dashboard,
    refetchInterval: 60000,
  })
  const [localFilters, setLocalFilters] = useState(emptyReportFilters)
  const filters = externalFilters ?? localFilters
  const setFilters = (next: ReportFilters) => {
    setLocalFilters(next)
    onFiltersChange?.(next)
  }
  const [expanded, setExpanded] = useState(false)
  const today = todayWallClockCDMX()
  const filtered = useMemo(
    () => filterReport(query.data?.objectives ?? [], filters, today),
    [query.data, filters, today]
  )
  const set = (key: keyof typeof filters, value: string) =>
    setFilters({
      ...filters,
      [key]: value,
      ...(key === 'scope' && value === 'company' ? { area: 'all' } : {}),
    })

  if (query.isPending)
    return (
      <p role="status" className="p-6">
        Cargando reporte de OKRs…
      </p>
    )
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-5">
        <h2 className="font-semibold">No se pudo cargar el reporte de OKRs</h2>
        <p className="text-sm">{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  const data = query.data
  const periods = [
    ...new Map(
      data.objectives.map((o) => [
        `${o.start_date ?? ''}|${o.end_date ?? ''}`,
        `${reportDate(o.start_date)} — ${reportDate(o.end_date)}`,
      ])
    ).entries(),
  ]
  const hasFilters = Object.keys(filters).some(
    (key) =>
      filters[key as keyof typeof filters] !==
      emptyReportFilters[key as keyof typeof filters]
  )

  function exportReport() {
    const blob = new Blob([reportCsv(filtered, data)], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reporte-okrs-${today}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section
      className="min-w-0 space-y-4 [&_button]:min-h-11"
      aria-label="Reporte de OKRs"
    >
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 shadow-sm">
        <header className="flex flex-col justify-between gap-4 p-4 sm:p-5 md:flex-row md:items-end">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tablero de resultados
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              <Target className="h-6 w-6 shrink-0 text-primary" />
              Resultados y seguimiento
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Resumen del resultado clave, distribución de avance y progreso
              del plan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Actualizar reporte"
              disabled={query.isFetching}
              onClick={() => {
                void qc.invalidateQueries({ queryKey: ['okrs'] })
                void qc.invalidateQueries({ queryKey: ['okr-report-history'] })
              }}
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
            <Button
              variant="outline"
              disabled={!filtered.length}
              onClick={exportReport}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button asChild>
              <Link to={ROUTES.OKRS}>Gestionar OKRs</Link>
            </Button>
          </div>
        </header>
        <section
          className="space-y-3 border-t bg-card/40 p-4 sm:p-5"
          aria-label="Filtros del reporte"
        >
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Buscar objetivo
              <input
                className={control}
                value={filters.search}
                onChange={(e) => set('search', e.target.value)}
                placeholder="Buscar…"
              />
            </label>
            <Button
              variant="outline"
              aria-expanded={expanded}
              aria-controls="okr-report-filters"
              onClick={() => setExpanded(!expanded)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filtros{hasFilters ? ' •' : ''}
            </Button>
          </div>
          <div id="okr-report-filters" hidden={!expanded}>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid min-w-0 gap-1 text-sm">
                Periodo
                <select
                  className={control}
                  value={filters.dates}
                  onChange={(e) => set('dates', e.target.value)}
                >
                  <option value="all">Todos los periodos</option>
                  {periods.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                Estado del periodo
                <select
                  className={control}
                  value={filters.period}
                  onChange={(e) => set('period', e.target.value)}
                >
                  <option value="all">Todos, incluidos históricos</option>
                  {[
                    'Activo',
                    'Programado',
                    'Finalizado',
                    'Archivado',
                    'Sin periodo',
                  ].map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                Ámbito
                <select
                  className={control}
                  value={filters.scope}
                  onChange={(e) => set('scope', e.target.value)}
                >
                  <option value="all">Empresa y equipos</option>
                  <option value="company">Empresa</option>
                  <option value="team">Equipo</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                Equipo
                <select
                  className={control}
                  value={filters.area}
                  disabled={filters.scope === 'company'}
                  onChange={(e) => set('area', e.target.value)}
                >
                  <option value="all">Todos los equipos</option>
                  {data.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                Responsable del objetivo
                <select
                  className={control}
                  value={filters.owner}
                  onChange={(e) => set('owner', e.target.value)}
                >
                  <option value="all">Todos los responsables</option>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span aria-live="polite">
              {filtered.length}{' '}
              {filtered.length === 1 ? 'objetivo' : 'objetivos'}
            </span>
            {hasFilters && (
              <button
                className="px-2 text-primary underline"
                onClick={() => setFilters(emptyReportFilters)}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </section>
      </section>

      {!filtered.length ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <h2 className="font-semibold">No hay objetivos en este alcance</h2>
          <p className="my-3 text-sm text-muted-foreground">
            Prueba otro periodo o consulta todos los objetivos.
          </p>
          {hasFilters && (
            <Button
              variant="outline"
              onClick={() => setFilters(emptyReportFilters)}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <OkrDashboardOverview data={data} objectives={filtered} />
      )}
    </section>
  )
}
