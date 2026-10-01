import {
  ChevronDown,
  Flag,
  History,
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
  ProgressBar,
  periodRangeText,
  periodTone,
  progressTone,
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
  highlightedKrId,
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
  highlightedKrId?: string | null
}) {
  const today = todayWallClockCDMX()
  const results = data.keyResults.filter((kr) => kr.okr_id === objective.id)
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
  const tone = progress == null ? 'primary' : progressTone(progress)

  return (
    <article
      id={`okr-objective-${objective.id}`}
      className="min-w-0 border-b border-border/50 last:border-b-0"
    >
      <div className="flex items-center gap-2 px-3 py-3.5 sm:gap-3 sm:px-4">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              !expanded && '-rotate-90'
            )}
            aria-hidden
          />
        </button>

        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400"
          aria-hidden
        >
          <Flag className="h-4 w-4" />
        </span>

        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className={periodTone(period)}>{period}</span>
            <span aria-hidden>·</span>
            <span>{scopeLabel}</span>
          </div>
          <h2 className="mt-0.5 truncate text-[15px] font-semibold leading-snug sm:text-base">
            {objective.nombre_okr}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {periodRangeText(objective.start_date, objective.end_date)}
          </p>
        </button>

        <div className="hidden w-40 shrink-0 sm:block">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Progreso</span>
            <span className="font-semibold tabular-nums">
              {progress == null ? '—' : `${Math.round(progress)}%`}
            </span>
          </div>
          {progress != null && (
            <div className="mt-1.5">
              <ProgressBar
                value={progress}
                label={`Avance de ${objective.nombre_okr}`}
                size="sm"
                tone={tone}
              />
            </div>
          )}
        </div>

        <span className="tabular-nums text-sm font-semibold sm:hidden">
          {progress == null ? '—' : `${Math.round(progress)}%`}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
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

      {expanded && (
        <div className="pb-3">
          <div className="mb-1 flex items-center justify-between gap-3 px-4 sm:px-5">
            <p className="text-xs font-medium text-muted-foreground">
              {results.length}{' '}
              {results.length === 1 ? 'resultado clave' : 'resultados clave'}
            </p>
            {canAddKr && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={onAddKr}
              >
                <Plus className="mr-1 h-4 w-4" />
                Agregar
              </Button>
            )}
          </div>
          {!results.length ? (
            <p className="px-4 pb-2 text-sm text-muted-foreground sm:px-5">
              Este objetivo todavía no tiene resultados clave.
            </p>
          ) : (
            <div>
              {results.map((kr) => (
                <OkrKeyResultRow
                  key={kr.id}
                  tree
                  kr={kr}
                  objective={objective}
                  checkIns={data.checkIns}
                  initiatives={data.initiatives}
                  actions={actions}
                  actionsPending={actionsPending}
                  actionsError={actionsError}
                  busy={busy}
                  highlighted={highlightedKrId === kr.id}
                  users={data.users}
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
