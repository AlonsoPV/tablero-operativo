/**
 * Tarjeta KPI moderna para el dashboard — icono, valor, etiqueta, descripción.
 */

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface DashboardKpiCardProps {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  /** Color de acento sutil (borde/icono) */
  accent?: 'slate' | 'emerald' | 'red' | 'amber' | 'orange' | 'blue'
  isLoading?: boolean
  className?: string
  id?: string
}

const ACCENT_STYLES: Record<NonNullable<DashboardKpiCardProps['accent']>, string> = {
  slate: 'border-l-slate-400 [&_.kpi-icon]:text-slate-500',
  emerald: 'border-l-emerald-400 [&_.kpi-icon]:text-emerald-600',
  red: 'border-l-red-400 [&_.kpi-icon]:text-red-600',
  amber: 'border-l-amber-400 [&_.kpi-icon]:text-amber-600',
  orange: 'border-l-orange-400 [&_.kpi-icon]:text-orange-600',
  blue: 'border-l-blue-400 [&_.kpi-icon]:text-blue-600',
}

export function DashboardKpiCard({
  title,
  value,
  description,
  icon: Icon,
  accent = 'slate',
  isLoading,
  className,
  id,
}: DashboardKpiCardProps) {
  return (
    <div
      id={id}
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/50 bg-card px-2.5 py-2 shadow-sm transition-shadow sm:rounded-xl sm:px-4 sm:py-3 sm:hover:shadow-md',
        'border-l-[3px] sm:border-l-4',
        ACCENT_STYLES[accent],
        className
      )}
    >
      <div className="flex items-center justify-between gap-1.5 sm:items-start sm:gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {title}
          </p>
          {isLoading ? (
            <div className="mt-1 h-6 w-12 animate-pulse rounded bg-muted sm:mt-2 sm:h-8 sm:w-16" />
          ) : (
            <p className="mt-0.5 text-lg font-semibold tabular-nums leading-none tracking-tight text-foreground sm:mt-1 sm:text-2xl">
              {value}
            </p>
          )}
          <p className="mt-0.5 hidden text-[10px] text-muted-foreground sm:mt-1 sm:block sm:text-xs">
            {description}
          </p>
        </div>
        <div className="kpi-icon shrink-0 rounded-md bg-muted/50 p-1.5 sm:rounded-lg sm:p-2">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </div>
  )
}
