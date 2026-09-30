import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RingProgress,
  calendarDaysBetween,
  progressTone,
  type ProgressTone,
} from './okrPresentation'

type Metric = {
  value: string
  label: string
  hint?: string
  ring: number
  tone: ProgressTone
  segments?: { value: number; tone: ProgressTone }[]
}

export function OkrExecutionSummary({
  daysLeft,
  timelineProgress,
  averageProgress,
  initiativesDone,
  initiativesTotal,
  onTrackShare,
}: {
  daysLeft: number | null
  timelineProgress: number | null
  averageProgress: number | null
  initiativesDone: number
  initiativesTotal: number
  /** 0–100 share of KRs that are on track (>=70%). */
  onTrackShare: number | null
}) {
  const krTone =
    averageProgress == null ? 'muted' : progressTone(averageProgress)
  const initiativePct =
    initiativesTotal > 0
      ? (initiativesDone / initiativesTotal) * 100
      : 0
  const confidence = onTrackShare ?? 0
  const atRisk = Math.max(0, 100 - confidence)

  const items: Metric[] = [
    {
      value:
        daysLeft == null
          ? '—'
          : daysLeft <= 0
            ? 'Finalizado'
            : `${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`,
      label: 'Cronograma',
      ring: timelineProgress ?? 0,
      tone: 'primary',
    },
    {
      value:
        averageProgress == null ? '—' : `${Math.round(averageProgress)}%`,
      label: 'Resultados clave',
      ring: averageProgress ?? 0,
      tone: krTone === 'muted' ? 'primary' : krTone,
    },
    {
      value: `${initiativesDone}/${initiativesTotal}`,
      label: 'Iniciativas',
      ring: initiativePct,
      tone: 'primary',
    },
    {
      value:
        onTrackShare == null ? '—' : `${Math.round(onTrackShare)}%`,
      label: 'Confianza',
      hint: 'Porcentaje de KRs en buen ritmo (≥70% de avance).',
      ring: confidence,
      tone: progressTone(confidence),
      segments:
        onTrackShare == null
          ? undefined
          : [
              { value: confidence, tone: 'success' },
              { value: atRisk, tone: 'warning' },
            ],
    },
  ]

  return (
    <section aria-label="Detalle del plan" className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
        Detalle del plan
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              'flex min-w-0 items-center justify-between gap-3 px-1 py-3 sm:px-3 sm:py-1',
              index % 2 === 1 && 'border-l border-border/60',
              index >= 2 && 'border-t border-border/60 sm:border-t-0',
              index > 0 && 'sm:border-l'
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tabular-nums tracking-tight sm:text-xl">
                {item.value}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {item.label}
                {item.hint ? (
                  <span title={item.hint} className="inline-flex">
                    <Info className="h-3 w-3" aria-hidden />
                    <span className="sr-only">{item.hint}</span>
                  </span>
                ) : null}
              </p>
            </div>
            <RingProgress
              value={item.ring}
              label={`${item.label}: ${Math.round(item.ring)}%`}
              tone={item.tone}
              segments={item.segments}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

/** Days left and elapsed ratio across the nearest active objective end date. */
export function planTimelineMetrics(
  objectives: {
    activo: boolean
    start_date: string | null
    end_date: string | null
  }[],
  today: string
) {
  const active = objectives.filter(
    (o) =>
      o.activo &&
      o.start_date &&
      o.end_date &&
      o.start_date <= today &&
      o.end_date >= today
  )
  if (!active.length) {
    return { daysLeft: null as number | null, timelineProgress: null as number | null }
  }
  const nearest = [...active].sort((a, b) =>
    (a.end_date ?? '').localeCompare(b.end_date ?? '')
  )[0]
  const daysLeft = calendarDaysBetween(today, nearest.end_date!)
  const span = calendarDaysBetween(nearest.start_date!, nearest.end_date!)
  const elapsed = calendarDaysBetween(nearest.start_date!, today)
  const timelineProgress =
    span != null && span > 0 && elapsed != null
      ? Math.max(0, Math.min(100, (elapsed / span) * 100))
      : null
  return { daysLeft, timelineProgress }
}
