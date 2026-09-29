import { OkrVisualOverview } from './OkrVisualOverview'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Download,
  Gauge,
  History,
  RefreshCw,
  SlidersHorizontal,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { okrService } from './service'
import {
  formatMetric,
  krProgress,
  objectivePeriod,
  objectiveProgress,
  type Objective,
  type OkrData,
} from './model'
import {
  comparableChange,
  emptyReportFilters,
  filterReport,
  measurementLabel,
  measurementsFor,
  reportCsv,
  reportDate,
  reportingSummary,
  type ReportFilters,
} from './reporting'
import { OkrReportHistory } from './OkrReportHistory'

const control =
  'min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm'

function periodTone(period: string) {
  if (period === 'Activo')
    return 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
  if (period === 'Programado')
    return 'bg-sky-500/10 text-sky-800 dark:text-sky-200'
  return 'bg-muted text-muted-foreground'
}

function ReportProgress({
  value,
  label,
  compact = false,
  showValue = true,
}: {
  value: number
  label: string
  compact?: boolean
  showValue?: boolean
}) {
  const rounded = Math.round(value)
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0' : 'space-y-1.5')}>
      {compact ? (
        <span className="sr-only">
          {label}: {rounded}%
        </span>
      ) : (
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{label}</span>
          {showValue ? (
            <strong className="shrink-0 tabular-nums">{rounded}%</strong>
          ) : null}
        </div>
      )}
      <div
        className={cn(
          'overflow-hidden rounded-full bg-muted',
          compact ? 'h-1.5' : 'h-2'
        )}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  )
}

function ObjectiveReport({
  objective,
  data,
  onHistory,
}: {
  objective: Objective
  data: OkrData
  onHistory: () => void
}) {
  const results = data.keyResults.filter((k) => k.okr_id === objective.id)
  const today = todayWallClockCDMX()
  const progress = results.length ? objectiveProgress(results) : null
  const period = objectivePeriod(objective, today)
  const owner =
    data.users.find((u) => u.id === objective.owner_user_id)?.nombre ??
    'Sin asignar'
  const scopeLabel =
    objective.scope === 'company'
      ? 'Empresa'
      : (data.areas.find((a) => a.id === objective.area_id)?.nombre ?? 'Equipo')

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                {scopeLabel}
              </span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 font-medium',
                  periodTone(period)
                )}
              >
                {period}
              </span>
              <span className="text-muted-foreground">
                {reportDate(objective.start_date)} —{' '}
                {reportDate(objective.end_date)}
              </span>
            </div>
            <h3 className="break-words text-lg font-semibold leading-snug">
              {objective.nombre_okr}
            </h3>
            <p className="text-sm text-muted-foreground">
              Responsable:{' '}
              <span className="font-medium text-foreground">{owner}</span>
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
              {progress == null ? '—' : `${Math.round(progress)}%`}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              avance
            </span>
          </p>
        </div>
        {progress == null ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Sin KRs definidos. Este objetivo aún no tiene un avance medible.
          </p>
        ) : (
          <ReportProgress
            showValue={false}
            value={progress}
            label={`Avance del objetivo · ${results.length} ${results.length === 1 ? 'KR' : 'KRs'}`}
          />
        )}
      </div>
      {results.length > 0 && (
        <ul className="divide-y border-t" aria-label="Resultados clave">
          {results.map((kr) => {
            const history = measurementsFor(data.checkIns, kr.id)
            const change = comparableChange(history)
            const initiatives = data.initiatives.filter(
              (i) => i.key_result_id === kr.id
            ).length
            const krOwner =
              data.users.find((u) => u.id === kr.owner_user_id)?.nombre ??
              'Sin dueño'
            return (
              <li
                key={kr.id}
                className="grid gap-3 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_9rem] md:items-center"
              >
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-semibold">
                    {kr.title}
                  </h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {krOwner}
                    {' · '}
                    {initiatives}{' '}
                    {initiatives === 1 ? 'iniciativa' : 'iniciativas'}
                  </p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="break-words text-muted-foreground">
                    <span className="text-xs">Base </span>
                    {kr.baseline_value == null
                      ? '—'
                      : formatMetric(kr.baseline_value)}
                    <span className="px-1.5 text-muted-foreground/70">→</span>
                    <span className="font-semibold text-foreground">
                      {kr.current_value == null
                        ? '—'
                        : formatMetric(kr.current_value)}
                    </span>
                    <span className="px-1.5 text-muted-foreground/70">/</span>
                    {formatMetric(kr.target_value)} {kr.unit}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{measurementLabel(kr, history)}</span>
                    {change != null && (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 font-medium tabular-nums',
                          change > 0
                            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                            : change < 0
                              ? 'bg-rose-500/10 text-rose-800 dark:text-rose-200'
                              : 'bg-muted'
                        )}
                      >
                        {change > 0 ? '+' : ''}
                        {formatMetric(change)} pp
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ReportProgress
                      compact
                      value={krProgress(kr)}
                      label={`Avance de ${kr.title}`}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {Math.round(krProgress(kr))}%
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="outline" onClick={onHistory}>
          <History className="mr-2 h-4 w-4" />
          Historial
        </Button>
        <Button asChild variant="outline">
          <Link to={`${ROUTES.OKRS}?objective=${objective.id}`}>
            Gestionar objetivo
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  )
}

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
  const [historyId, setHistoryId] = useState<string | null>(null)
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
  const summary = reportingSummary(filtered, data)
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
  const selected = data.objectives.find((o) => o.id === historyId)

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
              Avance por periodo, responsables y cómo cambian los resultados.
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
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        aria-label="Resumen del reporte"
      >
        {(
          [
            {
              label: 'Avance promedio',
              value:
                summary.average == null
                  ? '—'
                  : `${Math.round(summary.average)}%`,
              description: 'Objetivos que ya tienen KRs',
              icon: Gauge,
              attention: false,
            },
            {
              label: 'Objetivos logrados',
              value: summary.achieved,
              description: 'Todos sus KRs en 100%',
              icon: CheckCircle2,
              attention: false,
            },
            {
              label: 'Sin seguimiento',
              value: summary.withoutCheckIn,
              description: 'Solo registran la línea base',
              icon: TriangleAlert,
              attention: summary.withoutCheckIn > 0,
            },
            {
              label: 'Por definir',
              value: summary.missingKrs,
              description: 'Objetivos sin un KR',
              icon: CircleDashed,
              attention: summary.missingKrs > 0,
            },
          ] as const
        ).map(({ label, value, description, icon: Icon, attention }) => (
          <div
            key={label}
            className="min-w-0 rounded-2xl border bg-card p-3 shadow-sm sm:p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                {label}
              </p>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  attention
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-primary/10 text-primary'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums sm:text-3xl">
              {value}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
            {label === 'Avance promedio' && summary.average != null && (
              <div className="mt-3">
                <ReportProgress
                  compact
                  value={summary.average}
                  label="Avance promedio"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Cada objetivo promedia sus KRs con el mismo peso. Un periodo finalizado
        muestra la última medición, no un cierre congelado.
      </p>
      {!filtered.length && (
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
      )}
      <OkrVisualOverview data={data} objectives={filtered} />
      {filtered.map((o) => (
        <ObjectiveReport
          key={o.id}
          objective={o}
          data={data}
          onHistory={() => setHistoryId(o.id)}
        />
      ))}
      {selected && (
        <OkrReportHistory
          key={selected.id}
          objective={selected}
          data={data}
          onClose={() => setHistoryId(null)}
        />
      )}
    </section>
  )
}
