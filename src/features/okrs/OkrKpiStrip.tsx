import { Plus, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  krProgress,
  type CheckIn,
  type KeyResult,
  type Objective,
} from './model'
import { measurementLabel, measurementsFor } from './reporting'
import {
  ProgressBar,
  StatusSquare,
  lastMeasurementCaption,
  metricText,
  progressTone,
  toneTextClass,
} from './okrPresentation'

export function OkrKpiStrip({
  keyResults,
  objectives,
  checkIns,
  canAdd,
  onAdd,
  onOpen,
}: {
  keyResults: KeyResult[]
  objectives: Objective[]
  checkIns: CheckIn[]
  canAdd: boolean
  onAdd: () => void
  onOpen: (kr: KeyResult) => void
}) {
  const cards = keyResults.slice(0, 8)
  if (!cards.length && !canAdd) return null

  return (
    <section
      aria-label="Indicadores clave"
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Target className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight sm:text-[15px]">
              KPIs
            </h2>
            <p className="text-xs text-muted-foreground">
              {cards.length} resultado{cards.length === 1 ? '' : 's'} clave
            </p>
          </div>
        </div>
        {canAdd && (
          <Button variant="outline" size="sm" className="h-8" onClick={onAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Agregar
          </Button>
        )}
      </header>

      <div className="p-4 sm:p-5">
        {!cards.length ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay resultados clave para mostrar como indicadores.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((kr) => {
              const progress = krProgress(kr)
              const tone = progressTone(progress)
              const history = measurementsFor(checkIns, kr.id)
              const updated = measurementLabel(kr, history)
              const objective = objectives.find((item) => item.id === kr.okr_id)
              const currentLabel = metricText(kr.current_value, kr.unit)
              const targetLabel =
                kr.target_value == null
                  ? null
                  : metricText(kr.target_value, kr.unit)
              const updatedLabel = lastMeasurementCaption(updated)

              return (
                <button
                  key={kr.id}
                  type="button"
                  onClick={() => onOpen(kr)}
                  className="group flex min-h-[10rem] min-w-0 flex-col gap-3 rounded-2xl border border-border/70 bg-background p-3.5 text-left outline-none transition-all hover:border-border hover:bg-muted/25 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start gap-2">
                    <StatusSquare tone={tone} />
                    <p className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug text-foreground">
                      {kr.title}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p
                      className={cn(
                        'truncate text-2xl font-semibold tabular-nums tracking-tight',
                        toneTextClass(tone === 'muted' ? 'primary' : tone)
                      )}
                    >
                      {currentLabel}
                    </p>
                    {targetLabel ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        Meta {targetLabel}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-auto space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <ProgressBar
                          value={progress}
                          label={`Avance de ${kr.title}`}
                          size="sm"
                          tone={tone === 'muted' ? 'primary' : tone}
                        />
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-xs font-semibold tabular-nums',
                          toneTextClass(tone === 'muted' ? 'primary' : tone)
                        )}
                      >
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      {objective?.nombre_okr ? (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {objective.nombre_okr}
                        </p>
                      ) : null}
                      <p className="truncate text-[11px] text-muted-foreground/80">
                        {updatedLabel}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
