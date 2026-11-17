import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Route,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatQuickIndicatorValue,
  type OkrQuickFocus,
} from './okrQuickIndicators'
import { calendarDaysBetween } from './okrPresentation'

type CardTone = 'primary' | 'blue' | 'green' | 'orange' | 'violet'

const toneStyles: Record<
  CardTone,
  { card: string; icon: string; value: string; rail: string }
> = {
  primary: {
    card: 'border-sky-200/80 bg-sky-50/80',
    icon: 'bg-sky-100 text-sky-700',
    value: 'text-sky-800',
    rail: 'bg-sky-500',
  },
  blue: {
    card: 'border-blue-200/80 bg-blue-50/80',
    icon: 'bg-blue-100 text-blue-700',
    value: 'text-blue-800',
    rail: 'bg-blue-600',
  },
  green: {
    card: 'border-emerald-200/80 bg-emerald-50/80',
    icon: 'bg-emerald-100 text-emerald-700',
    value: 'text-emerald-800',
    rail: 'bg-emerald-500',
  },
  orange: {
    card: 'border-orange-200/80 bg-orange-50/80',
    icon: 'bg-orange-100 text-orange-700',
    value: 'text-orange-800',
    rail: 'bg-orange-500',
  },
  violet: {
    card: 'border-violet-200/80 bg-violet-50/80',
    icon: 'bg-violet-100 text-violet-700',
    value: 'text-violet-800',
    rail: 'bg-violet-500',
  },
}

type QuickCard = {
  id: OkrQuickFocus
  label: string
  value: string
  description: string
  icon: LucideIcon
  tone: CardTone
}

export function OkrExecutionSummary({
  daysLeft,
  averageProgress,
  onTrackShare,
  atRiskCount,
  upToDateShare,
  activeFocus = null,
  onSelect,
}: {
  daysLeft: number | null
  /** Kept for callers that still pass timeline ring; unused in compact cards. */
  timelineProgress?: number | null
  averageProgress: number | null
  /** % KRs en ritmo vs trayectoria del periodo. */
  onTrackShare: number | null
  atRiskCount: number | null
  upToDateShare: number | null
  activeFocus?: OkrQuickFocus | null
  onSelect?: (focus: OkrQuickFocus) => void
}) {
  const cards: QuickCard[] = [
    {
      id: 'cronograma',
      label: 'Cronograma',
      value: formatQuickIndicatorValue(null, 'days', daysLeft),
      description: 'Días restantes del periodo activo',
      icon: CalendarClock,
      tone: 'primary',
    },
    {
      id: 'avance',
      label: 'Avance',
      value: formatQuickIndicatorValue(averageProgress, 'percent'),
      description: 'Progreso promedio de los KRs',
      icon: TrendingUp,
      tone: 'blue',
    },
    {
      id: 'en_ruta',
      label: 'En ruta',
      value: formatQuickIndicatorValue(onTrackShare, 'percent'),
      description: 'KRs según la trayectoria prevista',
      icon: Route,
      tone: 'green',
    },
    {
      id: 'en_riesgo',
      label: 'En riesgo',
      value: formatQuickIndicatorValue(atRiskCount, 'count'),
      description: 'KRs con desviación de ritmo',
      icon: AlertTriangle,
      tone: 'orange',
    },
    {
      id: 'al_dia',
      label: 'Al día',
      value: formatQuickIndicatorValue(upToDateShare, 'percent'),
      description: 'KRs con seguimiento en el periodo',
      icon: CheckCircle2,
      tone: 'violet',
    },
  ]

  return (
    <section aria-label="Indicadores rápidos" className="space-y-3 px-3 py-4 sm:px-5 sm:py-5">
      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
        Indicadores rápidos
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card, index) => {
          const Icon = card.icon
          const tone = toneStyles[card.tone]
          const selected = activeFocus === card.id
          const className = cn(
            'relative flex min-h-[7.25rem] min-w-0 flex-col overflow-hidden rounded-2xl border p-3 text-left shadow-sm transition-all',
            tone.card,
            // Quinto indicador a ancho completo en 2 columnas (móvil).
            index === 4 && 'col-span-2 mx-auto w-full max-w-[calc(50%-0.25rem)] sm:col-span-1 sm:mx-0 sm:max-w-none',
            onSelect &&
              'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected && 'ring-2 ring-offset-1 ring-offset-background ring-foreground/20'
          )
          const body = (
            <>
              <span
                className={cn('absolute inset-y-0 left-0 w-1', tone.rail)}
                aria-hidden
              />
              <div className="flex items-start justify-between gap-2 pl-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {card.label}
                </p>
                <span
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    tone.icon
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
              <p
                className={cn(
                  'mt-2 pl-1.5 text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.65rem]',
                  tone.value
                )}
              >
                {card.value}
              </p>
              <p className="mt-auto pl-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
                {card.description}
              </p>
            </>
          )
          if (onSelect) {
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelect(card.id)}
                aria-pressed={selected}
                className={className}
              >
                {body}
              </button>
            )
          }
          return (
            <div key={card.id} className={className}>
              {body}
            </div>
          )
        })}
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
