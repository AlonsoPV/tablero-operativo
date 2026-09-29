import { useId, useMemo, useState } from 'react'
import { TrendingUp, CalendarRange } from 'lucide-react'
import type { CheckIn } from './model'
import { formatMetric } from './model'
import { historicalProgress, reportTimestamp } from './reporting'

/** Historical values are never recalculated with today's target. */
export function OkrHistoryChart({
  measurements,
  title = 'Evolución del KR',
}: {
  measurements: CheckIn[]
  title?: string
}) {
  const gradient = useId().replace(/:/g, '')
  const [mode, setMode] = useState<'progress' | 'value'>(() =>
    measurements.some((m) => historicalProgress(m) != null)
      ? 'progress'
      : 'value'
  )
  const [range, setRange] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const sorted = useMemo(
    () =>
      [...measurements].sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
      ),
    [measurements]
  )
  const latest = sorted.at(-1)
  const cutoff =
    range === 'all' || !latest
      ? -Infinity
      : Date.parse(latest.created_at) - Number(range) * 86400000
  const points = sorted.filter(
    (m) =>
      Date.parse(m.created_at) >= cutoff &&
      (mode === 'value' || historicalProgress(m) != null)
  )
  const selected = points.find((m) => m.id === selectedId) ?? points.at(-1)
  const value = (m: CheckIn) =>
    mode === 'progress' ? historicalProgress(m)! : m.value
  const values = points.map(value)
  const min = mode === 'progress' ? 0 : Math.min(...values)
  const max = mode === 'progress' ? 100 : Math.max(...values)
  const padding =
    mode === 'value' ? Math.max((max - min) * 0.1, Math.abs(max) * 0.05, 1) : 0
  const low = min - padding,
    high = max + padding
  const firstTime = points.length ? Date.parse(points[0].created_at) : 0
  const lastTime = points.length ? Date.parse(points.at(-1)!.created_at) : 0
  const x = (m: CheckIn) =>
    lastTime === firstTime
      ? 215
      : 50 +
        ((Date.parse(m.created_at) - firstTime) / (lastTime - firstTime)) * 330
  const y = (m: CheckIn) => 190 - ((value(m) - low) / (high - low)) * 160
  const path = points
    .map((m, i) => `${i ? 'L' : 'M'} ${x(m)} ${y(m)}`)
    .join(' ')
  const shortDate = (date: string) =>
    new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Mexico_City',
    })
  const multipleUnits =
    new Set(points.map((m) => m.unit_snapshot ?? 'Sin unidad histórica')).size >
    1
  return (
    <section
      className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
      aria-label={title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            {title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {points.length} {points.length === 1 ? 'medición' : 'mediciones'}
            {points.length > 0 && ' · selecciona un punto para ver su detalle'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <CalendarRange className="h-4 w-4" />
          <span className="sr-only">Rango de la gráfica</span>
          <select
            className="min-h-11 rounded-lg border bg-background px-2"
            value={range}
            onChange={(e) => {
              setRange(e.target.value)
              setSelectedId(null)
            }}
          >
            <option value="all">Todo el historial</option>
            <option value="90">Últimos 90 días registrados</option>
            <option value="30">Últimos 30 días registrados</option>
          </select>
        </label>
      </div>
      <div
        className="inline-flex rounded-lg bg-muted p-1"
        aria-label="Tipo de gráfica"
      >
        {(['progress', 'value'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item)
              setSelectedId(null)
            }}
            className={`min-h-11 rounded-md px-3 text-sm font-medium ${mode === item ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
          >
            {item === 'progress' ? 'Avance %' : 'Valor medido'}
          </button>
        ))}
      </div>
      {!points.length ? (
        <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">
          {measurements.length
            ? 'Estas mediciones no conservan su meta histórica. Consulta «Valor medido» para ver los datos originales.'
            : 'Registra la primera medición para comenzar a visualizar la evolución.'}
        </p>
      ) : (
        <>
          {mode === 'value' && multipleUnits ? (
            <p className="rounded-lg bg-muted p-4 text-sm">
              Hay cambios de unidad entre mediciones. Consulta los valores
              individuales abajo; no se conectan unidades diferentes en una
              gráfica.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <svg
                viewBox="0 0 400 230"
                className="w-full max-h-72 text-primary"
                role="group"
                aria-label={`${title}: ${mode === 'progress' ? 'porcentaje histórico' : 'valor medido'}`}
              >
                <defs>
                  <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="currentColor"
                      stopOpacity=".2"
                    />
                    <stop
                      offset="100%"
                      stopColor="currentColor"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                {[low, (low + high) / 2, high].map((tick, i) => (
                  <g key={i}>
                    <line
                      x1="50"
                      x2="380"
                      y1={190 - i * 80}
                      y2={190 - i * 80}
                      stroke="currentColor"
                      opacity=".12"
                      strokeDasharray="4 4"
                    />
                    <text
                      x="42"
                      y={194 - i * 80}
                      textAnchor="end"
                      fontSize="13"
                      fill="currentColor"
                    >
                      {tick.toLocaleString('es-MX', {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      })}
                      {mode === 'progress' ? '%' : ''}
                    </text>
                  </g>
                ))}
                <path
                  d={`${path} L ${x(points.at(-1)!)} 190 L ${x(points[0])} 190 Z`}
                  fill={`url(#${gradient})`}
                />
                <path
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                {points.map((m) => (
                  <g
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${reportTimestamp(m.created_at)}, ${formatMetric(value(m))}${mode === 'progress' ? '%' : ` ${m.unit_snapshot ?? ''}`}`}
                    onClick={() => setSelectedId(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedId(m.id)
                      }
                    }}
                    className="cursor-pointer outline-none focus:stroke-foreground"
                  >
                    <circle cx={x(m)} cy={y(m)} r="12" fill="transparent" />
                    <circle
                      cx={x(m)}
                      cy={y(m)}
                      r={selected?.id === m.id ? 6 : 4}
                      fill="currentColor"
                      stroke="var(--background)"
                      strokeWidth="2"
                    />
                  </g>
                ))}
                <text x="50" y="220" fontSize="13" fill="currentColor">
                  {shortDate(points[0].created_at)}
                </text>
                <text
                  x="380"
                  y="220"
                  textAnchor="end"
                  fontSize="13"
                  fill="currentColor"
                >
                  {shortDate(points.at(-1)!.created_at)}
                </text>
              </svg>
            </div>
          )}
          {selected && (
            <div
              aria-live="polite"
              className="grid gap-2 rounded-xl bg-primary/5 p-3 sm:grid-cols-2"
            >
              <div>
                <p className="text-xs text-muted-foreground">
                  {reportTimestamp(selected.created_at)}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatMetric(selected.value)}{' '}
                  <span className="text-sm font-normal">
                    {selected.unit_snapshot ?? ''}
                  </span>
                  {historicalProgress(selected) != null && (
                    <span className="ml-3 text-sm text-primary">
                      {formatMetric(historicalProgress(selected)!)}%
                    </span>
                  )}
                </p>
              </div>
              <p className="self-center break-words text-sm text-muted-foreground">
                {selected.note || 'Sin nota de seguimiento'}
              </p>
            </div>
          )}
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">
              Ver todas las mediciones ({points.length})
            </summary>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {points
                .slice()
                .reverse()
                .map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg px-3 text-left text-xs ${selected?.id === m.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                    >
                      <span>{reportTimestamp(m.created_at)}</span>
                      <strong>
                        {formatMetric(m.value)} {m.unit_snapshot}{' '}
                        {historicalProgress(m) != null
                          ? `· ${formatMetric(historicalProgress(m)!)}%`
                          : ''}
                      </strong>
                    </button>
                  </li>
                ))}
            </ul>
          </details>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Cada porcentaje conserva la meta vigente al registrar la medición. Los
        datos sin meta histórica están disponibles como valores medidos.
      </p>
    </section>
  )
}
