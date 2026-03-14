/**
 * Tarjeta de métricas de disciplina (spec §5.4, §12).
 * Porcentaje cumplimiento, acciones sin evidencia, racha días verde, reincidencias.
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { DisciplinaMetrics } from '../hooks/useDisciplinaMetrics'
import { Target, FileWarning, Flame, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DisciplinaCardProps {
  metrics: DisciplinaMetrics
  /** Etiqueta de fecha para mostrar (ej. "Hoy", "15 mar 2026") */
  fechaLabel?: string
}

export function DisciplinaCard({ metrics, fechaLabel }: DisciplinaCardProps) {
  const {
    porcentaje_cumplimiento,
    acciones_asignadas,
    acciones_cerradas_en_tiempo,
    acciones_sin_evidencia,
    dias_consecutivos_en_verde,
    reincidencias,
    fromFallback,
  } = metrics

  const cumplimientoColor =
    porcentaje_cumplimiento >= 90
      ? 'text-emerald-600'
      : porcentaje_cumplimiento >= 60
        ? 'text-amber-600'
        : 'text-red-600'

  return (
    <Card className="border-border/60 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Métricas de disciplina</h3>
          {fechaLabel && (
            <span className="text-xs text-muted-foreground">{fechaLabel}</span>
          )}
        </div>
        {fromFallback && (
          <p className="text-xs text-muted-foreground">
            Cálculo a partir de acciones (la tabla medicion_disciplina no se actualiza automáticamente).
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricBlock
            icon={Target}
            label="Cumplimiento"
            value={`${porcentaje_cumplimiento}%`}
            sub={`${acciones_cerradas_en_tiempo} / ${acciones_asignadas} cerradas`}
            valueClassName={cumplimientoColor}
          />
          <MetricBlock
            icon={FileWarning}
            label="Sin evidencia"
            value={String(acciones_sin_evidencia)}
            sub="Hecho/Verificado sin evidencia"
            valueClassName={acciones_sin_evidencia > 0 ? 'text-amber-600' : 'text-muted-foreground'}
          />
          <MetricBlock
            icon={Flame}
            label="Racha en verde"
            value={String(dias_consecutivos_en_verde)}
            sub="días consecutivos ≥90%"
            valueClassName={dias_consecutivos_en_verde > 0 ? 'text-emerald-600' : 'text-muted-foreground'}
          />
          <MetricBlock
            icon={AlertTriangle}
            label="Reincidencias"
            value={String(reincidencias)}
            sub="misma falla repetida"
            valueClassName={reincidencias > 0 ? 'text-red-600' : 'text-muted-foreground'}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function MetricBlock({
  icon: Icon,
  label,
  value,
  sub,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-semibold tabular-nums', valueClassName)}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground truncate" title={sub}>
          {sub}
        </p>
      </div>
    </div>
  )
}
