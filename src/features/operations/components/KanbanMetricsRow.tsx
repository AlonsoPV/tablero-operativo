import { AlertTriangle, Ban, Clock3, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Status } from '@/features/catalogs/types/catalogs.types'
import type { KanbanHealthMetrics } from '../utils/metricas'
import {
  isActionStatusActiveInCatalog,
  statusCatalogByKey,
  statusCatalogDescription,
  statusCatalogLabel,
} from '../utils/statusCatalog'

type KanbanMetricsRowProps = {
  metrics: KanbanHealthMetrics
  statuses?: Status[]
  className?: string
}

function retrasoHint(metrics: KanbanHealthMetrics, emptyHint: string): string {
  if (metrics.vencidas <= 0) return emptyHint
  if (metrics.vencidasRojas <= 0) return 'Sin rojas en retraso'
  if (metrics.vencidasRojas === metrics.vencidas) {
    return metrics.vencidasRojas === 1 ? '1 roja en retraso' : `${metrics.vencidasRojas} rojas en retraso`
  }
  return metrics.vencidasRojas === 1
    ? '1 roja entre ellas'
    : `${metrics.vencidasRojas} rojas entre ellas`
}

export function KanbanMetricsRow({ metrics, statuses = [], className }: KanbanMetricsRowProps) {
  const statusByKey = statusCatalogByKey(statuses)
  const showBlockedMetric = isActionStatusActiveInCatalog(statuses, 'Bloqueado')
  const showRetrasoMetric = isActionStatusActiveInCatalog(statuses, 'Retraso')
  const blockedLabel = statusCatalogLabel('Bloqueado', statusByKey)
  const retrasoLabel = statusCatalogLabel('Retraso', statusByKey)
  const retrasoEmptyHint = statusCatalogDescription(
    'Retraso',
    statusByKey,
    'Fecha o hora límite rebasada'
  )
  const hasOverdueReds = metrics.vencidasRojas > 0

  const items = [
    {
      key: 'rojos',
      label: 'Rojos',
      value: metrics.rojos,
      hint: 'Criticas abiertas',
      hintTone: undefined as string | undefined,
      icon: AlertTriangle,
      tone: 'border-red-200/80 bg-red-50/80',
      valueTone: 'text-red-700',
      labelTone: 'text-red-800/80',
      visible: true,
    },
    {
      key: 'vencidas',
      label: retrasoLabel,
      value: metrics.vencidas,
      hint: retrasoHint(metrics, retrasoEmptyHint),
      hintTone: hasOverdueReds ? 'font-medium text-red-700' : undefined,
      icon: Clock3,
      tone: hasOverdueReds
        ? 'border-red-300/80 bg-gradient-to-br from-orange-50 via-orange-50 to-red-50/80'
        : 'border-orange-200/80 bg-orange-50/80',
      valueTone: hasOverdueReds ? 'text-red-700' : 'text-orange-700',
      labelTone: hasOverdueReds ? 'text-red-800/80' : 'text-orange-800/80',
      visible: showRetrasoMetric,
    },
    {
      key: 'bloqueadas',
      label: blockedLabel,
      value: metrics.bloqueadas,
      hint: 'Sin avance',
      hintTone: undefined as string | undefined,
      icon: Ban,
      tone: 'border-amber-200/80 bg-amber-50/70',
      valueTone: 'text-amber-800',
      labelTone: 'text-amber-900/75',
      visible: showBlockedMetric,
    },
    {
      key: 'abiertas',
      label: 'Abiertas',
      value: metrics.abiertas,
      hint: 'En flujo',
      hintTone: undefined as string | undefined,
      icon: FolderOpen,
      tone: 'border-border/70 bg-card',
      valueTone: 'text-foreground',
      labelTone: 'text-muted-foreground',
      visible: true,
    },
  ] as const

  const visibleItems = items.filter((item) => item.visible)

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 sm:gap-3',
        visibleItems.length >= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
        className
      )}
    >
      {visibleItems.map((item) => (
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
            <p className={cn('text-[11px] text-muted-foreground', item.hintTone)}>{item.hint}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
