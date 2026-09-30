import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatMetric,
  krProgress,
  type CheckIn,
  type KeyResult,
  type Objective,
} from './model'
import { reportDate } from './reporting'

export function OkrScopeGroupHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: LucideIcon
  title: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/50 bg-muted/25 px-4 py-2.5 sm:px-5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-3 w-3 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  )
}

export function partitionObjectivesByScope(
  objectives: Objective[],
  areaName?: (objective: Objective) => string
) {
  const byName = (a: Objective, b: Objective) =>
    a.nombre_okr.localeCompare(b.nombre_okr, 'es')
  const company = objectives
    .filter((item) => item.scope === 'company')
    .sort(byName)
  const team = objectives
    .filter((item) => item.scope === 'team')
    .sort((a, b) => {
      if (areaName) {
        const byArea = areaName(a).localeCompare(areaName(b), 'es')
        if (byArea) return byArea
      }
      return byName(a, b)
    })
  return { company, team }
}

export const compactControl =
  'h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export const toolbarField =
  'flex h-11 min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 transition-colors focus-within:border-ring focus-within:bg-background focus-within:ring-2 focus-within:ring-ring'

export const toolbarInput =
  'h-full min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50'

export function periodTone(period: string) {
  if (period === 'Activo')
    return 'text-emerald-700 dark:text-emerald-300'
  if (period === 'Programado') return 'text-sky-700 dark:text-sky-300'
  return 'text-muted-foreground'
}

export function metricText(value: number | null | undefined, unit = '') {
  if (value == null) return '—'
  const formatted = formatMetric(value)
  const suffix = unit.trim()
  if (!suffix) return formatted
  if (isPercentUnit(suffix)) return `${formatted}%`
  return `${formatted} ${suffix}`
}

export function periodRangeText(
  start: string | null | undefined,
  end: string | null | undefined
) {
  const from = reportDate(start)
  const to = reportDate(end)
  const startYear = start?.slice(0, 4)
  const endYear = end?.slice(0, 4)
  if (startYear && startYear === endYear) {
    return `${from.replace(/\s+\d{4}$/, '')} — ${to}`
  }
  return `${from} — ${to}`
}

export function measurementHeadline(
  baseline: number | null | undefined,
  target: number | null | undefined,
  unit: string
) {
  if (baseline == null || target == null || baseline === target) return null
  const verb = target > baseline ? 'Subir' : 'Bajar'
  if (isPercentUnit(unit)) {
    return `${verb} de ${metricText(baseline, unit)} a ${metricText(target, unit)}`
  }
  return `${verb} de ${formatMetric(baseline)} a ${metricText(target, unit)}`
}

export function remainingToTargetCopy(
  kr: Pick<KeyResult, 'current_value' | 'target_value' | 'unit'> &
    Partial<Pick<KeyResult, 'baseline_value' | 'computed_progress'>>
) {
  const current = kr.current_value
  const target = kr.target_value
  if (current == null || target == null) return null
  if (
    current === target ||
    krProgress({
      baseline_value: kr.baseline_value ?? null,
      current_value: current,
      target_value: target,
      computed_progress: kr.computed_progress,
    }) >= 100
  ) {
    return 'Ya alcanzó la meta.'
  }
  const amount = Math.abs(target - current)
  const formatted = formatMetric(amount)
  const unit = kr.unit.trim()
  if (isPercentUnit(unit)) {
    return amount === 1
      ? 'Falta 1 punto porcentual para alcanzar la meta.'
      : `Faltan ${formatted} puntos porcentuales para alcanzar la meta.`
  }
  if (!unit) return `Faltan ${formatted} para alcanzar la meta.`
  return `Faltan ${formatted} ${unit} para alcanzar la meta.`
}

export function lastMeasurementCaption(lastCheck: string) {
  if (
    lastCheck === 'Medición automática' ||
    lastCheck === 'Sin seguimiento registrado'
  ) {
    return lastCheck
  }
  return `Actualizado ${lastCheck}`
}

function isPercentUnit(unit: string) {
  const value = unit.trim().toLowerCase()
  return value === '%' || value === 'pp' || value === 'porcentaje'
}

export type ProgressTone = 'primary' | 'success' | 'warning' | 'danger' | 'muted'

export function progressTone(value: number): ProgressTone {
  if (value >= 70) return 'success'
  if (value >= 35) return 'warning'
  if (value > 0) return 'danger'
  return 'muted'
}

const toneFill: Record<ProgressTone, string> = {
  primary: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  muted: 'bg-muted-foreground/40',
}

const toneText: Record<ProgressTone, string> = {
  primary: 'text-sky-600 dark:text-sky-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
  muted: 'text-muted-foreground',
}

const toneRing: Record<ProgressTone, string> = {
  primary: 'stroke-sky-500',
  success: 'stroke-emerald-500',
  warning: 'stroke-amber-500',
  danger: 'stroke-rose-500',
  muted: 'stroke-muted-foreground/40',
}

export function toneTextClass(tone: ProgressTone) {
  return toneText[tone]
}

export function ProgressBar({
  value,
  label,
  size = 'md',
  tone = 'primary',
}: {
  value: number
  label: string
  size?: 'sm' | 'md'
  tone?: ProgressTone
}) {
  const rounded = Math.round(value)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'overflow-hidden rounded-full bg-muted',
        size === 'md' ? 'h-2.5' : 'h-1.5'
      )}
    >
      <div
        className={cn('h-full rounded-full transition-all', toneFill[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/** Circular progress used in the Plan details summary strip. */
export function RingProgress({
  value,
  label,
  tone = 'primary',
  size = 44,
  segments,
}: {
  value: number
  label: string
  tone?: ProgressTone
  size?: number
  /** Optional multi-color ring: values sum conceptually to 100. */
  segments?: { value: number; tone: ProgressTone }[]
}) {
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const center = size / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={label}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-muted"
      />
      {segments?.length ? (
        (() => {
          let offset = 0
          return segments.map((segment, index) => {
            const portion = Math.max(0, Math.min(100, segment.value))
            const length = (portion / 100) * circumference
            const node = (
              <circle
                key={`${segment.tone}-${index}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                className={toneRing[segment.tone]}
              />
            )
            offset += length
            return node
          })
        })()
      ) : (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          strokeLinecap="round"
          className={toneRing[tone]}
        />
      )}
    </svg>
  )
}

export function StatusSquare({ tone }: { tone: ProgressTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-[4px]',
        toneFill[tone]
      )}
    />
  )
}

export function StatusDot({ tone }: { tone: ProgressTone }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', toneFill[tone])}
    />
  )
}

/** Inclusive calendar days from `from` to `to` (YYYY-MM-DD). */
export function calendarDaysBetween(from: string, to: string) {
  const a = Date.parse(`${from.slice(0, 10)}T12:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86400000)
}

function historyPoints(
  history: CheckIn[],
  baseline: number | null | undefined,
  current: number | null | undefined
) {
  const chronological = [...history].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  )
  if (chronological.length) {
    return chronological.map((item) => ({
      id: item.id,
      value: item.value,
      at: item.created_at,
    }))
  }
  const points: { id: string; value: number; at: string }[] = []
  if (baseline != null) {
    points.push({ id: 'baseline', value: baseline, at: '' })
  }
  if (current != null && (baseline == null || current !== baseline)) {
    points.push({ id: 'current', value: current, at: '' })
  }
  return points
}

function sparkDate(value: string) {
  return new Date(value).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Mexico_City',
  })
}

function sparkClock(value: string) {
  return new Date(value).toLocaleTimeString('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  })
}

function sparkTick(value: number) {
  return value.toLocaleString('es-MX', {
    maximumFractionDigits: 1,
  })
}

export function KrTrajectory({
  baseline,
  current,
  target,
  unit,
  progress,
  title,
  history = [],
}: {
  baseline: number | null | undefined
  current: number | null | undefined
  target: number | null | undefined
  unit: string
  progress: number
  title: string
  history?: CheckIn[]
}) {
  const gradientId = useId().replace(/:/g, '')
  const rounded = Math.round(Math.max(0, Math.min(100, progress)))
  const start = metricText(baseline, unit)
  const now = metricText(current, unit)
  const goal = metricText(target, unit)
  const points = historyPoints(history, baseline, current)
  const values = [
    ...points.map((point) => point.value),
    ...(target != null ? [target] : []),
    ...(baseline != null ? [baseline] : []),
  ]
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const span = max - min
  const pad = Math.max(span * 0.16, span === 0 ? 1 : 0)
  const low = min - pad
  const high = max + pad
  const left = 48
  const right = 372
  const top = 26
  const bottom = 128
  const times = points.map((point) =>
    point.at ? Date.parse(point.at) : Number.NaN
  )
  const timeSpan =
    times.every(Number.isFinite) && times.length > 1
      ? Math.max(...times) - Math.min(...times)
      : 0
  const useTime = timeSpan > 20 * 60 * 60 * 1000
  const sameDay =
    Boolean(points[0]?.at) &&
    Boolean(points.at(-1)?.at) &&
    sparkDate(points[0].at) === sparkDate(points.at(-1)!.at)
  const x = (index: number) => {
    if (points.length <= 1) return (left + right) / 2
    if (useTime) {
      const t0 = Math.min(...times)
      return left + ((times[index] - t0) / timeSpan) * (right - left)
    }
    return left + (index / (points.length - 1)) * (right - left)
  }
  const y = (value: number) =>
    bottom - ((value - low) / (high - low)) * (bottom - top)
  const line = points
    .map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.value)}`)
    .join(' ')
  const labelEveryPoint = points.length <= 6
  const ticks = Array.from(new Set([min, max])).sort((a, b) => b - a)
  const axisLabel = (value: string) =>
    sameDay ? sparkClock(value) : sparkDate(value)
  const dated = points.filter((point) => point.at)
  const sharedStamp =
    dated.length > 0 &&
    dated.every(
      (point) => axisLabel(point.at) === axisLabel(dated[0].at)
    )
  const stampText = dated[0]?.at
    ? sameDay
      ? `${sparkDate(dated[0].at)}, ${sparkClock(dated[0].at)}`
      : axisLabel(dated[0].at)
    : ''
  const summary = points.length
    ? `Historial de ${title}: ${points.map((point) => metricText(point.value, unit)).join(', ')}. Meta ${goal}. Avance ${rounded}%.`
    : `Sin mediciones de ${title}. Meta ${goal}.`

  return (
    <div className="space-y-2">
      {points.length ? (
        <svg
          viewBox="0 0 440 168"
          className="h-[10.5rem] w-full overflow-visible text-primary"
          role="img"
          aria-label={summary}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity=".18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => {
            const ty = y(tick)
            return (
              <g key={tick}>
                <line
                  x1={left}
                  x2={right}
                  y1={ty}
                  y2={ty}
                  stroke="currentColor"
                  opacity="0.1"
                />
                {!labelEveryPoint ||
                !points.some((point) => point.value === tick) ? (
                  <text
                    x={left - 8}
                    y={ty + 4}
                    textAnchor="end"
                    fontSize="12"
                    fill="currentColor"
                    opacity="0.55"
                  >
                    {sparkTick(tick)}
                  </text>
                ) : null}
              </g>
            )
          })}
          {target != null && (
            <g>
              <line
                x1={left}
                x2={right}
                y1={y(target)}
                y2={y(target)}
                stroke="currentColor"
                strokeDasharray="5 5"
                opacity="0.45"
              />
              <text
                x={right + 6}
                y={y(target) + 4}
                fontSize="12"
                fill="currentColor"
                opacity="0.75"
              >
                meta
              </text>
            </g>
          )}
          {line && (
            <>
              <path
                d={`${line} L ${x(points.length - 1)} ${bottom} L ${x(0)} ${bottom} Z`}
                fill={`url(#${gradientId})`}
              />
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}
          {points.map((point, index) => {
            const last = index === points.length - 1
            const cx = x(index)
            const cy = y(point.value)
            const labelAbove = cy - 14 >= 14
            return (
              <g key={point.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={last ? 5.5 : 4}
                  fill="currentColor"
                  stroke="var(--card)"
                  strokeWidth="2"
                />
                {labelEveryPoint && (
                  <text
                    x={cx}
                    y={labelAbove ? cy - 12 : cy + 18}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={last ? 600 : 500}
                    fill="currentColor"
                  >
                    {metricText(point.value, unit)}
                  </text>
                )}
                {labelEveryPoint && !sharedStamp && point.at && (
                  <text
                    x={cx}
                    y="154"
                    textAnchor="middle"
                    fontSize="12"
                    fill="currentColor"
                    opacity="0.6"
                  >
                    {axisLabel(point.at)}
                  </text>
                )}
              </g>
            )
          })}
          {sharedStamp && stampText && (
            <text
              x={(left + right) / 2}
              y="154"
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
              opacity="0.6"
            >
              {stampText}
            </text>
          )}
          {!labelEveryPoint && !sharedStamp && points[0]?.at && points.at(-1)?.at && (
            <>
              <text
                x={left}
                y="154"
                fontSize="12"
                fill="currentColor"
                opacity="0.6"
              >
                {axisLabel(points[0].at)}
              </text>
              <text
                x={right}
                y="154"
                textAnchor="end"
                fontSize="12"
                fill="currentColor"
                opacity="0.6"
              >
                {axisLabel(points.at(-1)!.at)}
              </text>
            </>
          )}
        </svg>
      ) : (
        <p className="py-3 text-xs text-muted-foreground sm:text-[13px]">
          Registra la primera medición para ver el historial.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground sm:text-[13px]">
        <p>
          Inicio <span className="tabular-nums">{start}</span>
        </p>
        <p className="text-center font-medium text-foreground">
          <span className="tabular-nums">{now}</span> actual
        </p>
        <p className="text-right">
          <span className="tabular-nums">{goal}</span> meta
        </p>
      </div>
    </div>
  )
}
