import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoHint } from '@/components/InfoHint'
import { cn } from '@/lib/utils'
import { ArrowRight, Gauge, ListChecks, Sigma, Target } from 'lucide-react'
import type { GapKpiLink } from '../hooks'
import type { Gap, GapStatus } from '../types/kpi.types'

/** Agregado de semáforo por KPI de catálogo (misma lógica que `CatalogKpiSemaforoGrid`). */
export type KpiSemaforoCounts = {
  on_track: number
  at_risk: number
  off_track: number
  sin_datos: number
}

export type GapStoryImpactRow = {
  id: string
  titulo: string
  storyPoints: number
  /** Impacto potencial al score global (metodología backlog), o null si no aplica. */
  impactGlobalPct: number | null
}

export type GapCardViewModel = {
  gap: Gap
  donePoints: number
  totalPoints: number
  progressPct: number
  gapKpiLink: GapKpiLink | null
  kpiNames: string[]
  /** Σ pesos de KPIs activos del gap (referencia analítica; no obligatorio = 1). */
  kpiWeightSum: number | null
  /** Resumen de cumplimiento por KPIs de catálogo vinculados al gap. */
  kpiSemaforoCounts: KpiSemaforoCounts | null
  accionesCount: number
  ownerLabel: string | null
  noAccionesWarning: boolean
  /** Impacto potencial por acción (historia) según peso KPI y puntos del gap. */
  storyImpactRows?: GapStoryImpactRow[]
}

function statusLabel(status: GapStatus): string {
  switch (status) {
    case 'open':
      return 'Abierto'
    case 'in_progress':
      return 'En curso'
    case 'resolved':
      return 'Resuelto'
    case 'closed':
      return 'Cerrado'
    default:
      return status
  }
}

export function GapCard({ vm }: { vm: GapCardViewModel }) {
  const {
    gap,
    donePoints,
    totalPoints,
    progressPct,
    gapKpiLink,
    kpiNames,
    kpiWeightSum,
    kpiSemaforoCounts,
    accionesCount,
    ownerLabel,
    noAccionesWarning,
    storyImpactRows,
  } = vm
  const semTotal =
    kpiSemaforoCounts != null
      ? kpiSemaforoCounts.on_track +
        kpiSemaforoCounts.at_risk +
        kpiSemaforoCounts.off_track +
        kpiSemaforoCounts.sin_datos
      : 0
  const barPct = Number.isFinite(progressPct) ? Math.min(100, Math.max(0, progressPct)) : 0
  const ptsLabel =
    totalPoints > 0
      ? `${donePoints.toLocaleString('es-MX', { maximumFractionDigits: 1 })} / ${totalPoints.toLocaleString('es-MX', { maximumFractionDigits: 1 })} pts`
      : `${donePoints.toLocaleString('es-MX', { maximumFractionDigits: 1 })} / — pts`
  const gapLinkPct = Math.round((gapKpiLink?.avancePct ?? 0) * 100)
  const gapLinkStateLabel =
    gapKpiLink?.estado === 'cerrado'
      ? 'Cerrado'
      : gapKpiLink?.estado === 'en_progreso'
        ? 'En progreso'
        : 'Abierto'

  const statusDot =
    gap.status === 'resolved' || gap.status === 'closed'
      ? 'bg-emerald-500'
      : gap.status === 'in_progress'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40'

  return (
    <Card className="overflow-hidden rounded-xl border border-border/60 shadow-sm">
      <CardHeader className="px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', statusDot)} aria-hidden />
            <CardTitle className="text-sm font-semibold leading-snug text-foreground">{gap.nombre}</CardTitle>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {statusLabel(gap.status)}
          </Badge>
        </div>
        {gap.descripcion && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{gap.descripcion}</p>
        )}
        {(gap.area || gap.prioridad || ownerLabel) && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {[
              gap.area && `Área: ${gap.area}`,
              gap.prioridad && `Prioridad: ${gap.prioridad}`,
              ownerLabel && `Responsable: ${ownerLabel}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5" />
              Avance (story points)
              <InfoHint text="Avance calculado con puntos de acciones en estado Hecho/Verificado sobre el total del gap." />
            </span>
            <span className="font-medium tabular-nums text-foreground">{ptsLabel}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full bg-primary transition-all',
                totalPoints === 0 && 'bg-muted-foreground/30'
              )}
              style={{ width: totalPoints === 0 ? '0%' : `${barPct}%` }}
            />
          </div>
        </div>

        {gapKpiLink && (
          <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <p className="inline-flex items-center gap-1 font-medium text-foreground">
                <Target className="h-3.5 w-3.5" />
                Gap a KPI
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground shadow-sm">
                <span
                  className={cn('h-1.5 w-1.5 shrink-0 rounded-full', {
                    'bg-emerald-500': gapKpiLink.estado === 'cerrado',
                    'bg-amber-500': gapKpiLink.estado === 'en_progreso',
                    'bg-muted-foreground/40': gapKpiLink.estado === 'abierto',
                  })}
                  aria-hidden
                />
                {gapLinkStateLabel}
              </span>
            </div>

            {gapKpiLink.totalPuntosGap > 0 ? (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        gapKpiLink.estado === 'cerrado' && 'bg-emerald-500',
                        gapKpiLink.estado === 'en_progreso' && 'bg-amber-500',
                        gapKpiLink.estado === 'abierto' && 'bg-muted-foreground/30'
                      )}
                      style={{ width: `${gapLinkPct}%` }}
                    />
                  </div>
                  <span className="tabular-nums">{gapLinkPct}%</span>
                  <span className="tabular-nums">
                    {gapKpiLink.puntosCompletados}/{gapKpiLink.totalPuntosGap} pts
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                El gap no tiene puntos totales definidos; configuralo en el catalogo.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {gapKpiLink.kpiNombre ? (
                <>
                  <ArrowRight className="h-3 w-3" />
                  <span>{gapKpiLink.kpiNombre}</span>
                  {gapKpiLink.kpiPeso != null && (
                    <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                      {(gapKpiLink.kpiPeso * 100).toFixed(0)}%
                    </span>
                  )}
                  {gapKpiLink.kpiCumplimiento != null && (
                    <span className="tabular-nums">
                      cumplimiento {(gapKpiLink.kpiCumplimiento * 100).toFixed(0)}%
                    </span>
                  )}
                </>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">Sin KPI vinculado</span>
              )}
            </div>
          </div>
        )}

        {kpiWeightSum != null && kpiWeightSum > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
            <p className="inline-flex items-center gap-1">
              <Sigma className="h-3.5 w-3.5" />Σ pesos KPI (activos)
              <InfoHint text="Suma analítica de pesos KPI activos del gap. No necesariamente debe ser 1.0." />
              : <span className="font-medium tabular-nums text-foreground">{kpiWeightSum.toFixed(4)}</span>
            </p>
          </div>
        )}

        {kpiSemaforoCounts != null && semTotal > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/25 px-2.5 py-2">
            <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
              <Target className="h-3.5 w-3.5" />
              Semáforo KPI (catálogo)
              <InfoHint text="Conteo de KPIs vinculados al gap por estado de cumplimiento: en meta, en riesgo, fuera y sin datos." />
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  En meta
                </span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {kpiSemaforoCounts.on_track}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                  En riesgo
                </span>
                <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {kpiSemaforoCounts.at_risk}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                  Fuera
                </span>
                <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {kpiSemaforoCounts.off_track}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                  Sin datos
                </span>
                <span className="font-semibold tabular-nums text-foreground">{kpiSemaforoCounts.sin_datos}</span>
              </div>
            </div>
          </div>
        )}

        {kpiNames.length > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
            <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              KPIs vinculados
            </p>
            <ul className="list-inside list-disc text-sm text-foreground">
              {kpiNames.slice(0, 4).map((name, idx) => (
                <li key={`${name}-${idx}`} className="truncate">
                  {name}
                </li>
              ))}
              {kpiNames.length > 4 && (
                <li className="list-none text-xs text-muted-foreground">
                  +{kpiNames.length - 4} más
                </li>
              )}
            </ul>
          </div>
        )}

        <p className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
          Acciones vinculadas: <span className="font-medium text-foreground">{accionesCount}</span>
        </p>

        {storyImpactRows && storyImpactRows.length > 0 && (
          <details className="gap-card__story-impact rounded-md border border-border/70 bg-muted/25 text-xs">
            <summary className="cursor-pointer list-none px-2.5 py-2 font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
              Impacto potencial al score global (por acción)
            </summary>
            <div className="border-t border-border/60 px-2 pb-2 pt-1">
              <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
                Fórmula: (Σ pesos KPI del gap / nº acciones) × (pts de la acción / pts totales del gap). Con
                varios KPIs se usa la suma de pesos como alcance conjunto del gap.
              </p>
              <div className="max-h-40 overflow-y-auto rounded border border-border/50">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Acción</th>
                      <th className="w-12 px-1 py-1 font-medium tabular-nums">Pts</th>
                      <th className="w-16 px-1 py-1 font-medium tabular-nums">% global</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storyImpactRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/40 last:border-0">
                        <td className="max-w-[12rem] truncate px-2 py-1 text-foreground" title={row.titulo}>
                          {row.titulo}
                        </td>
                        <td className="px-1 py-1 tabular-nums text-muted-foreground">{row.storyPoints}</td>
                        <td className="px-1 py-1 tabular-nums text-foreground">
                          {row.impactGlobalPct != null
                            ? `${row.impactGlobalPct.toFixed(2)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        )}

        {gapKpiLink?.kpiPeso != null && (
          <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
            <span className="text-muted-foreground">Aporte al Score Global si cierra</span>
            <span className="font-semibold tabular-nums text-primary">
              +{(gapKpiLink.kpiPeso * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {noAccionesWarning && (
          <p
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-950 dark:text-amber-100"
            role="status"
          >
            Sin acciones vinculadas a este gap.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
