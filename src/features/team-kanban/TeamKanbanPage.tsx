import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock3,
  FolderOpen,
  Plus,
  Repeat2,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { notificacionesService } from '@/services/notificaciones.service'
import { accionFechaCompromisoCambiosService } from '@/services/accionFechaCompromisoCambios.service'
import {
  FECHA_COMPROMISO_CHANGE_REASONS,
  type FechaCompromisoChangeReasonKey,
} from '@/features/operations/constants/fechaCompromisoChangeReasons'
import { teamKanbanService } from './service'
import {
  EMPTY_TEAM_FILTERS,
  type TeamAction,
  type TeamArea,
  type TeamBoard,
  type TeamFilters,
  type TeamSeries,
} from './types'
import { TeamActionFormDialog } from './TeamActionFormDialog'
import { TeamKanbanFilters } from './TeamKanbanFilters'
import { formatRecurrenceLabel, upcomingOccurrenceDate } from './utils/recurrence'

const qk = {
  areas: ['team-kanban', 'areas'] as const,
  board: (id: string) => ['team-kanban', 'board', id] as const,
}

const priorityTone: Record<string, string> = {
  Baja: 'bg-slate-100 text-slate-700',
  Media: 'bg-blue-100 text-blue-700',
  Alta: 'bg-orange-100 text-orange-700',
  Critica: 'bg-red-100 text-red-700',
}

function isOpenAction(action: TeamAction, board: TeamBoard) {
  if (action.completed_at) return false
  const state = board.states.find((s) => s.id === action.estado_id)
  return !state?.es_final
}

function isOverdue(action: TeamAction, board: TeamBoard) {
  if (!action.fecha_limite || !isOpenAction(action, board)) return false
  return new Date(action.fecha_limite).getTime() < Date.now()
}

function isCritical(action: TeamAction, board: TeamBoard) {
  return isOpenAction(action, board) && action.prioridad === 'Critica'
}

function hexToRgba(hex: string | null | undefined, alpha: number): string | undefined {
  if (!hex) return undefined
  const normalized = hex.replace('#', '').trim()
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : normalized
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatDueDate(value: string) {
  return new Date(value).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  })
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function localDateInputFromIso(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function localTimeInputFromIso(value: string | null | undefined) {
  if (!value) return '09:00'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '09:00'
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatRecurrence(action: TeamAction) {
  if (!action.es_frecuente) return null
  return formatRecurrenceLabel(action)
}

function formatIsoDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  })
}

function todayIso() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function TeamKanbanPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const [areaId, setAreaId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [escalating, setEscalating] = useState<TeamAction | null>(null)
  const [closingSeries, setClosingSeries] = useState<{ id: string; titulo: string } | null>(null)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [filters, setFilters] = useState<TeamFilters>(EMPTY_TEAM_FILTERS)
  const [activeStateId, setActiveStateId] = useState<string | null>(null)
  const boardScrollRef = useRef<HTMLDivElement>(null)
  const statusNavRef = useRef<HTMLDivElement>(null)

  const areas = useQuery({ queryKey: qk.areas, queryFn: teamKanbanService.areas })
  const areaParam = searchParams.get('area')
  const membershipAreaNames = useMemo(() => {
    const names = [
      ...(currentUser?.areas ?? []),
      ...(currentUser?.area ? [currentUser.area] : []),
    ]
    return new Set(
      names
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    )
  }, [currentUser?.area, currentUser?.areas])

  const visibleAreas = useMemo(() => {
    const list = areas.data ?? []
    // Esperar perfil para no ocultar areas durante la carga inicial.
    if (!currentUser) return list
    if (membershipAreaNames.size === 0) return []
    return list.filter((area) => membershipAreaNames.has(area.nombre.trim().toLowerCase()))
  }, [areas.data, currentUser, membershipAreaNames])

  const board = useQuery({
    queryKey: qk.board(areaId ?? ''),
    queryFn: async () => {
      // Al abrir el tablero se materializan las ocurrencias vencidas de cada serie.
      await teamKanbanService.syncFrequent(areaId!).catch((error) => {
        console.warn('[team-kanban] No se pudieron generar acciones frecuentes:', error)
      })
      return teamKanbanService.board(areaId!)
    },
    enabled: Boolean(areaId),
  })

  useEffect(() => {
    if (!visibleAreas.length) {
      if (areaId) setAreaId(null)
      return
    }
    if (areaParam && visibleAreas.some((area) => area.id === areaParam)) {
      if (areaId !== areaParam) setAreaId(areaParam)
      return
    }
    if (areaId && visibleAreas.some((area) => area.id === areaId)) return
    setAreaId(visibleAreas[0].id)
  }, [visibleAreas, areaId, areaParam])

  useEffect(() => {
    setFilters(EMPTY_TEAM_FILTERS)
    setFiltersExpanded(false)
    setActiveStateId(null)
  }, [areaId])

  useEffect(() => {
    if (!board.data?.states.length) return
    setActiveStateId((prev) => prev ?? board.data!.states[0].id)
  }, [board.data])

  useEffect(() => {
    const root = boardScrollRef.current
    if (!root || !board.data?.states.length) return

    const columns = Array.from(
      root.querySelectorAll<HTMLElement>(':scope > .kanban-column[data-state-id]')
    )
    if (!columns.length) return

    const updateActive = () => {
      const rootRect = root.getBoundingClientRect()
      const anchor = rootRect.left + Math.min(160, rootRect.width * 0.35)
      let bestId = columns[0]?.dataset.stateId ?? null
      let bestDistance = Number.POSITIVE_INFINITY
      for (const column of columns) {
        const rect = column.getBoundingClientRect()
        const distance = Math.abs(rect.left - anchor)
        if (distance < bestDistance) {
          bestDistance = distance
          bestId = column.dataset.stateId ?? bestId
        }
      }
      if (bestId) setActiveStateId(bestId)
    }

    updateActive()
    root.addEventListener('scroll', updateActive, { passive: true })
    return () => root.removeEventListener('scroll', updateActive)
  }, [board.data])

  useEffect(() => {
    if (!activeStateId || !statusNavRef.current) return
    const active = statusNavRef.current.querySelector<HTMLElement>(
      `[data-status-nav="${activeStateId}"]`
    )
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeStateId])

  const selectedArea = visibleAreas.find((a) => a.id === areaId)

  const scrollToState = (stateId: string) => {
    setActiveStateId(stateId)
    document
      .getElementById(`team-column-${stateId}`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  const refresh = async () => {
    if (areaId) await qc.invalidateQueries({ queryKey: qk.board(areaId) })
    await qc.invalidateQueries({ queryKey: qk.areas })
  }

  const memberName = (id: string | null | undefined) =>
    id ? board.data?.members.find((member) => member.id === id)?.nombre : undefined

  const notifyTeamReassignment = async (action: TeamAction, usuarioId: string) => {
    if (!usuarioId || usuarioId === currentUser?.id) return
    await notificacionesService.create({
      usuario_id: usuarioId,
      tipo: 'team_responsable',
      prioridad: action.prioridad === 'Critica' ? 'Urgente' : action.prioridad === 'Alta' ? 'Alta' : 'Normal',
      payload: {
        titulo: 'Te reasignaron una accion de equipo',
        titulo_accion: action.titulo,
        descripcion_accion: action.descripcion ?? undefined,
        equipo_accion_id: action.id,
        area_id: action.area_id,
        area_nombre: selectedArea?.nombre ?? undefined,
        responsable_id: usuarioId,
        responsable_nombre: memberName(usuarioId),
        fecha_compromiso: action.fecha_limite ?? undefined,
        asignador_id: currentUser?.id ?? null,
        asignador_nombre: currentUser?.nombre ?? null,
      },
    })
  }

  const update = useMutation({
    mutationFn: ({
      id,
      ...p
    }: {
      id: string
      stateId?: string
      blocked?: boolean
      assignee?: string
      priority?: string
      dueAt?: string | null
      dueChange?: {
        reasonKey: FechaCompromisoChangeReasonKey
        previousDate: string
        nextDate: string
        title: string
      }
    }) => teamKanbanService.update(id, p),
    onSuccess: async (action, vars) => {
      if (vars.dueChange) {
        await accionFechaCompromisoCambiosService
          .create({
            origen: 'team_kanban',
            accionId: action.id,
            accionTitulo: vars.dueChange.title || action.titulo || 'Accion de equipo sin titulo',
            motivoKey: vars.dueChange.reasonKey,
            fechaAnterior: vars.dueChange.previousDate,
            fechaNueva: vars.dueChange.nextDate,
            changedBy: currentUser?.id ?? null,
            changedByNombre: currentUser?.nombre ?? null,
          })
          .then(() =>
            qc.invalidateQueries({
              queryKey: ['dashboard', 'fecha-compromiso-cambios'],
              refetchType: 'active',
            })
          )
          .catch((error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : 'La fecha se actualizo, pero no se pudo registrar el motivo.'
            )
          })
      }
      if (vars.assignee && vars.assignee !== currentUser?.id) {
        await notifyTeamReassignment(action, vars.assignee).catch((error) => {
          console.warn('[team-kanban] No se pudo notificar reasignacion:', error)
          toast.error(error instanceof Error ? error.message : 'No se pudo notificar la reasignacion')
        })
      }
      await refresh()
    },
    onError: (e) => toast.error(e.message),
  })

  const scrollBoard = (direction: -1 | 1) => {
    boardScrollRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' })
  }

  const filteredActions = useMemo(() => {
    return (board.data?.actions ?? []).filter((action) => {
      const term = filters.search.trim().toLowerCase()
      if (
        term &&
        ![action.titulo, action.descripcion, action.asignado_nombre].some((v) =>
          v?.toLowerCase().includes(term)
        )
      ) {
        return false
      }
      if (filters.priority !== 'all' && action.prioridad !== filters.priority) return false
      if (filters.stateId !== 'all' && action.estado_id !== filters.stateId) return false
      const due = action.fecha_limite?.slice(0, 10) ?? ''
      if (filters.dateFrom && (!due || due < filters.dateFrom)) return false
      if (filters.dateTo && (!due || due > filters.dateTo)) return false
      return true
    })
  }, [board.data?.actions, filters])

  const metrics = useMemo(() => {
    if (!board.data) {
      return { rojos: 0, vencidas: 0, bloqueadas: 0, abiertas: 0 }
    }
    const open = filteredActions.filter((action) => isOpenAction(action, board.data!))
    return {
      rojos: open.filter((action) => isCritical(action, board.data!)).length,
      vencidas: open.filter((action) => isOverdue(action, board.data!)).length,
      bloqueadas: open.filter((action) => action.bloqueada).length,
      abiertas: open.length,
    }
  }, [board.data, filteredActions])

  const activeFilterCount = [
    filters.search,
    filters.dateFrom,
    filters.dateTo,
    filters.priority !== 'all' ? 'x' : '',
    filters.stateId !== 'all' ? 'x' : '',
  ].filter(Boolean).length

  if (areas.isLoading || userLoading) {
    return <p className="py-16 text-center text-muted-foreground">Cargando areas...</p>
  }

  if (areas.error) {
    return (
      <p className="m-6 rounded-lg border border-destructive/30 p-4 text-destructive">
        {areas.error.message}
      </p>
    )
  }

  if (!visibleAreas.length) {
    return (
      <p className="m-6 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        No tienes areas definidas en tu perfil. Asigna al menos un area para usar Kanban por Equipos.
      </p>
    )
  }

  return (
    <div className="kanban-page mx-auto flex w-full max-w-7xl flex-col space-y-5 overflow-x-hidden px-3 py-5 sm:space-y-6 sm:px-6 sm:py-6">
      <header className="kanban-header flex min-w-0 flex-col gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Kanban por Equipos
          </p>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {selectedArea?.nombre ?? 'Tablero de equipo'}
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Acciones privadas del equipo por estado. Cambia de area sin salir del tablero.
              </p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <Button
                className="h-11 justify-center gap-2 px-4 text-sm font-semibold shadow-md ring-2 ring-primary/25 sm:h-10"
                onClick={() => setCreateOpen(true)}
                disabled={!board.data}
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                Nueva accion
              </Button>
              <Button
                variant="outline"
                className={cn(
                  'relative h-11 justify-center gap-2 border-2 font-semibold shadow-sm sm:h-10',
                  (filtersExpanded || activeFilterCount) && 'border-primary/50 bg-primary/5 text-primary'
                )}
                onClick={() => setFiltersExpanded((v) => !v)}
                aria-expanded={filtersExpanded}
                disabled={!board.data}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {activeFilterCount ? (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
                ) : null}
              </Button>
            </div>
          </div>
        </div>

        <AreaSelector areas={visibleAreas} selectedId={areaId} onSelect={setAreaId} />
      </header>

      {board.isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Cargando tablero...</p>
      ) : board.error ? (
        <p className="rounded-lg border border-destructive/30 p-4 text-destructive">
          {board.error.message}
        </p>
      ) : board.data ? (
        <div className="space-y-4">
          <MetricsRow metrics={metrics} />

          <FrequentSeriesPanel
            series={board.data.series ?? []}
            canManage={board.data.canManage ?? board.data.isLeader}
            onClose={(serie) => setClosingSeries({ id: serie.id, titulo: serie.titulo })}
          />

          {filtersExpanded ? (
            <TeamKanbanFilters
              value={filters}
              states={board.data.states}
              onChange={setFilters}
              onClear={() => setFilters(EMPTY_TEAM_FILTERS)}
            />
          ) : null}

          <div className="rounded-xl border border-border/60 bg-card/90 p-1.5 shadow-sm">
            <div
              ref={statusNavRef}
              className="flex gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Estatus del tablero"
            >
              {board.data.states.map((state, index) => {
                const count = filteredActions.filter((a) => a.estado_id === state.id).length
                const active = activeStateId === state.id
                return (
                  <button
                    key={state.id}
                    type="button"
                    data-status-nav={state.id}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`Ir a estatus ${state.nombre}`}
                    onClick={() => scrollToState(state.id)}
                    className={cn(
                      'group flex h-10 min-w-fit snap-start items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background',
                      active
                        ? 'border-primary/45 bg-primary/10 text-primary shadow-sm'
                        : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                      style={
                        !active
                          ? {
                              color: state.color,
                              backgroundColor: hexToRgba(state.color, 0.14),
                            }
                          : undefined
                      }
                    >
                      {index + 1}
                    </span>
                    <span className="max-w-[9rem] truncate">{state.nombre}</span>
                    <span
                      className={cn(
                        'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="relative -mx-3 min-w-0 sm:mx-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollBoard(-1)}
              className="absolute left-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border-primary/25 bg-background/95 text-primary shadow-md hover:bg-primary hover:text-primary-foreground sm:flex"
              aria-label="Estado anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollBoard(1)}
              className="absolute right-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border-primary/25 bg-background/95 text-primary shadow-md hover:bg-primary hover:text-primary-foreground sm:flex"
              aria-label="Estado siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <div
              ref={boardScrollRef}
              className="kanban-board flex min-w-0 snap-x snap-proximity gap-4 overflow-x-auto overscroll-x-contain px-3 pb-4 pt-1 sm:gap-5 sm:px-12 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary"
            >
              {board.data.states.map((state) => {
                const stateActions = filteredActions.filter((a) => a.estado_id === state.id)
                const overdueInColumn = stateActions.filter((a) =>
                  isOverdue(a, board.data!)
                ).length
                const active = activeStateId === state.id
                return (
                  <section
                    id={`team-column-${state.id}`}
                    key={state.id}
                    data-state-id={state.id}
                    className={cn(
                      'kanban-column relative flex min-h-[420px] w-[min(300px,calc(100vw-1.25rem))] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/50 border-l-4 transition-all duration-200 sm:w-[300px] sm:min-w-[280px] sm:max-w-[300px]',
                      active && 'ring-2 ring-primary/15 ring-offset-2 ring-offset-background'
                    )}
                    style={{
                      borderLeftColor: state.color,
                      backgroundColor: hexToRgba(state.color, 0.06),
                    }}
                  >
                    <header className="flex items-start justify-between gap-2 border-b border-border/40 bg-background/55 px-4 py-3 backdrop-blur-[2px]">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
                            style={{ background: state.color }}
                            aria-hidden
                          />
                          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                            {state.nombre}
                          </h3>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {stateActions.length === 0
                            ? 'Sin acciones'
                            : `${stateActions.length} accion${stateActions.length === 1 ? '' : 'es'}`}
                          {overdueInColumn > 0 ? ` · ${overdueInColumn} vencida${overdueInColumn === 1 ? '' : 's'}` : ''}
                          {state.es_final ? ' · Final' : ''}
                        </p>
                      </div>
                      <span
                        className="min-w-[28px] rounded-full border border-border/60 bg-background px-2 py-1 text-center text-xs font-semibold tabular-nums text-foreground shadow-sm"
                      >
                        {stateActions.length}
                      </span>
                    </header>
                    <div className="kanban-column-cards flex min-h-[200px] flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-border">
                      {stateActions.map((action) => (
                        <ActionCard
                          key={action.id}
                          action={action}
                          board={board.data!}
                          onMove={(stateId) => update.mutate({ id: action.id, stateId })}
                          onAssign={(assignee) => update.mutate({ id: action.id, assignee })}
                          onPriority={(priority) => update.mutate({ id: action.id, priority })}
                          onDueDateChange={({ dueAt, reasonKey, previousDate, nextDate }) =>
                            update.mutate({
                              id: action.id,
                              dueAt,
                              dueChange: {
                                reasonKey,
                                previousDate,
                                nextDate,
                                title: action.titulo,
                              },
                            })
                          }
                          onBlock={() =>
                            update.mutate({ id: action.id, blocked: !action.bloqueada })
                          }
                          onEscalate={() => setEscalating(action)}
                          onCloseSeries={() =>
                            setClosingSeries({ id: action.id, titulo: action.titulo })
                          }
                        />
                      ))}
                      {stateActions.length === 0 ? (
                        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center">
                          <FolderOpen className="mb-2 h-8 w-8 text-muted-foreground opacity-60" aria-hidden />
                          <p className="text-sm font-medium text-muted-foreground">
                            Sin acciones en {state.nombre}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground/80">
                            Arrastra aquí o crea una nueva
                          </p>
                          <button
                            type="button"
                            onClick={() => setCreateOpen(true)}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            Nueva acción
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {board.data && areaId ? (
        <TeamActionFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          areaId={areaId}
          areaName={selectedArea?.nombre ?? 'Equipo'}
          board={board.data}
          onDone={refresh}
        />
      ) : null}
      <EscalateDialog action={escalating} onClose={() => setEscalating(null)} onDone={refresh} />
      <CloseSeriesDialog
        target={closingSeries}
        onClose={() => setClosingSeries(null)}
        onDone={refresh}
      />
    </div>
  )
}

function AreaSelector({
  areas,
  selectedId,
  onSelect,
}: {
  areas: TeamArea[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Elige area</p>
      <div className="flex flex-wrap gap-2">
        {areas.map((area) => {
          const selected = area.id === selectedId
          return (
            <button
              key={area.id}
              type="button"
              onClick={() => onSelect(area.id)}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
                selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              <span>{area.nombre}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                  selected ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground'
                )}
              >
                {area.open_count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MetricsRow({
  metrics,
}: {
  metrics: { rojos: number; vencidas: number; bloqueadas: number; abiertas: number }
}) {
  const items = [
    {
      key: 'rojos',
      label: 'Rojos',
      value: metrics.rojos,
      hint: 'Criticas abiertas',
      icon: AlertTriangle,
      tone: 'border-red-200/80 bg-red-50/80',
      valueTone: 'text-red-700',
      labelTone: 'text-red-800/80',
    },
    {
      key: 'vencidas',
      label: 'Vencidas',
      value: metrics.vencidas,
      hint: 'Fecha rebasada',
      icon: Clock3,
      tone: 'border-orange-200/80 bg-orange-50/80',
      valueTone: 'text-orange-700',
      labelTone: 'text-orange-800/80',
    },
    {
      key: 'bloqueadas',
      label: 'Bloqueadas',
      value: metrics.bloqueadas,
      hint: 'Sin avance',
      icon: Ban,
      tone: 'border-amber-200/80 bg-amber-50/70',
      valueTone: 'text-amber-800',
      labelTone: 'text-amber-900/75',
    },
    {
      key: 'abiertas',
      label: 'Abiertas',
      value: metrics.abiertas,
      hint: 'En flujo',
      icon: FolderOpen,
      tone: 'border-border/70 bg-card',
      valueTone: 'text-foreground',
      labelTone: 'text-muted-foreground',
    },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {items.map((item) => (
        <div
          key={item.key}
          className={cn('rounded-xl border px-3 py-2.5 shadow-sm sm:px-3.5 sm:py-3', item.tone)}
        >
          <div className="flex items-center justify-between gap-2">
            <p className={cn('text-[11px] font-semibold uppercase tracking-wide', item.labelTone)}>
              {item.label}
            </p>
            <item.icon className={cn('h-3.5 w-3.5 opacity-70', item.valueTone)} aria-hidden />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={cn('text-2xl font-bold tabular-nums leading-none sm:text-[1.75rem]', item.valueTone)}>
              {item.value}
            </p>
            <p className="text-[11px] text-muted-foreground">{item.hint}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function FrequentSeriesPanel({
  series,
  canManage,
  onClose,
}: {
  series: TeamSeries[]
  canManage: boolean
  onClose: (serie: TeamSeries) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const active = series.filter((serie) => serie.serie_activa)
  if (!series.length) return null
  const visible = expanded ? series : active

  return (
    <section className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Repeat2 className="h-4 w-4 text-sky-700" aria-hidden />
          <h2 className="text-sm font-semibold text-sky-900">Acciones frecuentes</h2>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-800">
            {active.length} activa{active.length === 1 ? '' : 's'}
          </span>
        </div>
        {series.length > active.length ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-sky-800"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Ver solo activas' : `Ver cerradas (${series.length - active.length})`}
          </Button>
        ) : null}
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-sky-900/70">
        Cada vez que se cumple la fecha de la frecuencia se genera una acción nueva en el tablero.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((serie) => {
          const label = formatRecurrenceLabel(serie)
          const next = serie.serie_activa ? upcomingOccurrenceDate(serie, todayIso()) : null
          return (
            <div
              key={serie.id}
              className={cn(
                'rounded-lg border bg-background p-3 shadow-sm',
                serie.serie_activa ? 'border-sky-200' : 'border-border/60 opacity-75'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                  {serie.titulo}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[10px]',
                    serie.serie_activa
                      ? 'border-sky-200 bg-sky-50 text-sky-800'
                      : 'border-border/70 text-muted-foreground'
                  )}
                >
                  {serie.serie_activa ? label ?? 'Frecuente' : 'Cerrada'}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {serie.asignado_nombre || 'Sin asignar'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="tabular-nums">{serie.ocurrencias_total} generadas</span>
                <span className="tabular-nums">{serie.ocurrencias_abiertas} abiertas</span>
                {next ? (
                  <span className="inline-flex items-center gap-1 font-medium text-sky-800">
                    <CalendarClock className="h-3 w-3" aria-hidden />
                    Próxima {formatIsoDate(next)}
                  </span>
                ) : null}
              </div>
              {canManage && serie.serie_activa ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => onClose(serie)}
                >
                  <CircleSlash className="mr-1 h-3.5 w-3.5" />
                  Cerrar recurrencia
                </Button>
              ) : null}
              {!serie.serie_activa && serie.serie_cierre_motivo ? (
                <p className="mt-2 line-clamp-2 text-[11px] italic text-muted-foreground">
                  {serie.serie_cierre_motivo}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ActionCard({
  action,
  board,
  onMove,
  onAssign,
  onPriority,
  onDueDateChange,
  onBlock,
  onEscalate,
  onCloseSeries,
}: {
  action: TeamAction
  board: TeamBoard
  onMove: (s: string) => void
  onAssign: (s: string) => void
  onPriority: (s: string) => void
  onDueDateChange: (input: {
    dueAt: string
    reasonKey: FechaCompromisoChangeReasonKey
    previousDate: string
    nextDate: string
  }) => void
  onBlock: () => void
  onEscalate: () => void
  onCloseSeries: () => void
}) {
  const overdue = isOverdue(action, board)
  const critical = action.prioridad === 'Critica' && isOpenAction(action, board)
  const canManage = board.canManage ?? board.isLeader
  const recurrence = formatRecurrence(action)
  const isRecurring = Boolean(action.serie_id) || Boolean(action.es_frecuente)
  const [dueReason, setDueReason] = useState<FechaCompromisoChangeReasonKey | ''>('')
  const [dueDate, setDueDate] = useState(localDateInputFromIso(action.fecha_limite))
  const [dueTime, setDueTime] = useState(localTimeInputFromIso(action.fecha_limite))
  const canChangeDueDate = canManage && !isRecurring
  const originalDueDate = localDateInputFromIso(action.fecha_limite)
  const dueDateChanged = Boolean(dueDate) && dueDate !== originalDueDate

  useEffect(() => {
    setDueReason('')
    setDueDate(localDateInputFromIso(action.fecha_limite))
    setDueTime(localTimeInputFromIso(action.fecha_limite))
  }, [action.id, action.fecha_limite])

  const submitDueDateChange = () => {
    if (!dueReason || !dueDate || !dueDateChanged) return
    onDueDateChange({
      dueAt: new Date(`${dueDate}T${dueTime || '09:00'}:00`).toISOString(),
      reasonKey: dueReason,
      previousDate: originalDueDate,
      nextDate: dueDate,
    })
  }
  const recurrenceTitle = recurrence
    ? `Acción recurrente · ${recurrence}${action.ocurrencia_fecha ? ` · periodo ${formatIsoDate(action.ocurrencia_fecha)}` : ''}`
    : 'Acción recurrente'

  return (
    <Card
      className={cn(
        'group rounded-xl border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
        isRecurring && 'border-l-4 border-l-sky-400',
        action.bloqueada && 'border-amber-300 ring-1 ring-amber-200',
        overdue && !action.bloqueada && 'border-orange-300 ring-1 ring-orange-200',
        critical && !overdue && !action.bloqueada && 'border-red-200'
      )}
    >
      <CardHeader className="space-y-2 p-3.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1.5">
            {isRecurring ? (
              <span
                className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700 ring-1 ring-sky-200"
                title={recurrenceTitle}
                aria-label={recurrenceTitle}
              >
                <Repeat2 className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
            <CardTitle className="text-[13px] font-semibold leading-snug tracking-tight text-foreground">
              {action.titulo}
            </CardTitle>
          </div>
          <Badge className={`${priorityTone[action.prioridad]} shrink-0 border-0 text-[10px]`}>
            {action.prioridad}
          </Badge>
        </div>
        {(overdue || action.bloqueada || action.escalada || recurrence) && (
          <div className="flex flex-wrap gap-1">
            {recurrence ? (
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] text-sky-800">
                <Repeat2 className="mr-1 h-3 w-3" />
                {recurrence}
                {action.ocurrencia_fecha ? ` · ${formatIsoDate(action.ocurrencia_fecha)}` : ''}
              </Badge>
            ) : null}
            {overdue ? (
              <Badge variant="outline" className="border-orange-300 bg-orange-50 text-[10px] text-orange-800">
                Vencida
              </Badge>
            ) : null}
            {action.bloqueada ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-900">
                Bloqueada
              </Badge>
            ) : null}
            {action.escalada ? (
              <Badge variant="outline" className="text-[10px]">
                Corporativo
              </Badge>
            ) : null}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2.5 p-3.5 pt-0">
        {action.descripcion ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {action.descripcion}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/35 px-2.5 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            Responsable
          </span>
          <span className="truncate text-xs font-semibold text-foreground">
            {action.asignado_nombre || 'Sin asignar'}
          </span>
        </div>

        {action.fecha_limite ? (
          <p
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium',
              overdue
                ? 'bg-orange-50 text-orange-800'
                : 'bg-muted/35 text-muted-foreground'
            )}
          >
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span>Limite {formatDueDate(action.fecha_limite)}</span>
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Estatus</Label>
          <Select value={action.estado_id} onValueChange={onMove}>
            <SelectTrigger className="h-9 border-border/70 bg-background text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {board.states.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    {s.nombre}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canManage ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Asignar</Label>
              <Select value={action.asignado_a} onValueChange={onAssign}>
                <SelectTrigger className="h-9 border-border/70 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {board.members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Prioridad</Label>
              <Select value={action.prioridad} onValueChange={onPriority}>
                <SelectTrigger className="h-9 border-border/70 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Baja', 'Media', 'Alta', 'Critica'].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {canChangeDueDate ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 p-2.5">
            <Label className="text-[11px] text-muted-foreground">Cambio de fecha compromiso</Label>
            <Select
              value={dueReason || undefined}
              onValueChange={(value) => setDueReason(value as FechaCompromisoChangeReasonKey)}
            >
              <SelectTrigger className="h-9 border-border/70 bg-background text-xs">
                <SelectValue placeholder="Primero selecciona motivo" />
              </SelectTrigger>
              <SelectContent>
                {FECHA_COMPROMISO_CHANGE_REASONS.map((reason) => (
                  <SelectItem key={reason.key} value={reason.key}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-2">
              <Input
                type="date"
                min={todayIso()}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={!dueReason}
                className="h-9 border-border/70 bg-background text-xs"
              />
              <Input
                type="time"
                value={dueTime}
                onChange={(event) => setDueTime(event.target.value)}
                disabled={!dueReason}
                className="h-9 border-border/70 bg-background text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-full text-xs"
              disabled={!dueReason || !dueDateChanged}
              onClick={submitDueDateChange}
            >
              Actualizar fecha
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onBlock}>
            <Ban className="mr-1 h-3.5 w-3.5" />
            {action.bloqueada ? 'Desbloquear' : 'Bloquear'}
          </Button>
          {canManage && !action.escalada ? (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEscalate}>
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
              Escalar
            </Button>
          ) : null}
          {canManage && action.serie_id ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={onCloseSeries}
            >
              <CircleSlash className="mr-1 h-3.5 w-3.5" />
              Cerrar recurrencia
            </Button>
          ) : null}
          {action.escalada ? (
            <Badge variant="outline" className="text-[10px]">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Corporativo
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function CloseSeriesDialog({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; titulo: string } | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [closePending, setClosePending] = useState(true)
  const mutation = useMutation({
    mutationFn: () =>
      teamKanbanService.closeSeries({ actionId: target!.id, closePending, reason }),
    onSuccess: async (result) => {
      toast.success(
        result.ocurrencias_cerradas > 0
          ? `Recurrencia cerrada · ${result.ocurrencias_cerradas} accion${result.ocurrencias_cerradas === 1 ? '' : 'es'} pendiente${result.ocurrencias_cerradas === 1 ? '' : 's'} cerrada${result.ocurrencias_cerradas === 1 ? '' : 's'}`
          : 'Recurrencia cerrada'
      )
      setReason('')
      setClosePending(true)
      onClose()
      await onDone()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar recurrencia</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          «{target?.titulo}» dejara de generar acciones nuevas. Las acciones ya cerradas se
          conservan en el historial.
        </p>
        <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={closePending}
            onChange={(e) => setClosePending(e.target.checked)}
          />
          <span>
            Cerrar tambien las acciones pendientes de esta serie
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Si lo dejas sin marcar, las acciones abiertas siguen en el tablero hasta que el
              equipo las complete.
            </span>
          </span>
        </label>
        <div>
          <Label>Motivo (opcional)</Label>
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border bg-background p-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Ej. El reporte semanal se integro al tablero automatico."
          />
        </div>
        <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Cerrando...' : 'Cerrar recurrencia'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function EscalateDialog({
  action,
  onClose,
  onDone,
}: {
  action: TeamAction | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => teamKanbanService.escalate(action!.id, reason),
    onSuccess: async () => {
      toast.success('Accion enviada al Kanban Corporativo')
      setReason('')
      onClose()
      await onDone()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escalar al Kanban Corporativo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Se conservaran area origen, lider, fecha, prioridad y motivo.
        </p>
        <div>
          <Label>Motivo del escalamiento</Label>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border bg-background p-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </div>
        <Button
          disabled={reason.trim().length < 5 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Confirmar escalamiento
        </Button>
      </DialogContent>
    </Dialog>
  )
}
