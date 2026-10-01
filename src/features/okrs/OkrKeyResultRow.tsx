import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  krProgress,
  type ActionOption,
  type CheckIn,
  type Initiative,
  type KeyResult,
  type Objective,
} from './model'
import { OkrHistoryChart } from './OkrHistoryChart'
import { measurementLabel, measurementsFor, reportDate, reportTimestamp } from './reporting'
import { LinkedInitiativeRow } from './OkrInitiativeVisuals'
import {
  ProgressBar,
  StatusSquare,
  lastMeasurementCaption,
  metricText,
  progressTone,
  toneTextClass,
} from './okrPresentation'

export function OkrKeyResultRow({
  kr,
  objective,
  checkIns,
  initiatives,
  actions,
  actionsPending,
  actionsError,
  busy,
  tree,
  highlighted,
  users,
  onCheckIn,
  onEdit,
  onHistory,
  onLink,
  onUnlink,
}: {
  kr: KeyResult
  objective: Objective
  checkIns: CheckIn[]
  initiatives: Initiative[]
  actions: ActionOption[]
  actionsPending: boolean
  actionsError: boolean
  busy: boolean
  /** Draw hierarchy connectors under an objective. */
  tree?: boolean
  highlighted?: boolean
  users: { id: string; nombre: string }[]
  onCheckIn: () => void
  onEdit: () => void
  onHistory: () => void
  onLink: () => void
  onUnlink: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [chartOpen, setChartOpen] = useState(true)
  useEffect(() => {
    if (highlighted) setOpen(true)
  }, [highlighted])
  const links = initiatives.filter((item) => item.key_result_id === kr.id)
  const linked = links.map((link) => ({
    link,
    action: actions.find(
      (action) =>
        action.id === (link.action_id ?? link.team_action_id) &&
        action.kind === (link.action_id ? 'company' : 'team')
    ),
  }))
  const unknown = linked.some((item) => !item.action)
  const manual = kr.metric_type.startsWith('manual:')
  const progress = krProgress(kr)
  const tone = progressTone(progress)
  const history = measurementsFor(checkIns, kr.id)
  const lastCheck = measurementLabel(kr, history)
  const canEdit = objective.can_manage && objective.activo && manual
  const currentLabel = metricText(kr.current_value, kr.unit)

  return (
    <section className={cn(tree && 'relative pl-6 sm:pl-8')}>
      {tree ? (
        <>
          <span
            aria-hidden
            className="absolute bottom-0 left-3 top-0 w-px bg-border sm:left-4"
          />
          <span
            aria-hidden
            className="absolute left-3 top-5 h-px w-3 bg-border sm:left-4 sm:w-4"
          />
        </>
      ) : null}

      <div className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-2.5 hover:bg-muted/40 sm:gap-3 sm:px-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Ocultar detalle del KR' : 'Ver detalle del KR'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              open && 'rotate-90'
            )}
            aria-hidden
          />
        </button>

        <StatusSquare tone={tone} />

        <button
          type="button"
          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((value) => !value)}
        >
          <p className="truncate text-sm font-medium leading-snug sm:text-[15px]">
            {kr.title}
          </p>
        </button>

        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
            title="Dueño del KR"
            aria-hidden
          >
            KR
          </span>
          <div className="w-36 min-w-0">
            <p
              className={cn(
                'truncate text-right text-xs font-semibold tabular-nums',
                toneTextClass(tone)
              )}
            >
              {currentLabel}
            </p>
            <div className="mt-1">
              <ProgressBar
                value={progress}
                label={`Avance de ${kr.title}`}
                size="sm"
                tone={tone}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:hidden">
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              toneTextClass(tone)
            )}
          >
            {Math.round(progress)}%
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              aria-label={`Más acciones de ${kr.title}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {kr.can_update && manual && (
              <DropdownMenuItem onClick={onCheckIn}>
                Actualizar avance
              </DropdownMenuItem>
            )}
            {canEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
            )}
            {kr.can_update && (
              <DropdownMenuItem onClick={onLink}>
                <Link2 className="mr-2 h-4 w-4" />
                Vincular iniciativa
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onHistory}>
              <History className="mr-2 h-4 w-4" />
              Ver historial
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div className="mb-2 ml-8 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:ml-10 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Actual</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">
                  {metricText(kr.current_value, kr.unit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Meta</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">
                  {metricText(kr.target_value, kr.unit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avance</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">
                  {Math.round(progress)}%
                </p>
              </div>
            </div>
            {kr.can_update && manual && (
              <Button
                type="button"
                className="h-11 shrink-0 sm:mt-1"
                onClick={onCheckIn}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar avance
              </Button>
            )}
          </div>
          <ProgressBar
            value={progress}
            label={`Avance de ${kr.title}`}
            tone={tone}
          />
          <p className="text-xs text-muted-foreground">
            {lastMeasurementCaption(lastCheck)}
          </p>

          <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
            <button
              type="button"
              aria-expanded={chartOpen}
              onClick={() => setChartOpen((value) => !value)}
              className="flex w-full items-center gap-2.5 px-3 py-3 text-left outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
                <TrendingUp className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-tight">
                  Gráfica de avance
                </span>
                <span className="block text-xs text-muted-foreground">
                  {chartOpen ? 'Ocultar evolución' : 'Ver evolución del resultado'}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  !chartOpen && '-rotate-90'
                )}
                aria-hidden
              />
            </button>
            {chartOpen && (
              <div className="border-t border-border/50 p-3 sm:p-4">
                <OkrHistoryChart
                  key={kr.id}
                  title={kr.title}
                  measurements={history}
                  currentValue={kr.current_value}
                  unit={kr.unit}
                  baseline={kr.baseline_value}
                  target={kr.target_value}
                  progress={progress}
                  periodStart={objective.start_date}
                  periodEnd={objective.end_date}
                  users={users}
                />
              </div>
            )}
          </div>

          <KrActivity
            items={history.filter((item) => item.note !== 'Línea base inicial').slice(0, 4)}
            kr={kr}
            users={users}
          />

          <div className="space-y-3 rounded-2xl border border-border/70 bg-background p-3 shadow-sm sm:p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Link2
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-tight">
                    Iniciativas
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {links.length === 0
                      ? 'Sin vínculos aún'
                      : `${links.length} vinculada${links.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              {kr.can_update && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={onLink}
                >
                  Vincular
                </Button>
              )}
            </div>
            {actionsPending && links.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Cargando estado de las iniciativas…
              </p>
            )}
            {actionsError && links.length > 0 && (
              <p className="text-xs text-muted-foreground">
                No se pudo actualizar el estado de las iniciativas.
              </p>
            )}
            {unknown && (
              <p className="text-xs text-muted-foreground">
                Hay acciones sin acceso; no se calcula un porcentaje parcial.
              </p>
            )}
            {links.length > 0 ? (
              <div className="space-y-2">
                {linked.map(({ link, action }) => (
                  <LinkedInitiativeRow
                    key={link.id}
                    action={action}
                    busy={busy}
                    canUnlink={kr.can_update}
                    onUnlink={() => onUnlink(link.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                Todavía no hay iniciativas vinculadas a este resultado.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function KrActivity({
  items,
  kr,
  users,
}: {
  items: CheckIn[]
  kr: KeyResult
  users: { id: string; nombre: string }[]
}) {
  if (!items.length) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">Actividad</p>
      <ul className="space-y-2">
        {items.map((item) => {
          const actor =
            users.find((user) => user.id === item.created_by)?.nombre ?? 'Usuario'
          return (
            <li
              key={item.id}
              className="rounded-lg border border-border/60 bg-background px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-medium">{actor}</p>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums">
                  {metricText(item.value, item.unit_snapshot ?? kr.unit)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {reportTimestamp(item.created_at)}
                {item.note ? ` · ${item.note}` : ` · Medición del ${reportDate(item.created_at.slice(0, 10))}`}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
