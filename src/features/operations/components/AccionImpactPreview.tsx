import { useMemo } from 'react'
import { useAccionImpactPreview } from '../hooks'
import type { TipoAccion } from '../utils/tipoAccionConfig'
import { TIPO_ACCION_CONFIG } from '../utils/tipoAccionConfig'

type AccionImpactPreviewProps = {
  gapIds: string[]
  catalogKpiIds?: string[]
  catalogKpiLabels?: string[]
  tipoAccion?: TipoAccion
  sprintLabel?: string | null
  storyPoints: number
}

export function AccionImpactPreview({
  gapIds,
  catalogKpiIds = [],
  catalogKpiLabels = [],
  tipoAccion,
  sprintLabel,
  storyPoints,
}: AccionImpactPreviewProps) {
  const { preview, isLoading } = useAccionImpactPreview({
    gapIds,
    storyPoints,
    enabled: gapIds.length > 0,
  })

  const tipoLabel = tipoAccion ? TIPO_ACCION_CONFIG[tipoAccion].label : null

  const hasSummary =
    !!tipoLabel ||
    !!sprintLabel ||
    catalogKpiIds.length > 0 ||
    gapIds.length > 0

  const summaryItems = useMemo(() => {
    const rows: { label: string; value: string }[] = []
    if (tipoLabel) rows.push({ label: 'Tipo de acción', value: tipoLabel })
    if (sprintLabel) rows.push({ label: 'Sprint', value: sprintLabel })
    if (catalogKpiLabels.length > 0) {
      rows.push({
        label: catalogKpiLabels.length === 1 ? 'Indicador impactado' : 'Indicadores impactados',
        value: catalogKpiLabels.join(' · '),
      })
    }
    if (gapIds.length > 0 && !isLoading) {
      rows.push({
        label: gapIds.length === 1 ? 'Brecha' : 'Brechas',
        value: preview.map((p) => p.gapNombre).join(' · ') || `${gapIds.length} seleccionadas`,
      })
    }
    if (storyPoints > 0) {
      rows.push({ label: 'Story points', value: `${storyPoints} pts` })
    }
    return rows
  }, [tipoLabel, sprintLabel, catalogKpiLabels, gapIds.length, isLoading, preview, storyPoints])

  if (!hasSummary) return null

  return (
    <div
      className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
        Vista previa de impacto
      </p>
      {summaryItems.length > 0 && (
        <dl className="grid gap-1.5 sm:grid-cols-2">
          {summaryItems.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-sm font-medium leading-snug text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {gapIds.length > 0 && isLoading && (
        <div className="space-y-2" aria-busy="true" aria-label="Calculando avance de brechas">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full max-w-md animate-pulse rounded bg-muted/80" />
        </div>
      )}

      {gapIds.length > 0 && !isLoading && preview.length > 0 && (
        <div className="space-y-2 border-t border-primary/15 pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Avance estimado en brechas
          </p>
          {preview.map((p) => (
            <div
              key={p.gapId}
              className="space-y-1 rounded-md border border-border/40 bg-background/60 px-2 py-1.5"
            >
              <p className="text-sm font-semibold text-foreground">{p.gapNombre}</p>
              {p.totalPuntosGap > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Progreso del gap:{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {p.puntosCompletados} / {p.totalPuntosGap} pts
                    </span>
                  </p>
                  {storyPoints > 0 && p.contribucionPct != null ? (
                    <p className="text-xs text-muted-foreground">
                      Esta acción aporta ~{' '}
                      <span className="font-medium text-foreground">
                        {(p.contribucionPct * 100).toFixed(1)}%
                      </span>{' '}
                      del esfuerzo declarado en la brecha.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  La brecha no tiene puntos totales en catálogo; el seguimiento por puntos no aplica aún.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
