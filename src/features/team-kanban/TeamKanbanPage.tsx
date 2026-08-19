import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleSlash,
  Clock3,
  FileText,
  FolderOpen,
  MessageCircle,
  MoreVertical,
  Plus,
  Repeat2,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getAppNow } from '@/lib/clock'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { AccionFormField, AccionFormSection } from '@/features/operations/components/AccionFormSection'
import { AccionAsignadorNote } from '@/features/operations/components/form/AccionAsignadorNote'
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
import { TeamActionComentarios } from './components/TeamActionComentarios'
import { TeamMemberSelect } from './components/TeamMemberSelect'
import { useTeamActionCommentCounts } from './hooks/useTeamActionComentarios'
import { formatRecurrenceLabel, upcomingOccurrenceDate } from './utils/recurrence'
import { boardForTeamAction, filterAssignedTeamAreas, mergeTeamBoards } from './utils/teamAreaView'

const qk = {
  areas: ['team-kanban', 'areas'] as const,
  assignedAreas: (userId: string) => ['team-kanban', 'assigned-areas', userId] as const,
  board: (id: string) => ['team-kanban', 'board', id] as const,
}

const ALL_TEAM_AREAS = '__all_team_areas__'

function buildTeamActionPatch(
  board: TeamBoard,
  vars: {
    stateId?: string
    assignee?: string
    priority?: string
    dueAt?: string | null
  }
): Partial<TeamAction> {
  const patch: Partial<TeamAction> = {}
  if (vars.stateId) {
    patch.estado_id = vars.stateId
    const state = board.states.find((item) => item.id === vars.stateId)
    patch.completed_at = state?.es_final ? new Date().toISOString() : null
  }
  if (vars.assignee) {
    patch.asignado_a = vars.assignee
    const assigneeName = board.members.find((member) => member.id === vars.assignee)?.nombre
    if (assigneeName) patch.asignado_nombre = assigneeName
  }
  if (vars.priority) patch.prioridad = vars.priority
  if (vars.dueAt !== undefined) patch.fecha_limite = vars.dueAt
  return patch
}

function resolveTeamActionAssignerName(action: TeamAction, board: TeamBoard): string | null {
  const assignerId = action.creado_por ?? action.lider_id
  return board.members.find((member) => member.id === assignerId)?.nombre ?? null
}

function patchTeamBoardAction(
  qc: QueryClient,
  areaId: string,
  actionId: string,
  patch: Partial<TeamAction>,
  returned?: Partial<TeamAction>
) {
  qc.setQueryData<TeamBoard>(qk.board(areaId), (prev) => {
    if (!prev) return prev
    const actions = prev.actions.map((action) => {
      if (action.id !== actionId) return action
      const merged = { ...action, ...patch, ...(returned ?? {}) }
      if (patch.asignado_a && patch.asignado_nombre) {
        merged.asignado_nombre = patch.asignado_nombre
      } else if (merged.asignado_a && !merged.asignado_nombre) {
        merged.asignado_nombre =
          prev.members.find((member) => member.id === merged.asignado_a)?.nombre ??
          action.asignado_nombre
      }
      return merged
    })
    return { ...prev, actions }
  })
}

const LEGACY_TEAM_PRIORITIES: Priority[] = [
  { id: 'legacy-baja', nombre: 'Baja', descripcion: null, color: 'verde', orden: 10, activo: true, created_at: '', updated_at: '' },
  { id: 'legacy-media', nombre: 'Media', descripcion: null, color: 'amarillo', orden: 20, activo: true, created_at: '', updated_at: '' },
  { id: 'legacy-alta', nombre: 'Alta', descripcion: null, color: 'rojo', orden: 30, activo: true, created_at: '', updated_at: '' },
  { id: 'legacy-critica', nombre: 'Critica', descripcion: null, color: 'rojo', orden: 40, activo: true, created_at: '', updated_at: '' },
]

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
  const priority = action.prioridad.trim().toLowerCase()
  return isOpenAction(action, board) && (priority.includes('crit') || priority.includes('p1'))
}

function normalizeTeamStateName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')
}

function isTeamTodayStateName(value: string) {
  return normalizeTeamStateName(value) === 'hoy'
}

function isTeamPendingLikeStateName(value: string) {
  const key = normalizeTeamStateName(value)
  return key === 'pendiente' || key === 'asignado' || key === 'asignada'
}

function isTeamRetrasoStateName(value: string) {
  const key = normalizeTeamStateName(value)
  return key === 'retraso' || key === 'vencido' || key === 'vencida' || key === 'vencidas'
}

function findTeamRetrasoState(board: TeamBoard) {
  return board.states.find((state) => isTeamRetrasoStateName(state.nombre) && !state.es_final)
}

/** Misma idea que el Kanban corporativo: columna/estatus Retraso o fecha límite rebasada. */
function isEnRetrasoTeam(action: TeamAction, board: TeamBoard) {
  if (!isOpenAction(action, board) || action.bloqueada) return false
  const retrasoState = findTeamRetrasoState(board)
  if (retrasoState && getEffectiveTeamStateId(action, board) === retrasoState.id) return true
  return isOverdue(action, board)
}

function getCdmxWallClockParts(date: Date) {
  return {
    ymd: date.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }),
    hm: date.toLocaleTimeString('en-GB', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  }
}

function getTeamDueCdmxParts(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return getCdmxWallClockParts(date)
}

function hasTeamActionReachedTodayTime(action: TeamAction, now = getAppNow()) {
  const due = getTeamDueCdmxParts(action.fecha_limite)
  if (!due) return false
  const current = getCdmxWallClockParts(now)
  return due.ymd === current.ymd && current.hm >= due.hm
}

function isTeamActionTodayButNotTime(action: TeamAction, now = getAppNow()) {
  const due = getTeamDueCdmxParts(action.fecha_limite)
  if (!due) return false
  const current = getCdmxWallClockParts(now)
  return due.ymd === current.ymd && current.hm < due.hm
}

function getTeamFallbackBeforeTodayStateId(board: TeamBoard) {
  return (
    board.states.find((state) => isTeamPendingLikeStateName(state.nombre) && !state.es_final)?.id ??
    board.states.find((state) => !isTeamTodayStateName(state.nombre) && !state.es_final)?.id ??
    null
  )
}

function getEffectiveTeamStateId(action: TeamAction, board: TeamBoard) {
  if (!isOpenAction(action, board)) return action.estado_id
  const currentState = board.states.find((state) => state.id === action.estado_id)
  const todayState = board.states.find((state) => isTeamTodayStateName(state.nombre))
  if (!todayState) return action.estado_id

  if (currentState && isTeamTodayStateName(currentState.nombre) && isTeamActionTodayButNotTime(action)) {
    return getTeamFallbackBeforeTodayStateId(board) ?? action.estado_id
  }

  if (
    currentState &&
    isTeamPendingLikeStateName(currentState.nombre) &&
    hasTeamActionReachedTodayTime(action)
  ) {
    return todayState.id
  }

  return action.estado_id
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
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [closingSeries, setClosingSeries] = useState<{ id: string; titulo: string } | null>(null)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [filters, setFilters] = useState<TeamFilters>(EMPTY_TEAM_FILTERS)
  const [activeStateId, setActiveStateId] = useState<string | null>(null)
  const boardScrollRef = useRef<HTMLDivElement>(null)
  const statusNavRef = useRef<HTMLDivElement>(null)

  const areas = useQuery({ queryKey: qk.areas, queryFn: teamKanbanService.areas })
  const assignedAreas = useQuery({
    queryKey: qk.assignedAreas(currentUser?.id ?? ''),
    queryFn: () => teamKanbanService.assignedAreaIds(currentUser!.id),
    enabled: Boolean(currentUser?.id),
  })
  const { data: catalogPriorities = [] } = usePriorities({ activo: true })
  const priorityOptions = catalogPriorities.length > 0 ? catalogPriorities : LEGACY_TEAM_PRIORITIES
  const areaParam = searchParams.get('area')
  // La RPC trae el alcance organizacional completo; la vista inicia solo con asignaciones directas.
  const directlyAssignedAreas = useMemo(() => {
    return filterAssignedTeamAreas(
      areas.data ?? [],
      assignedAreas.data ?? [],
      [currentUser?.area, ...(currentUser?.areas ?? [])]
    )
  }, [areas.data, assignedAreas.data, currentUser?.area, currentUser?.areas])
  const visibleAreas = directlyAssignedAreas
  const selectedAreaIds = useMemo(
    () => areaId === ALL_TEAM_AREAS ? visibleAreas.map((area) => area.id) : areaId ? [areaId] : [],
    [areaId, visibleAreas]
  )

  const board = useQuery({
    queryKey: qk.board(areaId ?? ''),
    queryFn: async () => {
      await Promise.all(selectedAreaIds.map((selectedAreaId) =>
        teamKanbanService.syncFrequent(selectedAreaId).catch((error) => {
          console.warn('[team-kanban] No se pudieron generar acciones frecuentes:', error)
        })
      ))
      const boards = await Promise.all(selectedAreaIds.map(teamKanbanService.board))
      return boards.length === 1 ? boards[0] : mergeTeamBoards(boards, selectedAreaIds)
    },
    enabled: selectedAreaIds.length > 0,
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
    if (areaId === ALL_TEAM_AREAS) return
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
  const isAllAreas = areaId === ALL_TEAM_AREAS

  const scrollToState = (stateId: string) => {
    setActiveStateId(stateId)
    document
      .getElementById(`team-column-${stateId}`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  const refresh = async () => {
    if (areaId) {
      await qc.invalidateQueries({ queryKey: qk.board(areaId), refetchType: 'active' })
    }
    await qc.invalidateQueries({ queryKey: qk.areas, refetchType: 'active' })
  }

  const editingAction = useMemo(() => {
    if (!editingActionId || !board.data) return null
    return board.data.actions.find((action) => action.id === editingActionId) ?? null
  }, [editingActionId, board.data])

  const memberName = (id: string | null | undefined) =>
    id ? board.data?.members.find((member) => member.id === id)?.nombre : undefined

  const notifyTeamReassignment = async (action: TeamAction, usuarioId: string) => {
    if (!usuarioId || usuarioId === currentUser?.id) return
    await notificacionesService.create({
      usuario_id: usuarioId,
      tipo: 'team_responsable',
      prioridad: isCritical(action, board.data!) ? 'Urgente' : action.prioridad.toLowerCase().includes('alta') ? 'Alta' : 'Normal',
      payload: {
        titulo: 'Te reasignaron una accion de equipo',
        titulo_accion: action.titulo,
        descripcion_accion: action.descripcion ?? undefined,
        equipo_accion_id: action.id,
        area_id: action.area_id,
        area_nombre: visibleAreas.find((area) => area.id === action.area_id)?.nombre,
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
    onMutate: async (vars) => {
      if (!areaId || !board.data) return undefined
      await qc.cancelQueries({ queryKey: qk.board(areaId) })
      const snapshot = qc.getQueryData<TeamBoard>(qk.board(areaId))
      patchTeamBoardAction(
        qc,
        areaId,
        vars.id,
        buildTeamActionPatch(board.data, vars)
      )
      return { snapshot }
    },
    onError: (error, _vars, context) => {
      if (areaId && context?.snapshot) {
        qc.setQueryData(qk.board(areaId), context.snapshot)
      }
      toast.error(error.message)
    },
    onSuccess: async (action, vars) => {
      if (areaId && board.data) {
        patchTeamBoardAction(
          qc,
          areaId,
          vars.id,
          buildTeamActionPatch(board.data, vars),
          action
        )
      }

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
      if (filters.stateId !== 'all' && board.data && getEffectiveTeamStateId(action, board.data) !== filters.stateId) return false
      const due = action.fecha_limite?.slice(0, 10) ?? ''
      if (filters.dateFrom && (!due || due < filters.dateFrom)) return false
      if (filters.dateTo && (!due || due > filters.dateTo)) return false
      return true
    })
  }, [board.data, filters])

  const { data: commentCounts = {} } = useTeamActionCommentCounts(filteredActions.map((action) => action.id))

  const metrics = useMemo(() => {
    if (!board.data) {
      return { rojos: 0, vencidas: 0, abiertas: 0, retrasoLabel: 'Retraso' }
    }
    const open = filteredActions.filter((action) => isOpenAction(action, board.data!))
    return {
      rojos: open.filter((action) => isCritical(action, board.data!)).length,
      vencidas: open.filter((action) => isEnRetrasoTeam(action, board.data!)).length,
      abiertas: open.length,
      retrasoLabel: findTeamRetrasoState(board.data)?.nombre ?? 'Retraso',
    }
  }, [board.data, filteredActions])

  const activeFilterCount = [
    filters.search,
    filters.dateFrom,
    filters.dateTo,
    filters.priority !== 'all' ? 'x' : '',
    filters.stateId !== 'all' ? 'x' : '',
  ].filter(Boolean).length

  if (areas.isLoading || userLoading || (currentUser?.id && assignedAreas.isLoading)) {
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
                {isAllAreas ? 'Todas mis areas' : selectedArea?.nombre ?? 'Tablero de equipo'}
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Acciones privadas del equipo por estado. Cambia de area sin salir del tablero.
              </p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <Button
                className="h-11 justify-center gap-2 px-4 text-sm font-semibold shadow-md ring-2 ring-primary/25 sm:h-10"
                onClick={() => setCreateOpen(true)}
                disabled={!board.data || isAllAreas}
                title={isAllAreas ? 'Selecciona un area para crear una accion' : undefined}
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

        <AreaSelector
          areas={visibleAreas}
          selectedId={areaId}
          onSelect={setAreaId}
        />
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
              priorities={priorityOptions}
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
                const count = filteredActions.filter((a) => getEffectiveTeamStateId(a, board.data!) === state.id).length
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
                const stateActions = filteredActions.filter((a) => getEffectiveTeamStateId(a, board.data!) === state.id)
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
                      {stateActions.map((action) => {
                        const actionBoard = boardForTeamAction(board.data!, action)
                        return (
                          <ActionCard
                            key={action.id}
                            action={action}
                            board={actionBoard}
                            areaName={isAllAreas
                              ? visibleAreas.find((area) => area.id === action.area_id)?.nombre
                              : undefined}
                            priorities={priorityOptions}
                            commentCount={commentCounts[action.id] ?? 0}
                            onOpenDetail={() => setEditingActionId(action.id)}
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
                            onEscalate={() => setEscalating(action)}
                            onCloseSeries={() =>
                              setClosingSeries({ id: action.id, titulo: action.titulo })
                            }
                          />
                        )
                      })}
                      {stateActions.length === 0 ? (
                        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center">
                          <FolderOpen className="mb-2 h-8 w-8 text-muted-foreground opacity-60" aria-hidden />
                          <p className="text-sm font-medium text-muted-foreground">
                            Sin acciones en {state.nombre}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground/80">
                            {isAllAreas ? 'No hay acciones en tus areas' : 'Arrastra aqui o crea una nueva'}
                          </p>
                          {!isAllAreas ? (
                            <button
                              type="button"
                              onClick={() => setCreateOpen(true)}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden />
                              Nueva acción
                            </button>
                          ) : null}
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

      {board.data && areaId && !isAllAreas ? (
        <TeamActionFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          areaId={areaId}
          areaName={selectedArea?.nombre ?? 'Equipo'}
          board={board.data}
          priorities={priorityOptions}
          onDone={refresh}
        />
      ) : null}
      {board.data ? (
        <TeamActionEditDialog
          action={editingAction}
          board={editingAction ? boardForTeamAction(board.data, editingAction) : board.data}
          priorities={priorityOptions}
          asignadorNombre={editingAction ? resolveTeamActionAssignerName(editingAction, board.data) : null}
          commentCount={editingAction ? (commentCounts[editingAction.id] ?? 0) : 0}
          isSaving={update.isPending}
          onClose={() => setEditingActionId(null)}
          onSave={(patch) => {
            update.mutate(
              {
                id: patch.actionId,
                ...(patch.stateId !== undefined ? { stateId: patch.stateId } : {}),
                ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}),
                ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
              },
              { onSuccess: () => toast.success('Accion actualizada') }
            )
          }}
          onDueDateChange={(action, input) =>
            update.mutate({
              id: action.id,
              dueAt: input.dueAt,
              dueChange: {
                reasonKey: input.reasonKey,
                previousDate: input.previousDate,
                nextDate: input.nextDate,
                title: action.titulo,
              },
            })
          }
          onEscalate={(action) => {
            setEditingActionId(null)
            setEscalating(action)
          }}
          onCloseSeries={(action) => {
            setEditingActionId(null)
            setClosingSeries({ id: action.id, titulo: action.titulo })
          }}
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
        <button
          type="button"
          onClick={() => onSelect(ALL_TEAM_AREAS)}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
            selectedId === ALL_TEAM_AREAS
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
          )}
        >
          <span>Todas</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
              selectedId === ALL_TEAM_AREAS
                ? 'bg-primary-foreground/15'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {areas.reduce((total, area) => total + area.open_count, 0)}
          </span>
        </button>
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
  metrics: { rojos: number; vencidas: number; abiertas: number; retrasoLabel: string }
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
      label: metrics.retrasoLabel,
      value: metrics.vencidas,
      hint: 'Fecha o hora límite rebasada',
      icon: Clock3,
      tone: 'border-orange-200/80 bg-orange-50/80',
      valueTone: 'text-orange-700',
      labelTone: 'text-orange-800/80',
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
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
  const [panelOpen, setPanelOpen] = useState(false)
  const [showClosedSeries, setShowClosedSeries] = useState(false)
  const active = series.filter((serie) => serie.serie_activa)
  if (!series.length) return null
  const visible = showClosedSeries ? series : active
  const collapsedHint =
    active.length === 0
      ? `${series.length} serie${series.length === 1 ? '' : 's'} cerrada${series.length === 1 ? '' : 's'}`
      : active.length === 1
        ? [
            active[0].titulo,
            formatRecurrenceLabel(active[0]),
            (() => {
              const next = upcomingOccurrenceDate(active[0], todayIso())
              return next ? `Próxima ${formatIsoDate(next)}` : null
            })(),
          ]
            .filter(Boolean)
            .join(' · ')
        : `${active.length} activas · ${active.map((serie) => serie.titulo).slice(0, 2).join(', ')}${active.length > 2 ? '…' : ''}`

  return (
    <section className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3 shadow-sm sm:p-4">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 text-left"
        onClick={() => setPanelOpen((current) => !current)}
        aria-expanded={panelOpen}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Repeat2 className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
            <h2 className="text-sm font-semibold text-sky-900">Acciones frecuentes</h2>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-800">
              {active.length} activa{active.length === 1 ? '' : 's'}
            </span>
          </div>
          {!panelOpen ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-sky-900/70">{collapsedHint}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-sky-700 transition-transform duration-200',
            panelOpen && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {panelOpen ? (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-sky-200/60 pt-3">
            <p className="text-[11px] leading-relaxed text-sky-900/70">
              Cada vez que se cumple la fecha de la frecuencia se genera una acción nueva en el tablero.
            </p>
            {series.length > active.length ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2 text-xs text-sky-800"
                onClick={() => setShowClosedSeries((current) => !current)}
              >
                {showClosedSeries ? 'Ver solo activas' : `Ver cerradas (${series.length - active.length})`}
              </Button>
            ) : null}
          </div>

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
        </>
      ) : null}
    </section>
  )
}

function teamActionStatusLabel(action: TeamAction, board: TeamBoard, overdue: boolean) {
  if (overdue) return findTeamRetrasoState(board)?.nombre ?? 'Retraso'
  return board.states.find((state) => state.id === action.estado_id)?.nombre ?? 'Sin estatus'
}

function teamActionStatusTone(label: string): string | undefined {
  const normalized = label.trim().toLowerCase()
  if (normalized === 'vencida' || normalized === 'retraso') {
    return 'text-orange-600 dark:text-orange-400 font-medium'
  }
  if (normalized.includes('bloque')) return 'text-destructive font-medium'
  return undefined
}

function TeamCardHeaderMeta({
  action,
  board,
  overdue,
}: {
  action: TeamAction
  board: TeamBoard
  overdue: boolean
}) {
  const checklistTotal = action.checklist?.length ?? 0
  const checklistDone = action.checklist?.filter((item) => item.done).length ?? 0
  const status = teamActionStatusLabel(action, board, overdue)
  const segments: { key: string; text: string; className?: string }[] = [
    { key: 'owner', text: action.asignado_nombre || 'Sin asignar' },
  ]

  if (checklistTotal > 0) {
    segments.push({
      key: 'checklist',
      text: `${checklistDone}/${checklistTotal}`,
      className: 'tabular-nums font-medium text-foreground/80',
    })
  }

  segments.push({
    key: 'status',
    text: status,
    className: teamActionStatusTone(status),
  })

  if (action.fecha_limite) {
    segments.push({
      key: 'due',
      text: formatDueDate(action.fecha_limite),
      className: overdue ? 'font-medium text-orange-600 dark:text-orange-400' : undefined,
    })
  }

  return (
    <p className="mt-1 truncate text-xs text-muted-foreground">
      {segments.map((segment, index) => (
        <span key={segment.key}>
          {index > 0 ? <span className="text-muted-foreground/50"> • </span> : null}
          <span className={segment.className}>{segment.text}</span>
        </span>
      ))}
    </p>
  )
}

function TeamActionEditDialog({
  action,
  board,
  priorities,
  asignadorNombre,
  commentCount,
  isSaving = false,
  onClose,
  onSave,
  onDueDateChange,
  onEscalate,
  onCloseSeries,
}: {
  action: TeamAction | null
  board: TeamBoard
  priorities: Priority[]
  asignadorNombre?: string | null
  commentCount: number
  isSaving?: boolean
  onClose: () => void
  onSave: (patch: {
    actionId: string
    stateId?: string
    assignee?: string
    priority?: string
  }) => void
  onDueDateChange: (
    action: TeamAction,
    input: {
      dueAt: string
      reasonKey: FechaCompromisoChangeReasonKey
      previousDate: string
      nextDate: string
    }
  ) => void
  onEscalate: (action: TeamAction) => void
  onCloseSeries: (action: TeamAction) => void
}) {
  const [mainExpanded, setMainExpanded] = useState(true)
  const [editExpanded, setEditExpanded] = useState(true)
  const [commentsExpanded, setCommentsExpanded] = useState(true)
  const [dueReason, setDueReason] = useState<FechaCompromisoChangeReasonKey | ''>('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('09:00')
  const [draftStateId, setDraftStateId] = useState('')
  const [draftAssignee, setDraftAssignee] = useState('')
  const [draftPriority, setDraftPriority] = useState('')

  useEffect(() => {
    setDueReason('')
    setDueDate(localDateInputFromIso(action?.fecha_limite))
    setDueTime(localTimeInputFromIso(action?.fecha_limite))
  }, [action?.id, action?.fecha_limite])

  useEffect(() => {
    if (!action) return
    setDraftStateId(action.estado_id)
    setDraftAssignee(action.asignado_a)
    setDraftPriority(action.prioridad)
  }, [action])

  if (!action) return null

  const canManage = board.canManage ?? board.isLeader
  const isRecurring = Boolean(action.serie_id) || Boolean(action.es_frecuente)
  const canChangeDueDate = canManage && !isRecurring
  const originalDueDate = localDateInputFromIso(action.fecha_limite)
  const dueDateChanged = Boolean(dueDate) && dueDate !== originalDueDate
  const hasFieldChanges =
    draftStateId !== action.estado_id ||
    draftAssignee !== action.asignado_a ||
    draftPriority !== action.prioridad
  const priority = priorities.find((item) => item.nombre === draftPriority)
  const overdue = isOverdue(action, board)
  const statusName = teamActionStatusLabel(
    { ...action, estado_id: draftStateId, prioridad: draftPriority, asignado_a: draftAssignee },
    board,
    overdue
  )

  const submitDueDateChange = () => {
    if (!dueReason || !dueDate || !dueDateChanged) return
    onDueDateChange(action, {
      dueAt: new Date(`${dueDate}T${dueTime || '09:00'}:00`).toISOString(),
      reasonKey: dueReason,
      previousDate: originalDueDate,
      nextDate: dueDate,
    })
  }

  const handleSave = () => {
    if (!canManage || !hasFieldChanges || isSaving) return
    const patch: {
      actionId: string
      stateId?: string
      assignee?: string
      priority?: string
    } = { actionId: action.id }
    if (draftStateId !== action.estado_id) patch.stateId = draftStateId
    if (draftAssignee !== action.asignado_a) patch.assignee = draftAssignee
    if (draftPriority !== action.prioridad) patch.priority = draftPriority
    onSave(patch)
  }

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        id="team-kanban-action-dialog"
        className={cn(
          'accion-form-dialog !flex flex-col gap-0 overflow-hidden p-0',
          'fixed left-0 right-0 top-0 z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none',
          'translate-x-0 translate-y-0 rounded-none border-x-0 border-t-0',
          'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
          'sm:left-[50%] sm:right-auto sm:top-[50%] sm:h-auto sm:max-h-[min(90dvh,900px)]',
          'sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border',
          'sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]',
          'sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]',
          '[&>button]:right-3 [&>button]:top-3 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center',
          'sm:[&>button]:right-4 sm:[&>button]:top-4 sm:[&>button]:h-auto sm:[&>button]:w-auto'
        )}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Editar accion de equipo</DialogTitle>
        <div className="accion-form-dialog-header shrink-0 border-b border-border/60 bg-card px-3 py-2.5 pr-11 sm:px-4 sm:py-3 sm:pr-12">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 pr-1">
              <h2 className="line-clamp-1 text-sm font-semibold leading-tight tracking-tight sm:text-base">
                Editar accion
              </h2>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">
                Kanban por Equipos - {action.asignado_nombre || 'Sin responsable'}
              </p>
            </div>
            <div className="flex w-fit max-w-full flex-wrap items-center gap-1.5 sm:max-w-[60%] sm:justify-end">
              <AccionPriorityBadge prioridad={priority?.nombre ?? action.prioridad} catalogColor={priority?.color} compact />
              <Badge variant="outline" className="text-[10px]">{statusName}</Badge>
              {commentCount > 0 ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <MessageCircle className="h-3 w-3" />
                  {commentCount}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="accion-form-dialog-body min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
          <AccionAsignadorNote nombre={asignadorNombre} />
          <AccionFormSection
            sectionId="team-action-main"
            icon={FileText}
            eyebrow="Detalle"
            title="Informacion principal"
            subtitle="Resumen de la accion creada."
            collapsible
            expanded={mainExpanded}
            onToggle={() => setMainExpanded((current) => !current)}
            collapsedHint={action.titulo}
          >
            <div className="space-y-4">
              <AccionFormField label="Titulo">
                <Input value={action.titulo} readOnly className="h-10 bg-muted/30" />
              </AccionFormField>
              <AccionFormField label="Descripcion">
                <textarea
                  value={action.descripcion ?? ''}
                  readOnly
                  rows={4}
                  className="min-h-[7rem] w-full resize-y rounded-md border border-input bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground"
                />
              </AccionFormField>
              {action.checklist.length > 0 ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-sm font-medium text-foreground">Checklist</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {action.checklist.map((item, index) => (
                      <li key={`${item.text}-${index}`} className="flex items-start gap-2">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" aria-hidden />
                        <span className={item.done ? 'line-through opacity-70' : undefined}>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </AccionFormSection>

          <AccionFormSection
            sectionId="team-action-edit"
            icon={SlidersHorizontal}
            eyebrow="Edicion"
            title="Seguimiento operativo"
            subtitle="Actualiza responsable, estatus, prioridad y fecha compromiso."
            collapsible
            expanded={editExpanded}
            onToggle={() => setEditExpanded((current) => !current)}
            collapsedHint={`${statusName} - ${action.asignado_nombre || 'Sin responsable'}`}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AccionFormField label="Estatus">
                <Select
                  value={draftStateId}
                  onValueChange={setDraftStateId}
                  disabled={!canManage || isSaving}
                >
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {board.states.map((state) => <SelectItem key={state.id} value={state.id}>{state.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </AccionFormField>
              <AccionFormField label="Responsable">
                <TeamMemberSelect
                  members={board.members}
                  value={draftAssignee}
                  onValueChange={(value) => { if (value) setDraftAssignee(value) }}
                  disabled={!canManage || isSaving}
                />
              </AccionFormField>
              <AccionFormField label="Prioridad">
                <Select
                  value={draftPriority}
                  onValueChange={setDraftPriority}
                  disabled={!canManage || isSaving}
                >
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorities.map((item) => <SelectItem key={item.id} value={item.nombre}>{item.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </AccionFormField>
              <AccionFormField label="Fecha limite actual">
                <Input value={action.fecha_limite ? formatDueDate(action.fecha_limite) : 'Sin fecha'} readOnly className="h-10 bg-muted/30" />
              </AccionFormField>
            </div>

            {canChangeDueDate ? (
              <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                <AccionFormField label="Motivo del cambio de fecha" required>
                  <Select value={dueReason || undefined} onValueChange={(value) => setDueReason(value as FechaCompromisoChangeReasonKey)}>
                    <SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Primero selecciona motivo" /></SelectTrigger>
                    <SelectContent>
                      {FECHA_COMPROMISO_CHANGE_REASONS.map((reason) => <SelectItem key={reason.key} value={reason.key}>{reason.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </AccionFormField>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                  <Input type="date" min={todayIso()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={!dueReason} className="h-10 bg-background" />
                  <Input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!dueReason} className="h-10 bg-background" />
                </div>
                <Button type="button" size="sm" variant="outline" className="mt-3 h-9 w-full" disabled={!dueReason || !dueDateChanged} onClick={submitDueDateChange}>
                  Actualizar fecha compromiso
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
              {canManage && !action.escalada ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onEscalate(action)}>
                  Escalar a corporativo
                </Button>
              ) : null}
              {canManage && action.serie_id ? (
                <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => onCloseSeries(action)}>
                  <CircleSlash className="mr-2 h-4 w-4" />
                  Cerrar recurrencia
                </Button>
              ) : null}
            </div>
          </AccionFormSection>

          <AccionFormSection
            sectionId="team-action-comments"
            icon={MessageCircle}
            eyebrow="Seguimiento"
            title="Comentarios"
            subtitle="Registra avances y contexto operativo."
            collapsible
            expanded={commentsExpanded}
            onToggle={() => setCommentsExpanded((current) => !current)}
            collapsedHint={`${commentCount} comentario${commentCount !== 1 ? 's' : ''}`}
          >
            <TeamActionComentarios
              actionId={action.id}
              actionTitle={action.titulo}
              actionDescription={action.descripcion ?? ''}
              assigneeId={action.asignado_a}
              memberOptions={board.members}
              enabled={commentsExpanded}
            />
          </AccionFormSection>
        </div>

        <div className="shrink-0 border-t border-border/60 bg-card px-3 py-3 sm:px-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <p className="text-xs text-muted-foreground">
              {hasFieldChanges ? 'Tienes cambios sin guardar.' : 'Sin cambios pendientes.'}
            </p>
            <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-10 sm:h-9"
              onClick={handleSave}
              disabled={!canManage || !hasFieldChanges || isSaving}
            >
              {isSaving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActionCard({
  action,
  board,
  areaName,
  priorities,
  commentCount,
  onOpenDetail,
  onMove,
  onAssign,
  onPriority,
  onDueDateChange,
  onEscalate,
  onCloseSeries,
}: {
  action: TeamAction
  board: TeamBoard
  areaName?: string
  priorities: Priority[]
  commentCount: number
  onOpenDetail: () => void
  onMove: (s: string) => void
  onAssign: (s: string) => void
  onPriority: (s: string) => void
  onDueDateChange: (input: {
    dueAt: string
    reasonKey: FechaCompromisoChangeReasonKey
    previousDate: string
    nextDate: string
  }) => void
  onEscalate: () => void
  onCloseSeries: () => void
}) {
  const overdue = isOverdue(action, board)
  const critical = isCritical(action, board)
  const canManage = board.canManage ?? board.isLeader
  const recurrence = formatRecurrence(action)
  const isRecurring = Boolean(action.serie_id) || Boolean(action.es_frecuente)
  const priority = priorities.find((item) => item.nombre === action.prioridad)
  const priorityName = priority?.nombre ?? action.prioridad
  const expanded = false
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

  return (
    <Card
      className={cn(
        'group rounded-xl border border-border/60 bg-card text-left shadow-sm',
        'transition-all duration-200 ease-out hover:border-border hover:shadow-md',
        expanded && 'border-primary/25 ring-1 ring-primary/10',
        isRecurring && 'border-l-4 border-l-sky-400',
        overdue && 'border-orange-300 ring-1 ring-orange-200',
        critical && !overdue && 'border-red-200'
      )}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <CardHeader className={cn('block space-y-0 p-3', expanded && 'border-b border-border/50')}>
        <div className="flex items-start gap-1.5">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpenDetail}>
            {areaName ? (
              <p className="mb-1 truncate text-[10px] font-semibold uppercase text-muted-foreground">
                {areaName}
              </p>
            ) : null}
            <div className="flex items-start gap-2 pr-1">
              <AccionPriorityBadge
                prioridad={priorityName}
                catalogColor={priority?.color}
                compact
                className="mt-0.5 max-w-[6.5rem] shrink-0"
              />
              <p
                className="line-clamp-2 text-sm font-medium leading-snug text-foreground"
                title={action.titulo}
              >
                {action.titulo}
              </p>
            </div>
            <div className="pl-[18px]">
              <TeamCardHeaderMeta action={action} board={board} overdue={overdue} />
            </div>
          </button>

          <div className="flex shrink-0 flex-col items-end gap-1 self-start">
            {commentCount > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={`${commentCount} comentario${commentCount !== 1 ? 's' : ''}`}
                aria-label={`${commentCount} comentario${commentCount !== 1 ? 's' : ''}`}
              >
                <MessageCircle className="h-3 w-3" aria-hidden />
                {commentCount}
              </span>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  aria-label="Opciones de la accion"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem onClick={onOpenDetail}>
                  Ver / editar accion
                </DropdownMenuItem>
                {canManage && !action.escalada ? (
                  <DropdownMenuItem onClick={onEscalate}>
                    Escalar a corporativo
                  </DropdownMenuItem>
                ) : null}
                {canManage && action.serie_id ? (
                  <DropdownMenuItem className="text-destructive" onClick={onCloseSeries}>
                    Cerrar recurrencia
                  </DropdownMenuItem>
                ) : null}
                {commentCount > 0 ? (
                  <DropdownMenuItem disabled>
                    {commentCount} comentario{commentCount !== 1 ? 's' : ''}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {(recurrence || action.escalada) && (
          <div className="mt-2 flex flex-wrap gap-1 pl-[18px]">
            {recurrence ? (
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] text-sky-800">
                <Repeat2 className="mr-1 h-3 w-3" />
                {recurrence}
                {action.ocurrencia_fecha ? ` · ${formatIsoDate(action.ocurrencia_fecha)}` : ''}
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
      {expanded ? (
      <CardContent className="space-y-2.5 p-3.5">
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
              <TeamMemberSelect
                members={board.members}
                value={action.asignado_a}
                onValueChange={(value) => { if (value) onAssign(value) }}
                compact
                className="h-9 w-full border-border/70 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Prioridad</Label>
              <Select value={action.prioridad} onValueChange={onPriority}>
                <SelectTrigger className="h-9 border-border/70 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p.id} value={p.nombre}>
                      {p.nombre}
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

        <TeamActionComentarios
          actionId={action.id}
          actionTitle={action.titulo}
          actionDescription={action.descripcion ?? ''}
          assigneeId={action.asignado_a}
          memberOptions={board.members}
          enabled={expanded}
        />

      </CardContent>
      ) : null}
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
      toast.success('Accion trasladada al Kanban Corporativo')
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
          La accion se movera al Kanban Corporativo y dejara de aparecer en este tablero.
          Se conservaran sus datos, comentarios, adjuntos, checklist y trazabilidad.
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
          Mover a Corporativo
        </Button>
      </DialogContent>
    </Dialog>
  )
}
