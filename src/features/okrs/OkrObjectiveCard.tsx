import {
  ChevronDown,
  Gauge,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import {
  objectivePeriod,
  objectiveProgress,
  type ActionOption,
  type Objective,
  type OkrData,
} from './model'
import { OkrKeyResultRow } from './OkrKeyResultRow'
import {
  periodRangeText,
  periodTone,
  ProgressBar,
} from './okrPresentation'

export function OkrObjectiveCard({
  objective,
  data,
  actions,
  actionsPending,
  actionsError,
  busy,
  expanded,
  onExpandedChange,
  onEdit,
  onHistory,
  onArchive,
  onAddKr,
  onCheckIn,
  onEditKr,
  onKrHistory,
  onLink,
  onUnlink,
}: {
  objective: Objective
  data: OkrData
  actions: ActionOption[]
  actionsPending: boolean
  actionsError: boolean
  busy: boolean
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  onEdit: () => void
  onHistory: () => void
  onArchive: () => void
  onAddKr: () => void
  onCheckIn: (krId: string) => void
  onEditKr: (krId: string) => void
  onKrHistory: (krId: string) => void
  onLink: (krId: string) => void
  onUnlink: (id: string) => void
}) {
  const today = todayWallClockCDMX()
  const results = data.keyResults.filter((kr) => kr.okr_id === objective.id)
  const initiativeCount = data.initiatives.filter((item) =>
    results.some((kr) => kr.id === item.key_result_id)
  ).length
  const progress = results.length ? objectiveProgress(results) : null
  const period = objectivePeriod(objective, today)
  const scopeLabel =
    objective.scope === 'company'
      ? 'Empresa'
      : (data.areas.find((area) => area.id === objective.area_id)?.nombre ??
        'Equipo')
  const canArchive = Boolean(
    objective.can_manage &&
      objective.activo &&
      objective.owner_user_id &&
      objective.start_date &&
      objective.end_date
  )
  const canAddKr = objective.can_manage && objective.activo

  return (
    <article className="min-w-0 rounded-2xl bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-4">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium uppercase tracking-wide sm:text-[13px]">
            <span className={periodTone(period)}>{period}</span>
            <span className="text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <span className="text-muted-foreground">{scopeLabel}</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform',
                expanded && 'rotate-180'
              )}
              aria-hidden
            />
          </div>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <h2 className="min-w-0 text-lg font-semibold leading-snug sm:text-xl">
              {objective.nombre_okr}
            </h2>
            <div className="shrink-0 sm:text-right">
              <p className="text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
                {progress == null ? '—' : `${Math.round(progress)}%`}
              </p>
              <p className="text-xs text-muted-foreground">completado</p>
            </div>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
            {periodRangeText(objective.start_date, objective.end_date)}
          </p>
          {progress != null && (
            <div className="mt-2.5">
              <ProgressBar
                value={progress}
                label={`Avance del objetivo · ${results.length} ${results.length === 1 ? 'resultado clave' : 'resultados clave'}`}
              />
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Gauge className="h-3.5 w-3.5 text-primary" aria-hidden />
              {results.length}{' '}
              {results.length === 1 ? 'resultado clave' : 'resultados clave'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {initiativeCount}{' '}
              {initiativeCount === 1 ? 'iniciativa' : 'iniciativas'}
            </span>
          </div>
        </button>
        <div className="flex shrink-0 items-center pt-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10"
                aria-label={`Más acciones de ${objective.nombre_okr}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {objective.can_manage && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar objetivo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onHistory}>
                <History className="mr-2 h-4 w-4" />
                Ver historial
              </DropdownMenuItem>
              {canArchive && (
                <DropdownMenuItem onClick={onArchive}>Archivar</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2 border-t border-border/40 pt-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Gauge className="h-3.5 w-3.5" aria-hidden />
              </span>
              Resultados clave
              {results.length > 0 ? ` · ${results.length}` : ''}
            </h3>
            {canAddKr && (
              <Button variant="ghost" size="sm" className="h-9 px-2" onClick={onAddKr}>
                <Plus className="mr-1 h-4 w-4" />
                Agregar resultado
              </Button>
            )}
          </div>
          {!results.length ? (
            <p className="pb-1 text-sm text-muted-foreground">
              Este objetivo todavía no tiene resultados clave.
            </p>
          ) : (
            <div className="space-y-2.5">
              {results.map((kr) => (
                <OkrKeyResultRow
                  key={kr.id}
                  kr={kr}
                  objective={objective}
                  checkIns={data.checkIns}
                  initiatives={data.initiatives}
                  actions={actions}
                  actionsPending={actionsPending}
                  actionsError={actionsError}
                  busy={busy}
                  onCheckIn={() => onCheckIn(kr.id)}
                  onEdit={() => onEditKr(kr.id)}
                  onHistory={() => onKrHistory(kr.id)}
                  onLink={() => onLink(kr.id)}
                  onUnlink={onUnlink}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
