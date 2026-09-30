import { useId, useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CheckIn } from './model'
import { formatMetric, krProgress } from './model'
import {
  comparableChange,
  historicalProgress,
  reportDate,
  reportTimestamp,
} from './reporting'
import {
  RingProgress,
  StatusSquare,
  calendarDaysBetween,
  metricText,
  periodRangeText,
  progressTone,
  toneTextClass,
} from './okrPresentation'

type ChartUser = { id: string; nombre: string }

/** Historical values are never recalculated with today's target. */
export function OkrHistoryChart({
  measurements,
  title = 'Evolución del KR',
  currentValue,
  unit = '',
  baseline,
  target,
  progress,
  periodStart,
  periodEnd,
  users = [],
}: {
  measurements: CheckIn[]
  title?: string
  currentValue?: number | null
  unit?: string
  baseline?: number | null
  target?: number | null
  progress?: number | null
  periodStart?: string | null
  periodEnd?: string | null
  users?: ChartUser[]
}) {
  const gradient = useId().replace(/:/g, '')
  const [mode, setMode] = useState<'progress' | 'value'>(() =>
    measurements.some((m) => historicalProgress(m) != null) ? 'progress' : 'value'
  )
  const [range, setRange] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(true)

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

  const resolvedProgress =
    progress ??
    (baseline != null && target != null && currentValue != null
      ? krProgress({
          baseline_value: baseline,
          target_value: target,
          current_value: currentValue,
        })
      : latest
        ? historicalProgress(latest)
        : null)
  const tone = progressTone(resolvedProgress ?? 0)
  const today = new Date().toISOString().slice(0, 10)
  const daysLeft =
    periodEnd != null ? calendarDaysBetween(today, periodEnd) : null

  const values = points.map(value)
  const targetLineValue =
    mode === 'progress'
      ? 100
      : target != null
        ? target
        : values.length
          ? Math.max(...values)
          : 0
  const baselineLineValue =
    mode === 'progress'
      ? 0
      : baseline != null
        ? baseline
        : values.length
          ? Math.min(...values)
          : 0

  const min =
    mode === 'progress'
      ? 0
      : Math.min(...values, baselineLineValue, targetLineValue)
  const max =
    mode === 'progress'
      ? 100
      : Math.max(...values, baselineLineValue, targetLineValue)
  const padding =
    mode === 'value' ? Math.max((max - min) * 0.12, Math.abs(max) * 0.04, 1) : 0
  const low = min - padding
  const high = max + padding

  const chartLeft = 52
  const chartRight = 388
  const chartTop = 28
  const chartBottom = 188
  const firstTime = points.length ? Date.parse(points[0].created_at) : 0
  const lastTime = points.length ? Date.parse(points.at(-1)!.created_at) : 0
  const periodEndMs = periodEnd
    ? Date.parse(`${periodEnd.slice(0, 10)}T12:00:00Z`)
    : Number.NaN
  const axisEnd =
    Number.isFinite(periodEndMs) && periodEndMs > lastTime
      ? periodEndMs
      : lastTime
  const todayMs = Date.parse(`${today}T12:00:00Z`)

  const xAt = (ms: number) => {
    if (!Number.isFinite(ms) || axisEnd === firstTime) return (chartLeft + chartRight) / 2
    return (
      chartLeft +
      ((ms - firstTime) / Math.max(1, axisEnd - firstTime)) *
        (chartRight - chartLeft)
    )
  }
  const x = (m: CheckIn) => xAt(Date.parse(m.created_at))
  const y = (v: number) =>
    chartBottom - ((v - low) / Math.max(high - low, 1e-9)) * (chartBottom - chartTop)

  const path = points
    .map((m, i) => `${i ? 'L' : 'M'} ${x(m)} ${y(value(m))}`)
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

  const yTicks = [high, (low + high) / 2, low]
  const xLabels = (() => {
    if (!points.length) return [] as string[]
    const start = points[0].created_at
    const end = periodEnd ?? points.at(-1)!.created_at
    if (points.length === 1) return [shortDate(start)]
    return [shortDate(start), shortDate(end)]
  })()

  const displayValue = metricText(
    currentValue ?? latest?.value ?? null,
    unit || latest?.unit_snapshot || ''
  )
  const change = comparableChange(
    [...measurements].sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
    )
  )

  const timeline = [...sorted]
    .reverse()
    .filter((item) => item.note !== 'Línea base inicial')
    .slice(0, 8)

  return (
    <section className="min-w-0 space-y-4" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <StatusSquare tone={tone} />
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-snug tracking-tight sm:text-lg">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {points.length}{' '}
              {points.length === 1 ? 'medición' : 'mediciones'}
              {points.length > 0 ? ' · toca un punto para ver detalle' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-1" aria-label="Tipo de gráfica">
            {(['progress', 'value'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => {
                  setMode(item)
                  setSelectedId(null)
                }}
                className={cn(
                  'min-h-9 rounded-md px-2.5 text-xs font-medium',
                  mode === item
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
              >
                {item === 'progress' ? 'Avance %' : 'Valor'}
              </button>
            ))}
          </div>
          <select
            className="min-h-9 rounded-lg border border-input bg-background px-2 text-xs"
            value={range}
            aria-label="Rango de la gráfica"
            onChange={(e) => {
              setRange(e.target.value)
              setSelectedId(null)
            }}
          >
            <option value="all">Todo</option>
            <option value="90">90 días</option>
            <option value="30">30 días</option>
          </select>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
        {!points.length ? (
          <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">
            {measurements.length
              ? 'Estas mediciones no conservan su meta histórica. Consulta «Valor» para ver los datos originales.'
              : 'Registra la primera medición para comenzar a visualizar la evolución.'}
          </p>
        ) : mode === 'value' && multipleUnits ? (
          <p className="rounded-lg bg-muted p-4 text-sm">
            Hay cambios de unidad entre mediciones. Consulta los valores
            individuales en la línea de tiempo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <svg
              viewBox="0 0 420 230"
              className="h-auto w-full max-h-72"
              role="group"
              aria-label={`${title}: ${mode === 'progress' ? 'porcentaje histórico' : 'valor medido'}`}
            >
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
              </defs>

              {yTicks.map((tick, index) => {
                const ty = y(tick)
                return (
                  <g key={`y-${index}`}>
                    <line
                      x1={chartLeft}
                      x2={chartRight}
                      y1={ty}
                      y2={ty}
                      stroke="currentColor"
                      className="text-border"
                      opacity=".9"
                    />
                    <text
                      x={chartLeft - 8}
                      y={ty + 4}
                      textAnchor="end"
                      fontSize="11"
                      className="fill-muted-foreground"
                    >
                      {tick.toLocaleString('es-MX', {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      })}
                      {mode === 'progress' ? '%' : ''}
                    </text>
                  </g>
                )
              })}

              {/* Target trajectory */}
              <line
                x1={xAt(firstTime)}
                y1={y(baselineLineValue)}
                x2={xAt(axisEnd)}
                y2={y(targetLineValue)}
                stroke="currentColor"
                strokeDasharray="5 5"
                className="text-muted-foreground"
                opacity=".45"
              />

              {/* Today marker */}
              {Number.isFinite(todayMs) &&
                todayMs >= firstTime &&
                todayMs <= axisEnd && (
                  <g>
                    <line
                      x1={xAt(todayMs)}
                      x2={xAt(todayMs)}
                      y1={chartTop - 8}
                      y2={chartBottom}
                      stroke="currentColor"
                      strokeDasharray="3 4"
                      className="text-muted-foreground"
                      opacity=".55"
                    />
                    <text
                      x={xAt(todayMs)}
                      y={chartTop - 12}
                      textAnchor="middle"
                      fontSize="10"
                      className="fill-muted-foreground"
                    >
                      Hoy
                    </text>
                  </g>
                )}

              <path
                d={`${path} L ${x(points.at(-1)!)} ${chartBottom} L ${x(points[0])} ${chartBottom} Z`}
                fill={`url(#${gradient})`}
              />
              <path
                d={path}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {points.map((m, index) => {
                const last = index === points.length - 1
                const hasNote = Boolean(m.note && m.note !== 'Línea base inicial')
                const cx = x(m)
                const cy = y(value(m))
                const selectedPoint = selected?.id === m.id
                const fill = last
                  ? '#10b981'
                  : hasNote
                    ? '#f59e0b'
                    : '#3b82f6'
                return (
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
                    className="cursor-pointer outline-none"
                  >
                    <circle cx={cx} cy={cy} r="14" fill="transparent" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={selectedPoint || last ? 6 : 4.5}
                      fill={fill}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    {last && (
                      <g transform={`translate(${cx + 10}, ${cy - 10})`}>
                        <circle r="7" fill="#3b82f6" />
                        <path
                          d="M-3 0 L-1 2.5 L3.5 -2"
                          fill="none"
                          stroke="white"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    )}
                    {hasNote && !last && (
                      <g transform={`translate(${cx}, ${cy - 16})`}>
                        <rect
                          x={-7}
                          y={-9}
                          width={14}
                          height={11}
                          rx={3}
                          fill="#94a3b8"
                        />
                        <text
                          y={-1}
                          textAnchor="middle"
                          fontSize="8"
                          fill="white"
                          fontWeight="700"
                        >
                          1
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}

              {xLabels[0] && (
                <text
                  x={chartLeft}
                  y="218"
                  fontSize="11"
                  className="fill-muted-foreground"
                >
                  {xLabels[0]}
                </text>
              )}
              {xLabels[1] && (
                <text
                  x={chartRight}
                  y="218"
                  textAnchor="end"
                  fontSize="11"
                  className="fill-muted-foreground"
                >
                  {xLabels[1]}
                </text>
              )}
            </svg>
          </div>
        )}

        {selected && (
          <div
            aria-live="polite"
            className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
          >
            <p className="text-xs text-muted-foreground">
              {reportTimestamp(selected.created_at)}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatMetric(selected.value)} {selected.unit_snapshot ?? unit}
              {historicalProgress(selected) != null ? (
                <span className="ml-2 text-sky-600 dark:text-sky-400">
                  {formatMetric(historicalProgress(selected)!)}%
                </span>
              ) : null}
            </p>
            {selected.note ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {selected.note}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Progreso</p>
            <p
              className={cn(
                'mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl',
                toneTextClass(tone === 'muted' ? 'success' : tone)
              )}
            >
              {displayValue}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {resolvedProgress == null
                ? 'Sin avance medido'
                : `${Math.round(resolvedProgress)}% de la meta`}
              {change != null ? (
                <span
                  className={cn(
                    'ml-1 font-semibold',
                    change > 0
                      ? 'text-emerald-600'
                      : change < 0
                        ? 'text-rose-600'
                        : 'text-muted-foreground'
                  )}
                >
                  {change > 0 ? '+' : ''}
                  {formatMetric(change)}%
                </span>
              ) : null}
            </p>
          </div>
          <RingProgress
            value={resolvedProgress ?? 0}
            label="Progreso del resultado clave"
            tone={tone === 'muted' ? 'success' : tone}
            size={56}
          />
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Días restantes
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {daysLeft == null
              ? '—'
              : daysLeft < 0
                ? '0'
                : String(daysLeft)}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {periodStart || periodEnd
                ? periodRangeText(periodStart, periodEnd)
                : points.length
                  ? `${shortDate(points[0].created_at)} → ${shortDate(points.at(-1)!.created_at)}`
                  : 'Sin periodo'}
            </span>
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-muted/20 shadow-sm">
        <button
          type="button"
          aria-expanded={timelineOpen}
          onClick={() => setTimelineOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <h4 className="text-sm font-semibold">Timeline</h4>
          <span className="text-xs text-muted-foreground">
            {timeline.length}{' '}
            {timeline.length === 1 ? 'actualización' : 'actualizaciones'}
          </span>
        </button>
        {timelineOpen && (
          <div className="space-y-3 border-t border-border/50 px-4 py-3">
            {!timeline.length ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Todavía no hay mediciones en la línea de tiempo.
              </p>
            ) : (
              timeline.map((item) => {
                const actor =
                  users.find((user) => user.id === item.created_by)?.nombre ??
                  'Usuario'
                const initials = actor
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() ?? '')
                  .join('')
                const itemProgress = historicalProgress(item)
                return (
                  <article key={item.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-[10px] font-semibold uppercase text-muted-foreground ring-1 ring-border/60">
                        {initials || '?'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{actor}</p>
                        <p className="text-xs text-muted-foreground">
                          {reportTimestamp(item.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card p-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {metricText(item.value, item.unit_snapshot ?? unit)}
                        {itemProgress != null
                          ? ` · ${Math.round(itemProgress)}%`
                          : ''}
                      </span>
                      <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                        {item.note?.trim() ||
                          `Medición del ${reportDate(item.created_at.slice(0, 10))}.`}
                      </p>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        )}
      </section>
    </section>
  )
}
