/**
 * Tarjeta de semáforo KPI — panel visual con indicador, valor y barra (spec §4.2).
 */

import type { KpiSemaforo } from '@/types'
import { getKpiLabel } from '../constants/kpi-labels'
import { cn } from '@/lib/utils'

const COLOR_STYLES: Record<KpiSemaforo, string> = {
  verde: 'bg-emerald-500/10 border-emerald-500/30 [&_.dot]:bg-emerald-500',
  amarillo: 'bg-amber-500/10 border-amber-500/30 [&_.dot]:bg-amber-500',
  rojo: 'bg-red-500/10 border-red-500/30 [&_.dot]:bg-red-500',
}

function barStyles(color: KpiSemaforo): string {
  const map: Record<KpiSemaforo, string> = {
    verde: 'bg-emerald-500',
    amarillo: 'bg-amber-500',
    rojo: 'bg-red-500',
  }
  return map[color]
}

export interface KPISemaforoCardProps {
  nombreKpi: string
  valor: number
  color: KpiSemaforo
  unidad?: string
  title?: string
}

export function KPISemaforoCard({
  nombreKpi,
  valor,
  color,
  unidad = '%',
  title,
}: KPISemaforoCardProps) {
  const label = getKpiLabel(nombreKpi)
  const pct = Math.min(100, Math.max(0, valor))

  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 shadow-sm transition-shadow hover:shadow-md',
        COLOR_STYLES[color]
      )}
      title={title}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="dot h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden />
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-0.5">
          <span className="text-xl font-semibold tabular-nums text-foreground">{valor}</span>
          <span className="text-xs text-muted-foreground">{unidad}</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barStyles(color))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
