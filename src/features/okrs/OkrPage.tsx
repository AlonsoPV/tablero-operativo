import { OkrReportHistory } from './OkrReportHistory'
import { reportingSummary } from './reporting'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Search,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AccionFormDialog } from '@/features/operations/components/AccionFormDialog'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants'
import { okrService } from './service'
import { KeyResultForm, ObjectiveForm } from './OkrForms'
import { useRouteAccess } from '@/features/auth/hooks/useRouteAccess'
import { TeamInitiativeCreator } from './TeamInitiativeCreator'
import {
  OkrExecutionSummary,
  planTimelineMetrics,
} from './OkrExecutionSummary'
import { OkrObjectiveCard } from './OkrObjectiveCard'
import { OkrKpiStrip } from './OkrKpiStrip'
import { OkrDetailWorkspace } from './OkrDetailWorkspace'
import { OkrLinkInitiativePanel } from './OkrLinkInitiativePanel'
import { ProgressBar, toolbarField, toolbarInput } from './okrPresentation'
import {
  krProgress,
  objectivePeriod,
  type KeyResult,
  type Objective,
  type OkrData,
  type ActionOption,
} from './model'

const control =
  'min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm'
type Modal =
  | { type: 'objective'; objective?: Objective }
  | { type: 'kr'; objective: Objective; kr?: KeyResult; followUp?: boolean }
  | {
      type: 'checkin' | 'history' | 'link'
      objective: Objective
      kr: KeyResult
    }

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}

function FilterControl({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn(toolbarField, className)}>
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function OkrPage() {
  const { canAccessRoute } = useRouteAccess()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['okrs'],
    queryFn: okrService.dashboard,
    refetchInterval: 60000,
  })
  const actions = useQuery({
    queryKey: ['okr-actions'],
    queryFn: okrService.actions,
    refetchInterval: 60000,
  })
  const [historySelection, setHistorySelection] = useState<{
    objective: Objective
    krId?: string
  } | null>(null)
  const [modal, setModal] = useState<Modal | null>(null)
  const [createAction, setCreateAction] = useState(false)
  const [resumeLink, setResumeLink] = useState<Modal | null>(null)
  const [scope, setScope] = useState('all')
  const [period, setPeriod] = useState('all')
  const [area, setArea] = useState('all')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const today = todayWallClockCDMX()
  const hasFilters =
    scope !== 'all' ||
    period !== 'all' ||
    area !== 'all' ||
    Boolean(search || from || to)
  function clearFilters() {
    setScope('all')
    setPeriod('all')
    setArea('all')
    setSearch('')
    setFrom('')
    setTo('')
    setSearchParams({})
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['okrs'] }),
      qc.invalidateQueries({ queryKey: ['okr-actions'] }),
      qc.invalidateQueries({ queryKey: ['okr-action-links'] }),
      qc.invalidateQueries({ queryKey: ['okr-report-history'] }),
    ])
  }
  function closeActionCreator() {
    setCreateAction(false)
    if (resumeLink) {
      setModal(resumeLink)
      setResumeLink(null)
      void refresh()
    }
  }
  async function unlink(id: string) {
    setBusy(true)
    try {
      await okrService.unlink(id)
      await refresh()
      toast.success('Iniciativa desvinculada')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo desvincular'
      )
    } finally {
      setBusy(false)
    }
  }

  const focusedObjectiveId =
    modal && 'objective' in modal ? modal.objective?.id : undefined
  // Expand only when editing/creating via modal — list stays collapsed on load.
  useEffect(() => {
    if (!focusedObjectiveId) return
    setExpandedIds((current) => {
      if (current.has(focusedObjectiveId)) return current
      const next = new Set(current)
      next.add(focusedObjectiveId)
      return next
    })
  }, [focusedObjectiveId])

  async function archiveObjective(objective: Objective) {
    if (
      !objective.owner_user_id ||
      !objective.start_date ||
      !objective.end_date
    ) {
      setModal({ type: 'objective', objective })
      return
    }
    try {
      await okrService.saveObjective(
        {
          nombre_okr: objective.nombre_okr,
          descripcion: objective.descripcion ?? '',
          scope: objective.scope,
          area_id: objective.area_id,
          owner_user_id: objective.owner_user_id,
          start_date: objective.start_date,
          end_date: objective.end_date,
          activo: false,
        },
        objective.id
      )
      await refresh()
      toast.success('Objetivo archivado')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo archivar'
      )
    }
  }

  if (query.isPending)
    return (
      <p className="p-6" role="status">
        Cargando objetivos…
      </p>
    )
  if (query.isError)
    return (
      <div className="space-y-3 p-6" role="alert">
        <h1 className="text-xl font-semibold">
          No se pudieron cargar los OKRs
        </h1>
        <p>{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>Reintentar</Button>
      </div>
    )
  const data = query.data
  const filtered = data.objectives.filter(
    (o) =>
      (!searchParams.get('objective') ||
        o.id === searchParams.get('objective')) &&
      (scope === 'all' || o.scope === scope) &&
      (area === 'all' || o.area_id === area) &&
      (period === 'all' || objectivePeriod(o, today) === period) &&
      (!from || (o.end_date != null && o.end_date >= from)) &&
      (!to || (o.start_date != null && o.start_date <= to)) &&
      o.nombre_okr
        .toLocaleLowerCase('es')
        .includes(search.toLocaleLowerCase('es'))
  )
  const canCreate =
    data.can_manage_company || data.areas.some((item) => item.can_manage)
  const report = reportingSummary(filtered, data)
  const filteredKrIds = new Set(filtered.map((item) => item.id))
  const filteredKeyResults = data.keyResults.filter((kr) =>
    filteredKrIds.has(kr.okr_id)
  )
  const initiativesForScope = data.initiatives.filter((item) =>
    filteredKeyResults.some((kr) => kr.id === item.key_result_id)
  )
  const initiativesDone = initiativesForScope.filter((item) => {
    const action = (actions.data ?? []).find(
      (option) =>
        option.id === (item.action_id ?? item.team_action_id) &&
        option.kind === (item.action_id ? 'company' : 'team')
    )
    return Boolean(action?.closed)
  }).length
  const onTrackShare = filteredKeyResults.length
    ? (filteredKeyResults.filter((kr) => krProgress(kr) >= 70).length /
        filteredKeyResults.length) *
      100
    : null
  const timeline = planTimelineMetrics(filtered, today)
  const focusedObjective =
    filtered.find((item) => item.id === searchParams.get('objective')) ??
    filtered.find((item) => expandedIds.has(item.id)) ??
    filtered.find((item) => item.can_manage && item.activo) ??
    filtered[0] ??
    null

  return (
    <TooltipProvider delayDuration={120}>
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 [&_button]:min-h-11 [&_button]:touch-manipulation">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-[1.35rem]">
            Objetivos y resultados clave
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Plan, avance e iniciativas en una sola vista.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAccessRoute(ROUTES.DASHBOARD) && (
            <Button asChild variant="outline">
              <Link to={`${ROUTES.DASHBOARD}?tab=okrs`}>Reportes</Link>
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                aria-label="Actualizar OKRs"
                disabled={query.isFetching || actions.isFetching}
                onClick={() => void refresh()}
              >
                <RefreshCw
                  className={cn(
                    'h-4 w-4',
                    (query.isFetching || actions.isFetching) && 'animate-spin'
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Actualizar</TooltipContent>
          </Tooltip>
          {canCreate && (
            <Button
              className="flex-1 sm:flex-none"
              onClick={() => setModal({ type: 'objective' })}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo objetivo
            </Button>
          )}
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <OkrExecutionSummary
          daysLeft={timeline.daysLeft}
          timelineProgress={timeline.timelineProgress}
          averageProgress={report.average}
          initiativesDone={initiativesDone}
          initiativesTotal={initiativesForScope.length}
          onTrackShare={onTrackShare}
        />

        <section
          aria-label="Filtros de objetivos"
          className="space-y-2 border-t border-border/50 px-3 py-3 sm:px-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className={cn(toolbarField, 'min-w-[12rem] flex-1')}>
              <Search
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="sr-only">Buscar objetivo</span>
              <input
                className={toolbarInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar objetivo..."
              />
            </label>
            <p
              aria-live="polite"
              className="inline-flex min-h-11 items-center rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground"
            >
              {filtered.length} {filtered.length === 1 ? 'objetivo' : 'objetivos'}
            </p>
            {hasFilters && (
              <button
                type="button"
                className="min-h-11 px-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                onClick={clearFilters}
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterControl className="min-w-[9.5rem] flex-1 basis-[9.5rem]" label="Estado">
              <select
                className={cn(toolbarInput, 'truncate')}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="all">Todos</option>
                {[
                  'Programado',
                  'Activo',
                  'Finalizado',
                  'Archivado',
                  'Sin periodo',
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </FilterControl>
            <FilterControl className="min-w-[9.5rem] flex-1 basis-[9.5rem]" label="Ámbito">
              <select
                className={cn(toolbarInput, 'truncate')}
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value)
                  if (e.target.value === 'company') setArea('all')
                }}
              >
                <option value="all">Todos</option>
                <option value="company">Empresa</option>
                <option value="team">Equipo</option>
              </select>
            </FilterControl>
            <FilterControl className="min-w-[9.5rem] flex-1 basis-[9.5rem]" label="Equipo">
              <select
                className={cn(toolbarInput, 'truncate')}
                value={area}
                disabled={scope === 'company'}
                onChange={(e) => setArea(e.target.value)}
              >
                <option value="all">Todos</option>
                {data.areas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </FilterControl>
            <FilterControl className="min-w-[9.5rem] flex-1 basis-[9.5rem]" label="Desde">
              <input
                className={toolbarInput}
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </FilterControl>
            <FilterControl className="min-w-[9.5rem] flex-1 basis-[9.5rem]" label="Hasta">
              <input
                className={toolbarInput}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </FilterControl>
          </div>
        </section>
      </div>
      {searchParams.has('objective') && (
        <Button variant="outline" onClick={clearFilters}>
          Ver todos los objetivos
        </Button>
      )}
      {actions.isError && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm"
        >
          No se pudieron cargar las acciones: {actions.error.message}{' '}
          <button className="underline" onClick={() => void actions.refetch()}>
            Reintentar
          </button>
        </p>
      )}
      {!filtered.length && (
        <div className="rounded-2xl border border-border/70 bg-card px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">
            {data.objectives.length
              ? 'No encontramos objetivos con estos filtros'
              : 'Aún no tienes objetivos para este periodo.'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {data.objectives.length
              ? 'Cambia la búsqueda o limpia los filtros para ver los demás objetivos.'
              : 'Define qué quieres lograr, para cuándo y cómo medirás el resultado.'}
          </p>
          <div className="mt-5">
            {data.objectives.length ? (
              <Button variant="outline" onClick={clearFilters}>
                Mostrar todos
              </Button>
            ) : (
              canCreate && (
                <Button onClick={() => setModal({ type: 'objective' })}>
                  Crear primer objetivo
                </Button>
              )
            )}
          </div>
        </div>
      )}

      {filteredKeyResults.length > 0 && (
        <OkrDetailWorkspace
          objectives={filtered}
          data={data}
          actions={actions.data ?? []}
          onAddInitiative={(objective, krId) => {
            const kr = data.keyResults.find((item) => item.id === krId)
            if (kr) setModal({ type: 'link', objective, kr })
          }}
          onLink={(objective, krId) => {
            const kr = data.keyResults.find((item) => item.id === krId)
            if (kr) setModal({ type: 'link', objective, kr })
          }}
        />
      )}

      {filtered.length > 0 && (
        <section
          aria-label="Árbol de objetivos"
          className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
        >
          <div className="border-b border-border/50 px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold tracking-tight">
              Objetivos
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Expande cada objetivo para ver sus resultados clave.
            </p>
          </div>
          <div>
            {filtered.map((objective) => {
              const krFor = (id: string) =>
                data.keyResults.find((item) => item.id === id)
              return (
                <OkrObjectiveCard
                  key={objective.id}
                  objective={objective}
                  data={data}
                  actions={actions.data ?? []}
                  actionsPending={actions.isPending}
                  actionsError={actions.isError}
                  busy={busy}
                  expanded={expandedIds.has(objective.id)}
                  onExpandedChange={(open) => {
                    setExpandedIds((current) => {
                      const next = new Set(current)
                      if (open) next.add(objective.id)
                      else next.delete(objective.id)
                      return next
                    })
                  }}
                  onEdit={() => setModal({ type: 'objective', objective })}
                  onHistory={() => setHistorySelection({ objective })}
                  onArchive={() => void archiveObjective(objective)}
                  onAddKr={() => setModal({ type: 'kr', objective })}
                  onCheckIn={(krId) => {
                    const kr = krFor(krId)
                    if (kr) setModal({ type: 'checkin', objective, kr })
                  }}
                  onEditKr={(krId) => {
                    const kr = krFor(krId)
                    if (kr) setModal({ type: 'kr', objective, kr })
                  }}
                  onKrHistory={(krId) =>
                    setHistorySelection({ objective, krId })
                  }
                  onLink={(krId) => {
                    const kr = krFor(krId)
                    if (kr) setModal({ type: 'link', objective, kr })
                  }}
                  onUnlink={(id) => void unlink(id)}
                />
              )
            })}
          </div>
        </section>
      )}

      {filteredKeyResults.length > 0 && (
        <OkrKpiStrip
          keyResults={filteredKeyResults}
          objectives={filtered}
          checkIns={data.checkIns}
          canAdd={canCreate}
          onAdd={() => {
            const target =
              focusedObjective ??
              filtered.find((item) => item.can_manage && item.activo)
            if (target) setModal({ type: 'kr', objective: target })
            else setModal({ type: 'objective' })
          }}
          onOpen={(kr) => {
            const objective = filtered.find((item) => item.id === kr.okr_id)
            if (!objective) return
            setExpandedIds((current) => {
              const next = new Set(current)
              next.add(objective.id)
              return next
            })
            setSearchParams({ objective: objective.id })
          }}
        />
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open && !editorSaving) setModal(null)
        }}
      >
        <DialogContent
          showClose={!editorSaving}
          onInteractOutside={(event) => {
            if (editorSaving) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (editorSaving) event.preventDefault()
          }}
          className="flex max-h-[min(92dvh,48rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-sm sm:max-w-xl [&_button]:min-h-11 [&_button]:touch-manipulation"
        >
          {modal?.type === 'objective' ? (
            <ObjectiveForm
              key={modal.objective?.id ?? 'new-objective'}
              objective={modal.objective}
              areas={data.areas}
              users={data.users}
              canManageCompany={data.can_manage_company}
              scopeLocked={
                Boolean(modal.objective) &&
                data.keyResults.some(
                  (item) => item.okr_id === modal.objective?.id
                )
              }
              onCancel={() => setModal(null)}
              onSavingChange={setEditorSaving}
              onSubmit={async (values) => {
                const editing = Boolean(modal.objective)
                const savedId = await okrService.saveObjective(
                  values,
                  modal.objective?.id
                )
                await refresh()
                if (!editing) {
                  const updated = qc
                    .getQueryData<OkrData>(['okrs'])
                    ?.objectives.find((item) => item.id === savedId)
                  clearFilters()
                  setSearchParams({ objective: savedId })
                  setModal(
                    updated
                      ? { type: 'kr', objective: updated, followUp: true }
                      : null
                  )
                  toast.success('Objetivo creado. Ahora define cómo medirlo.')
                } else {
                  toast.success('Objetivo actualizado')
                  setModal(null)
                }
              }}
            />
          ) : modal?.type === 'kr' ? (
            <KeyResultForm
              key={`${modal.objective.id}-${modal.kr?.id ?? 'new-kr'}`}
              objective={modal.objective}
              areaName={
                data.areas.find((area) => area.id === modal.objective.area_id)
                  ?.nombre ?? null
              }
              kr={modal.kr}
              users={data.users}
              followUp={modal.followUp}
              onCancel={() => setModal(null)}
              onSavingChange={setEditorSaving}
              onSubmit={async (values) => {
                await okrService.saveKeyResult(
                  modal.objective.id,
                  values,
                  modal.kr?.id
                )
                await refresh()
                if (modal.kr) {
                  toast.success('Resultado clave actualizado')
                  setModal(null)
                }
              }}
            />
          ) : modal ? (
            <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
              <OkrEditor
                key={`${modal.type}-${modal.kr.id}`}
                modal={modal}
                data={data}
                actions={actions.data ?? []}
                actionsReady={actions.isSuccess}
                onSavingChange={setEditorSaving}
                onCancel={() => setModal(null)}
                onSaved={async () => {
                  await refresh()
                  setModal(null)
                }}
                onCreateAction={() => {
                  setResumeLink(modal)
                  setModal(null)
                  setCreateAction(true)
                }}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {historySelection && (
        <OkrReportHistory
          objective={historySelection.objective}
          initialKrId={historySelection.krId}
          data={data}
          onClose={() => setHistorySelection(null)}
        />
      )}
      {createAction && resumeLink?.objective?.area_id ? (
        <TeamInitiativeCreator
          areaId={resumeLink.objective.area_id}
          areaName={
            data.areas.find((a) => a.id === resumeLink.objective?.area_id)
              ?.nombre ?? 'Equipo'
          }
          onClose={closeActionCreator}
          onDone={refresh}
        />
      ) : createAction ? (
        <AccionFormDialog
          open={createAction}
          onOpenChange={(open) => {
            if (!open) closeActionCreator()
          }}
          onSuccess={() => void refresh()}
        />
      ) : null}
    </main>
    </TooltipProvider>
  )
}

function OkrEditor({
  modal,
  data,
  actions,
  actionsReady,
  onSaved,
  onCreateAction,
  onSavingChange,
  onCancel,
}: {
  modal: Modal
  data: OkrData
  actions: ActionOption[]
  actionsReady: boolean
  onSaved: (newObjectiveId?: string) => Promise<void>
  onCreateAction: () => void
  onSavingChange: (saving: boolean) => void
  onCancel: () => void
}) {
  const [scope, setScope] = useState(
    modal.objective?.scope ?? (data.can_manage_company ? 'company' : 'team')
  )
  const [startDate, setStartDate] = useState(
    modal.objective?.start_date ?? todayWallClockCDMX()
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedAction, setSelectedAction] = useState('')
  const [measurement, setMeasurement] = useState(
    'kr' in modal
      ? String(modal.kr?.current_value ?? modal.kr?.baseline_value ?? '')
      : ''
  )
  const kr = 'kr' in modal ? modal.kr : undefined
  const titles = {
    objective: modal.objective ? 'Editar objetivo' : 'Nuevo objetivo',
    kr: kr ? 'Editar resultado clave' : 'Nuevo resultado clave',
    checkin: 'Registrar medición',
    history: 'Historial de mediciones',
    link: 'Vincular iniciativa',
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setSaving(true)
    onSavingChange(true)
    setError('')
    try {
      let newObjectiveId: string | undefined
      if (modal.type === 'objective') {
        const savedId = await okrService.saveObjective(
          {
            ...values,
            scope,
            area_id: scope === 'team' ? values.area_id : null,
            activo: values.activo === 'true',
          },
          modal.objective?.id
        )
        if (!modal.objective) newObjectiveId = savedId
      }
      if (modal.type === 'kr') {
        if (Number(values.baseline_value) === Number(values.target_value))
          throw new Error('La meta debe ser distinta de la línea base.')
        await okrService.saveKeyResult(
          modal.objective.id,
          {
            ...values,
            baseline_value: Number(values.baseline_value),
            target_value: Number(values.target_value),
          },
          modal.kr?.id
        )
      }
      if (modal.type === 'checkin')
        await okrService.checkIn(
          modal.kr.id,
          Number(values.value),
          String(values.note ?? '')
        )
      if (modal.type === 'link') {
        const action = actions.find(
          (a) => `${a.kind}:${a.id}` === selectedAction
        )
        if (!action) throw new Error('Selecciona una acción.')
        await okrService.link(modal.kr.id, action)
      }
      toast.success('Cambios guardados')
      await onSaved(newObjectiveId)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar los cambios'
      )
    } finally {
      setSaving(false)
      onSavingChange(false)
    }
  }

  const scopeLocked =
    modal.type === 'objective' &&
    data.keyResults.some((item) => item.okr_id === modal.objective?.id)
  const available =
    modal.type === 'link'
      ? actions.filter(
          (a) =>
            (!modal.objective.area_id ||
              a.area_id === modal.objective.area_id) &&
            !data.initiatives.some(
              (i) =>
                i.key_result_id === modal.kr.id &&
                (a.kind === 'company' ? i.action_id : i.team_action_id) === a.id
            ) &&
            a.title
              .toLocaleLowerCase('es')
              .includes(search.toLocaleLowerCase('es'))
        )
      : []

  return (
    <>
      <DialogTitle className="flex items-center gap-2">
        {modal.type === 'link' && (
          <Link2 className="h-5 w-5 text-primary" aria-hidden />
        )}
        {titles[modal.type]}
      </DialogTitle>
      {modal.type === 'link' ? (
        <DialogDescription className="sr-only">
          Elige una acción para convertirla en iniciativa de {kr?.title}.
        </DialogDescription>
      ) : (
        <DialogDescription className="break-words pr-4">
          {kr?.title ??
            (modal.type === 'kr'
              ? `Objetivo: ${modal.objective.nombre_okr}`
              : 'Define el resultado que quieres alcanzar y su periodo de seguimiento.')}
        </DialogDescription>
      )}
      {modal.type === 'history' ? (
        <div className="space-y-3">
          {!data.checkIns.some((c) => c.key_result_id === modal.kr.id) && (
            <p className="text-sm text-muted-foreground">
              Sin mediciones manuales registradas.
            </p>
          )}
          {data.checkIns
            .filter((c) => c.key_result_id === modal.kr.id)
            .map((c) => (
              <div key={c.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-3">
                  <strong>
                    {c.value} {modal.kr.unit}
                  </strong>
                  <time dateTime={c.created_at}>
                    {new Date(c.created_at).toLocaleString('es-MX', {
                      timeZone: 'America/Mexico_City',
                    })}
                  </time>
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.users.find((u) => u.id === c.created_by)?.nombre ??
                    'Usuario'}
                </p>
                {c.note && (
                  <p className="mt-2 whitespace-pre-wrap break-words">
                    {c.note}
                  </p>
                )}
              </div>
            ))}
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
            {modal.type === 'objective' && (
              <>
                <Field label="Objetivo">
                  <input
                    autoFocus
                    name="nombre_okr"
                    className={control}
                    required
                    minLength={3}
                    maxLength={250}
                    defaultValue={modal.objective?.nombre_okr}
                  />
                </Field>
                <Field label="Descripción">
                  <textarea
                    name="descripcion"
                    className={control}
                    rows={3}
                    defaultValue={modal.objective?.descripcion ?? ''}
                  />
                </Field>
                <Field label="Ámbito">
                  <select
                    className={control}
                    value={scope}
                    disabled={scopeLocked}
                    onChange={(e) =>
                      setScope(e.target.value as 'company' | 'team')
                    }
                  >
                    {(data.can_manage_company || scope === 'company') && (
                      <option value="company">Empresa</option>
                    )}
                    <option value="team">Equipo</option>
                  </select>
                </Field>
                {scopeLocked && (
                  <p className="text-xs text-muted-foreground">
                    El ámbito permanece fijo porque este objetivo ya tiene KRs.
                    Puedes editar el nombre y las fechas.
                  </p>
                )}
                {scope === 'team' && (
                  <Field label="Equipo">
                    <select
                      name="area_id"
                      className={control}
                      required
                      defaultValue={modal.objective?.area_id ?? ''}
                      disabled={scopeLocked}
                    >
                      <option value="">Seleccionar equipo</option>
                      {data.areas
                        .filter((a) => a.can_manage)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                    </select>
                    {scopeLocked && (
                      <input
                        type="hidden"
                        name="area_id"
                        value={modal.objective?.area_id ?? ''}
                      />
                    )}
                  </Field>
                )}
                <Field label="Responsable del objetivo">
                  <select
                    name="owner_user_id"
                    className={control}
                    required
                    defaultValue={modal.objective?.owner_user_id ?? ''}
                  >
                    <option value="">Seleccionar usuario</option>
                    {data.users.map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fecha de inicio">
                    <input
                      name="start_date"
                      type="date"
                      required
                      className={control}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Fecha de fin">
                    <input
                      name="end_date"
                      type="date"
                      required
                      min={startDate}
                      className={control}
                      defaultValue={modal.objective?.end_date ?? ''}
                    />
                  </Field>
                </div>
                <Field label="Disponibilidad">
                  <select
                    name="activo"
                    className={control}
                    defaultValue={String(modal.objective?.activo ?? true)}
                  >
                    <option value="true">Habilitado según su periodo</option>
                    <option value="false">Archivado</option>
                  </select>
                </Field>
              </>
            )}
            {modal.type === 'kr' && (
              <>
                <Field label="Resultado clave">
                  <input
                    autoFocus
                    name="title"
                    required
                    minLength={3}
                    maxLength={250}
                    className={control}
                    defaultValue={kr?.title}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Línea base">
                    <input
                      name="baseline_value"
                      required
                      type="number"
                      step="any"
                      className={control}
                      defaultValue={kr?.baseline_value ?? ''}
                    />
                  </Field>
                  <Field label="Meta">
                    <input
                      name="target_value"
                      required
                      type="number"
                      step="any"
                      className={control}
                      defaultValue={kr?.target_value ?? ''}
                    />
                  </Field>
                </div>
                <Field label="Unidad de medida">
                  <input
                    name="unit"
                    className={control}
                    maxLength={50}
                    placeholder="%, días, entregas…"
                    defaultValue={kr?.unit ?? ''}
                  />
                </Field>
                <Field label="Dueño del KR">
                  <select
                    name="owner_user_id"
                    className={control}
                    required
                    defaultValue={kr?.owner_user_id ?? ''}
                  >
                    <option value="">Seleccionar usuario</option>
                    {data.users.map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-xs text-muted-foreground">
                  El avance se calcula desde la línea base hasta la meta, tanto
                  para aumentar como para reducir un indicador. El KR utiliza el
                  periodo del objetivo.
                </p>
              </>
            )}
            {modal.type === 'checkin' && (
              <>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p>
                    Línea base:{' '}
                    <strong>
                      {modal.kr.baseline_value} {modal.kr.unit}
                    </strong>{' '}
                    → Meta:{' '}
                    <strong>
                      {modal.kr.target_value} {modal.kr.unit}
                    </strong>
                  </p>
                </div>
                <Field label={`Valor actual (${modal.kr.unit || 'unidades'})`}>
                  <input
                    autoFocus
                    name="value"
                    required
                    type="number"
                    step="any"
                    className={control}
                    value={measurement}
                    onChange={(event) => setMeasurement(event.target.value)}
                  />
                </Field>
                {measurement !== '' && Number.isFinite(Number(measurement)) && (
                  <div aria-live="polite" className="space-y-1.5">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        Avance con esta medición
                      </span>
                      <strong className="tabular-nums">
                        {Math.round(
                          krProgress({
                            ...modal.kr,
                            current_value: Number(measurement),
                          })
                        )}
                        %
                      </strong>
                    </div>
                    <ProgressBar
                      value={krProgress({
                        ...modal.kr,
                        current_value: Number(measurement),
                      })}
                      label="Avance con esta medición"
                    />
                  </div>
                )}
                <Field label="Nota de seguimiento">
                  <textarea
                    name="note"
                    rows={3}
                    className={control}
                    placeholder="¿Qué cambió? Incluye la fuente de la medición."
                  />
                </Field>
              </>
            )}
            {modal.type === 'link' && (
              <OkrLinkInitiativePanel
                krTitle={modal.kr.title}
                search={search}
                onSearch={(value) => {
                  setSearch(value)
                  setSelectedAction('')
                }}
                selectedAction={selectedAction}
                onSelect={setSelectedAction}
                available={available}
                areas={data.areas}
                actionsReady={actionsReady}
                onCreateAction={onCreateAction}
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="sticky -bottom-4 grid grid-cols-[auto_1fr] gap-2 border-t bg-card pb-1 pt-3 sm:-bottom-6">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  (modal.type === 'link' && (!actionsReady || !selectedAction))
                }
                className="w-full"
              >
                {saving
                  ? 'Guardando…'
                  : modal.type === 'link'
                    ? 'Vincular iniciativa'
                    : modal.type === 'objective' && !modal.objective
                      ? 'Crear y agregar KR'
                      : modal.type === 'checkin'
                        ? 'Guardar medición'
                        : 'Guardar'}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </>
  )
}
