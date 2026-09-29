import { Gauge, ListChecks, Target, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from './okrPresentation'

export function OkrExecutionSummary({
  activeObjectives,
  averageProgress,
  activeKeyResults,
  needsAttention,
}: {
  activeObjectives: number
  averageProgress: number | null
  activeKeyResults: number
  needsAttention: number
}) {
  const averageLabel =
    averageProgress == null ? '—' : `${Math.round(averageProgress)}%`
  const items = [
    {
      value: String(activeObjectives),
      label: 'Objetivos activos',
      icon: Target,
      attention: false,
      progress: null as number | null,
    },
    {
      value: averageLabel,
      label: 'Avance promedio',
      icon: Gauge,
      attention: false,
      progress: averageProgress,
    },
    {
      value: String(activeKeyResults),
      label: 'KRs activos',
      icon: ListChecks,
      attention: false,
      progress: null,
    },
    {
      value: String(needsAttention),
      label: 'Requieren atención',
      icon: TriangleAlert,
      attention: needsAttention > 0,
      progress: null,
    },
  ]

  return (
    <section aria-label="Resumen de objetivos" className="grid grid-cols-2 sm:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon
        return (
          <div
            key={item.label}
            className={cn(
              'min-w-0 px-4 py-3.5 sm:px-5 sm:py-4',
              index % 2 === 1 && 'border-l border-border/50',
              index >= 2 && 'border-t border-border/50 sm:border-t-0',
              index > 0 && 'sm:border-l'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  item.attention
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-primary/10 text-primary'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p
              className={cn(
                'mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.65rem]',
                item.attention && 'text-amber-700 dark:text-amber-300'
              )}
            >
              {item.value}
            </p>
            {item.progress != null && (
              <div className="mt-2.5">
                <ProgressBar
                  value={item.progress}
                  label="Avance promedio"
                  size="sm"
                />
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
