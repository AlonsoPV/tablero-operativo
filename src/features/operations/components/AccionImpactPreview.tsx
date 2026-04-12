import { ArrowRight } from 'lucide-react'
import { useAccionImpactPreview } from '../hooks'

type AccionImpactPreviewProps = {
  gapIds: string[]
  storyPoints: number
}

export function AccionImpactPreview({
  gapIds,
  storyPoints,
}: AccionImpactPreviewProps) {
  const { preview, isLoading } = useAccionImpactPreview({ gapIds, storyPoints })

  if (!gapIds.length || isLoading) return null

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Cadena de impacto
      </p>
      {preview.map((p) => (
        <div key={p.gapId} className="space-y-1">
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
              {storyPoints > 0 ? `${storyPoints} pts` : '— pts'}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium text-foreground">{p.gapNombre}</span>
            {p.kpiNombre && (
              <>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">{p.kpiNombre}</span>
                {p.kpiPeso != null && (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                    peso {(p.kpiPeso * 100).toFixed(0)}%
                  </span>
                )}
              </>
            )}
          </div>

          {p.totalPuntosGap > 0 ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                Avance actual del gap:{' '}
                <span className="font-medium text-foreground">
                  {p.puntosCompletados}/{p.totalPuntosGap} pts
                </span>
              </p>
              {p.contribucionPct != null && (
                <p className="text-[11px] text-muted-foreground">
                  Esta acción aporta{' '}
                  <span className="font-medium text-foreground">
                    {(p.contribucionPct * 100).toFixed(1)}%
                  </span>{' '}
                  al cierre del gap ({storyPoints}/{p.totalPuntosGap} pts)
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              El gap no tiene puntos totales definidos; configúralo en el catálogo de gaps.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
