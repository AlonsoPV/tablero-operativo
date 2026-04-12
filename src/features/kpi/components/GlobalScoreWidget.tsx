import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { GlobalScoreTrend } from '../hooks/useGlobalScoreEvolution'

export type GlobalScoreBreakdown = {
  on_track: number
  at_risk: number
  off_track: number
  sin_datos: number
}

export type GlobalScoreCoverage = {
  totalKpiCount: number
  eligibleKpiCount: number
  totalWeight: number
  eligibleWeight: number
  missingWeight: number
}

export type GlobalScoreEvolutionCopy = {
  snapshotsLoading: boolean
  trend: GlobalScoreTrend
  deltaVsPreviousLine: string | null
  trendLine: string | null
  windowLine: string | null
  /** Al menos dos puntos en el historial para comparar vs anterior. */
  canComparePrevious: boolean
}

export function GlobalScoreWidget({
  score,
  breakdown,
  coverage,
  subtitle,
  evolution,
  cardTitle = 'Score global (metodología documento KPIs)',
}: {
  /** 0–1 o null si no aplica */
  score: number | null
  breakdown: GlobalScoreBreakdown
  coverage: GlobalScoreCoverage
  subtitle?: string
  /** Variación y tendencia desde snapshots (opcional). */
  evolution?: GlobalScoreEvolutionCopy
  /** Título de la tarjeta (p. ej. alineado al tablero ejecutivo). */
  cardTitle?: string
}) {
  const pct = score != null && Number.isFinite(score) ? Math.round(score * 1000) / 10 : null
  const coveragePct =
    coverage.totalWeight > 0 ? Math.round((coverage.eligibleWeight / coverage.totalWeight) * 1000) / 10 : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{cardTitle}</CardTitle>
        <CardDescription>
          {subtitle ??
            'Ponderado sobre KPIs del portafolio global (pesos activos). Usa medición o valor en catálogo; si faltan, la línea base como punto de partida para el cálculo.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-4xl font-semibold tabular-nums tracking-tight">
            {pct != null ? `${pct}%` : '—'}
          </span>
          {pct == null && <span className="text-sm text-muted-foreground">Sin datos suficientes</span>}
          {evolution && pct != null ? (
            <TrendBadge trend={evolution.snapshotsLoading ? null : evolution.trend} />
          ) : null}
        </div>

        {evolution && pct != null ? (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
            {evolution.snapshotsLoading ? (
              <p>Cargando historial para variación…</p>
            ) : !evolution.canComparePrevious ? (
              <p>
                Se necesitan al menos dos registros en el historial para comparar con el punto anterior (p. ej.
                tras otra medición de catálogo).
              </p>
            ) : (
              <>
                {evolution.deltaVsPreviousLine ? (
                  <p className="font-medium text-foreground">{evolution.deltaVsPreviousLine}</p>
                ) : null}
                {evolution.trendLine ? <p>{evolution.trendLine}</p> : null}
                {evolution.windowLine ? <p>{evolution.windowLine}</p> : null}
              </>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <BreakdownPill label="En meta" value={breakdown.on_track} variant="ok" />
          <BreakdownPill label="En riesgo" value={breakdown.at_risk} variant="warn" />
          <BreakdownPill label="Fuera" value={breakdown.off_track} variant="bad" />
          <BreakdownPill label="Sin datos" value={breakdown.sin_datos} variant="muted" />
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Cobertura del score: {coverage.eligibleKpiCount}/{coverage.totalKpiCount} KPIs ({coveragePct}% del peso).
          {coverage.missingWeight > 0 ? (
            <span className="ml-1">
              Falta {Math.round(coverage.missingWeight * 10000) / 100}% del peso por datos no elegibles.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function TrendBadge({ trend }: { trend: GlobalScoreTrend }) {
  if (trend == null) return null
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : ArrowRight
  const label = trend === 'up' ? 'Subiendo' : trend === 'down' ? 'Bajando' : 'Estable'
  const cls =
    trend === 'up'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
      : trend === 'down'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : 'border-muted bg-muted/40 text-muted-foreground'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
        cls
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

function BreakdownPill({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: 'ok' | 'warn' | 'bad' | 'muted'
}) {
  const cls =
    variant === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
      : variant === 'warn'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
        : variant === 'bad'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-muted bg-muted/50 text-muted-foreground'

  return (
    <div className={cn('rounded-lg border px-2 py-1.5', cls)}>
      <div className="text-[10px] uppercase opacity-80">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
