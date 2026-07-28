import { AlertTriangle, Ban, Clock3, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KanbanHealthMetrics } from '../utils/metricas'

type KanbanMetricsRowProps = {
  metrics: KanbanHealthMetrics
  className?: string
}

export function KanbanMetricsRow({ metrics, className }: KanbanMetricsRowProps) {
  const items = [
    {
      key: 'rojos',
      label: 'Rojos',
      value: metrics.rojos,
      hint: 'Criticas abiertas',
      icon: AlertTriangle,
      tone: 'border-red-200/80 bg-red-50/80',
      valueTone: 'text-red-700',
      labelTone: 'text-red-800/80',
    },
    {
      key: 'vencidas',
      label: 'Vencidas',
      value: metrics.vencidas,
      hint: 'Fecha rebasada',
      icon: Clock3,
      tone: 'border-orange-200/80 bg-orange-50/80',
      valueTone: 'text-orange-700',
      labelTone: 'text-orange-800/80',
    },
    {
      key: 'bloqueadas',
      label: 'Bloqueadas',
      value: metrics.bloqueadas,
      hint: 'Sin avance',
      icon: Ban,
      tone: 'border-amber-200/80 bg-amber-50/70',
      valueTone: 'text-amber-800',
      labelTone: 'text-amber-900/75',
    },
    {
      key: 'abiertas',
      label: 'Abiertas',
      value: metrics.abiertas,
      hint: 'En flujo',
      icon: FolderOpen,
      tone: 'border-border/70 bg-card',
      valueTone: 'text-foreground',
      labelTone: 'text-muted-foreground',
    },
  ] as const

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3', className)}>
      {items.map((item) => (
        <div
          key={item.key}
          className={cn('rounded-xl border px-3 py-2.5 shadow-sm sm:px-3.5 sm:py-3', item.tone)}
        >
          <div className="flex items-center justify-between gap-2">
            <p className={cn('text-[11px] font-semibold uppercase tracking-wide', item.labelTone)}>
              {item.label}
            </p>
            <item.icon className={cn('h-3.5 w-3.5 opacity-70', item.valueTone)} aria-hidden />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={cn('text-2xl font-bold tabular-nums leading-none sm:text-[1.75rem]', item.valueTone)}>
              {item.value}
            </p>
            <p className="text-[11px] text-muted-foreground">{item.hint}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
