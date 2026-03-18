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
  accent?: 'slate' | 'emerald' | 'red' | 'amber' | 'blue'
  isLoading?: boolean
  className?: string
  id?: string
}

const ACCENT_STYLES: Record<NonNullable<DashboardKpiCardProps['accent']>, string> = {
  slate: 'border-l-slate-400 [&_.kpi-icon]:text-slate-500',
  emerald: 'border-l-emerald-400 [&_.kpi-icon]:text-emerald-600',
  red: 'border-l-red-400 [&_.kpi-icon]:text-red-600',
  amber: 'border-l-amber-400 [&_.kpi-icon]:text-amber-600',
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
        'relative overflow-hidden rounded-xl border border-border/50 bg-card px-4 py-4 shadow-sm transition-shadow hover:shadow-md',
        'border-l-4',
        ACCENT_STYLES[accent],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {isLoading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {value}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="kpi-icon shrink-0 rounded-lg bg-muted/50 p-2">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
