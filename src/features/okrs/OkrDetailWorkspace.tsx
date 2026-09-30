import { useMemo, useState } from 'react'
import {
  Building2,
  CalendarRange,
  ChevronDown,
  Link2,
  Plus,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  krProgress,
  objectiveProgress,
  type ActionOption,
  type CheckIn,
  type KeyResult,
  type Objective,
  type OkrData,
} from './model'
import { OkrHistoryChart } from './OkrHistoryChart'
import { LinkedInitiativeRow } from './OkrInitiativeVisuals'
import {
  OkrScopeGroupHeader,
  RingProgress,
  calendarDaysBetween,
  metricText,
  partitionObjectivesByScope,
  periodRangeText,
  progressTone,
  toneTextClass,
} from './okrPresentation'
import { measurementsFor, reportDate, reportTimestamp } from './reporting'

export function OkrDetailWorkspace({
  objectives,
  data,
  actions,
  onAddInitiative,
  onLink,
}: {
  objectives: Objective[]
  data: OkrData
  actions: ActionOption[]
  onAddInitiative: (objective: Objective, krId: string) => void
  onLink: (objective: Objective, krId: string) => void
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const groups = useMemo(() => {
    const visible = objectives.filter((objective) =>
      data.keyResults.some((kr) => kr.okr_id === objective.id)
    )
    return partitionObjectivesByScope(
      visible,
      (objective) =>
        data.areas.find((area) => area.id === objective.area_id)?.nombre ??
        'Equipo'
    )
  }, [objectives, data.keyResults, data.areas])

  const total = groups.company.length + groups.team.length
  if (!total) return null

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderItems(items: Objective[]) {
    return items.map((objective) => (
      <ObjectiveDetailItem
        key={objective.id}
        objective={objective}
        data={data}
        actions={actions}
        open={openIds.has(objective.id)}
        onToggle={() => toggle(objective.id)}
        onAddInitiative={(krId) => onAddInitiative(objective, krId)}
        onLink={(krId) => onLink(objective, krId)}
      />
    ))
  }

  return (
    <section
      aria-label="Detalle de objetivos"
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
    >
      <header className="flex items-center gap-2 border-b border-border/50 px-4 py-3 sm:px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <TrendingUp
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight sm:text-[15px]">
            Detalle por objetivo
          </h2>
          <p className="text-xs text-muted-foreground">
            Agrupado por OKR de empresa y de equipo
          </p>
        </div>
      </header>

      {groups.company.length > 0 ? (
        <div>
          <OkrScopeGroupHeader
            icon={Building2}
            title="OKR Empresa"
            count={groups.company.length}
          />
          {renderItems(groups.company)}
        </div>
      ) : null}

      {groups.team.length > 0 ? (
        <div>
          <OkrScopeGroupHeader
            icon={Users}
            title="OKR Equipo"
            count={groups.team.length}
          />
          {renderItems(groups.team)}
        </div>
      ) : null}
    </section>
  )
}

function ObjectiveDetailItem({
  objective,
  data,
  actions,
  open,
  onToggle,
  onAddInitiative,
  onLink,
}: {
  objective: Objective
  data: OkrData
  actions: ActionOption[]
  open: boolean
  onToggle: () => void
  onAddInitiative: (krId: string) => void
  onLink: (krId: string) => void
}) {
  const [selectedKrId, setSelectedKrId] = useState<string | undefined>()
  const [chartOpen, setChartOpen] = useState(false)
  const results = data.keyResults.filter((kr) => kr.okr_id === objective.id)
  const selected =
    results.find((kr) => kr.id === selectedKrId) ?? results[0] ?? null
  const progress = results.length ? objectiveProgress(results) : null
  const today = new Date().toISOString().slice(0, 10)
  const daysLeft =
    objective.end_date != null
      ? calendarDaysBetween(today, objective.end_date)
      : null
  const tone = progress == null ? 'primary' : progressTone(progress)
  const scopeLabel =
    objective.scope === 'company'
      ? 'Empresa'
      : (data.areas.find((area) => area.id === objective.area_id)?.nombre ??
        'Equipo')
  const ScopeIcon = objective.scope === 'company' ? Building2 : Users
  const initiatives = selected
    ? data.initiatives.filter((item) => item.key_result_id === selected.id)
    : []
  const linked = initiatives.map((link) => ({
    link,
    action: actions.find(
      (action) =>
        action.id === (link.action_id ?? link.team_action_id) &&
        action.kind === (link.action_id ? 'company' : 'team')
    ),
  }))
  const activity = selected
    ? measurementsFor(data.checkIns, selected.id)
        .filter((item) => item.note !== 'Línea base inicial')
        .slice(0, 6)
    : []

  return (
    <article className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90'
          )}
          aria-hidden
        />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <ScopeIcon
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-tight sm:text-[15px]">
            {objective.nombre_okr}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {scopeLabel}
            {' · '}
            {periodRangeText(objective.start_date, objective.end_date)}
            {' · '}
            {results.length}{' '}
            {results.length === 1 ? 'resultado clave' : 'resultados clave'}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {progress == null ? '—' : `${Math.round(progress)}%`}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3 sm:px-5">
          {results.length > 1 && (
            <label className="flex max-w-md flex-col gap-1 text-xs text-muted-foreground">
              Resultado clave
              <select
                className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                value={selected?.id ?? ''}
                onChange={(event) => {
                  setSelectedKrId(event.target.value)
                  setChartOpen(false)
                }}
              >
                {results.map((kr) => (
                  <option key={kr.id} value={kr.id}>
                    {kr.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <RingProgress
                value={progress ?? 0}
                label="Progreso del objetivo"
                tone={tone === 'muted' ? 'primary' : tone}
                size={56}
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Progreso</p>
                <p
                  className={cn(
                    'mt-0.5 text-lg font-semibold tabular-nums',
                    toneTextClass(tone)
                  )}
                >
                  {selected
                    ? metricText(selected.current_value, selected.unit)
                    : progress == null
                      ? '—'
                      : `${Math.round(progress)}%`}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {progress == null
                    ? 'Sin avance medido'
                    : `${Math.round(progress)}% de la meta`}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Días restantes</p>
              <p
                className={cn(
                  'mt-1 text-2xl font-semibold tabular-nums',
                  toneTextClass(
                    daysLeft != null && daysLeft <= 14 ? 'warning' : 'success'
                  )
                )}
              >
                {daysLeft == null
                  ? '—'
                  : daysLeft < 0
                    ? 'Finalizado'
                    : `${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                {periodRangeText(objective.start_date, objective.end_date)}
              </p>
            </div>
          </div>

          {selected && (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <button
                type="button"
                aria-expanded={chartOpen}
                onClick={() => setChartOpen((value) => !value)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
              >
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  Gráfica · {selected.title}
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
                    key={selected.id}
                    title={selected.title}
                    measurements={measurementsFor(data.checkIns, selected.id)}
                    currentValue={selected.current_value}
                    unit={selected.unit}
                    baseline={selected.baseline_value}
                    target={selected.target_value}
                    progress={krProgress(selected)}
                    periodStart={objective.start_date}
                    periodEnd={objective.end_date}
                    users={data.users}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm sm:p-3.5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Link2
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden
                    />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold tracking-tight">
                      Iniciativas
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {linked.length === 0
                        ? 'Sin vínculos aún'
                        : `${linked.length} vinculada${linked.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>
                {selected?.can_update && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    aria-label="Vincular iniciativa"
                    onClick={() => onLink(selected.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {!linked.length ? (
                <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  Sin iniciativas vinculadas.
                  {selected?.can_update ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                        onClick={() => onAddInitiative(selected.id)}
                      >
                        Vincular una acción
                      </button>
                    </>
                  ) : null}
                </p>
              ) : (
                <ul className="space-y-2">
                  {linked.map(({ link, action }) => (
                    <li key={link.id}>
                      <LinkedInitiativeRow action={action} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border/60 p-3 sm:p-4">
              <h4 className="mb-3 text-sm font-semibold">Actividad</h4>
              {!activity.length ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay mediciones registradas en este KR.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((item) => (
                    <ActivityItem
                      key={item.id}
                      item={item}
                      kr={selected!}
                      users={data.users}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function ActivityItem({
  item,
  kr,
  users,
}: {
  item: CheckIn
  kr: KeyResult
  users: OkrData['users']
}) {
  const actor =
    users.find((user) => user.id === item.created_by)?.nombre ?? 'Usuario'
  const initials = actor
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <li className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {initials || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{actor}</p>
          <p className="text-xs text-muted-foreground">
            {reportTimestamp(item.created_at)}
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {metricText(item.value, item.unit_snapshot ?? kr.unit)}
        </span>
        {item.note ? (
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {item.note}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Medición del {reportDate(item.created_at.slice(0, 10))}.
          </p>
        )}
      </div>
    </li>
  )
}
