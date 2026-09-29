import { History, Link2, MoreHorizontal, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatMetric,
  krProgress,
  type ActionOption,
  type Initiative,
  type KeyResult,
  type Objective,
} from './model'
import type { CheckIn } from './model'
import { measurementLabel, measurementsFor } from './reporting'
import { LinkedInitiativeRow } from './OkrInitiativeVisuals'
import {
  KrTrajectory,
  lastMeasurementCaption,
  measurementHeadline,
  metricText,
  remainingToTargetCopy,
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
  onCheckIn: () => void
  onEdit: () => void
  onHistory: () => void
  onLink: () => void
  onUnlink: (id: string) => void
}) {
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
  const history = measurementsFor(checkIns, kr.id)
  const lastCheck = measurementLabel(kr, history)
  const canEdit = objective.can_manage && objective.activo && manual
  const storyLabel = measurementHeadline(
    kr.baseline_value,
    kr.target_value,
    kr.unit
  )
  const remaining = remainingToTargetCopy(kr)
  const updated = lastMeasurementCaption(lastCheck)
  const showStory =
    Boolean(storyLabel) &&
    kr.baseline_value != null &&
    kr.target_value != null &&
    !(
      kr.title.includes(formatMetric(kr.baseline_value)) &&
      kr.title.includes(formatMetric(kr.target_value))
    )

  return (
    <section className="min-w-0 rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0 items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
              KR
            </span>
            <h3 className="min-w-0 text-[15px] font-semibold leading-snug">
              {kr.title}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            {showStory ? (
              <p className="min-w-0 text-[13px] leading-snug text-muted-foreground">
                {storyLabel}
              </p>
            ) : (
              <span />
            )}
            <p className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">
                {Math.round(progress)}%
              </span>{' '}
              avance
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {kr.can_update && manual && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-2.5 text-[13px] font-medium"
              onClick={onCheckIn}
            >
              Actualizar avance
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                aria-label={`Más acciones de ${kr.title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Actual
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
            {metricText(kr.current_value, kr.unit)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Meta
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
            {metricText(kr.target_value, kr.unit)}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <KrTrajectory
          baseline={kr.baseline_value}
          current={kr.current_value}
          target={kr.target_value}
          unit={kr.unit}
          progress={progress}
          title={kr.title}
          history={history}
        />
      </div>

      {remaining && (
        <p className="mt-2 text-[13px] leading-snug text-foreground/80">
          {remaining}
        </p>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
        {updated}
      </p>

      <div className="mt-3 rounded-lg border border-dashed border-border/80 bg-background/80 px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Iniciativas
            {links.length > 0 ? ` · ${links.length}` : ''}
          </p>
          {kr.can_update && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={onLink}
            >
              <Link2 className="mr-1 h-3.5 w-3.5" />
              Vincular
            </Button>
          )}
        </div>
        {actionsPending && links.length > 0 && (
          <p className="mb-1.5 text-xs text-muted-foreground">
            Cargando estado de las iniciativas…
          </p>
        )}
        {actionsError && links.length > 0 && (
          <p className="mb-1.5 text-xs text-muted-foreground">
            No se pudo actualizar el estado de las iniciativas.
          </p>
        )}
        {unknown && (
          <p className="mb-1.5 text-xs text-muted-foreground">
            Hay acciones sin acceso; no se calcula un porcentaje parcial.
          </p>
        )}
        {links.length > 0 ? (
          <div className="space-y-1.5">
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
          <p className="px-0.5 py-1.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
            Todavía no hay iniciativas. Vincula una acción del Kanban para
            mostrar el trabajo que mueve este resultado.
          </p>
        )}
      </div>
    </section>
  )
}
