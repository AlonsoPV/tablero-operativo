/**
 * Tablero Kanban rediseñado — estilo SaaS/producto moderno.
 * Columnas con acento visual, cards premium, empty states, scroll refinado.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { AccionDiaria, ActionStatus } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import { useStatuses } from '@/features/catalogs/hooks/useStatuses'
import { useUpdateAccionEstado } from '../hooks/useAccionMutations'
import { useCommentCounts } from '../hooks/useCommentCounts'
import { useActionEstadoPermissions } from '../hooks/useActionEstadoPermissions'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import {
  getAccionKanbanColumn,
  getAutoEstadoPorFechaCompromiso,
  isEnRetraso,
} from '../utils/accionUtils'
import { accionEstadoLabel, getAccionDisplayEstado } from '../utils/accionEstadoDisplay'
import {
  AlertCircle,
  Clock,
  Sun,
  PlayCircle,
  CheckCircle,
  BadgeCheck,
  Plus,
  AlertTriangle,
  MoreVertical,
  Info,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Check,
  MessageSquare,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AccionPriorityBadge } from './AccionPriorityBadge'
import { findPriorityForAccion } from '../utils/resolveAccionPrioridad'
import {
  hexToRgba,
  orderedActionStatuses,
  statusCatalogByKey,
  statusCatalogColor,
  statusCatalogDescription,
  statusCatalogLabel,
} from '../utils/statusCatalog'
const COLUMN_ORDER: ActionStatus[] = [
  'Pendiente',
  'Hoy',
  'En_Ejecucion',
  'Bloqueado',
  'Retraso',
  'Hecho',
  'Verificado',
]

const COLUMN_LABELS: Record<ActionStatus, string> = {
  Pendiente: 'Pendiente',
  Hoy: 'Hoy',
  En_Ejecucion: 'En ejecución',
  Bloqueado: 'Bloqueado',
  Retraso: 'Retraso',
  Hecho: 'Hecho',
  Verificado: 'Verificado',
}

const COLUMN_ICONS: Record<ActionStatus, React.ComponentType<{ className?: string }>> = {
  Pendiente: Clock,
  Hoy: Sun,
  En_Ejecucion: PlayCircle,
  Bloqueado: AlertCircle,
  Retraso: AlertTriangle,
  Hecho: CheckCircle,
  Verificado: BadgeCheck,
}

const COLUMN_DESCRIPTIONS: Record<ActionStatus, string> = {
  Pendiente: 'Acción creada, aún no programada para hoy ni en ejecución.',
  Hoy: 'Acción programada para hoy; pendiente de iniciar.',
  En_Ejecucion: 'Acción en curso.',
  Bloqueado: 'Acción detenida por un impedimento; requiere desbloqueo.',
  Retraso: 'Acción que superó su fecha o hora límite sin completarse.',
  Hecho: 'Acción completada.',
  Verificado: 'Acción cerrada y verificada.',
}

/** Acento por columna: borde izquierdo + fondo muy sutil */
const COLUMN_STYLES: Record<ActionStatus, { border: string; bg: string; icon: string }> = {
  Pendiente: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-500/5',
    icon: 'text-slate-500',
  },
  Hoy: {
    border: 'border-l-amber-400',
    bg: 'bg-amber-500/5',
    icon: 'text-amber-600',
  },
  En_Ejecucion: {
    border: 'border-l-blue-400',
    bg: 'bg-blue-500/5',
    icon: 'text-blue-600',
  },
  Bloqueado: {
    border: 'border-l-red-400',
    bg: 'bg-red-500/5',
    icon: 'text-red-600',
  },
  Retraso: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/5',
    icon: 'text-orange-600',
  },
  Hecho: {
    border: 'border-l-emerald-400',
    bg: 'bg-emerald-500/5',
    icon: 'text-emerald-600',
  },
  Verificado: {
    border: 'border-l-violet-400',
    bg: 'bg-violet-500/5',
    icon: 'text-violet-600',
  },
}


function kanbanCardStatusLabel(accion: AccionDiaria, overdue: boolean): string {
  if (overdue) return 'Vencido'
  return accionEstadoLabel(getAccionDisplayEstado(accion))
}

function kanbanCardStatusTone(status: string): string | undefined {
  if (status === 'Vencido') return 'text-orange-600 dark:text-orange-400 font-medium'
  if (status === 'Bloqueado') return 'text-destructive font-medium'
  return undefined
}

function KanbanCardMeta({
  accion,
  responsableName,
  checklistProgress,
  overdue,
}: {
  accion: AccionDiaria
  responsableName: string
  checklistProgress?: { total: number; completed: number }
  overdue: boolean
}) {
  const status = kanbanCardStatusLabel(accion, overdue)
  const segments: { key: string; text: string; className?: string }[] = [
    { key: 'owner', text: responsableName },
  ]

  if (checklistProgress && checklistProgress.total > 0) {
    segments.push({
      key: 'checklist',
      text: `${checklistProgress.completed}/${checklistProgress.total}`,
      className: 'tabular-nums font-medium text-foreground/80',
    })
  }

  segments.push({
    key: 'status',
    text: status,
    className: kanbanCardStatusTone(status),
  })

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

/** Acciones visibles por columna antes de expandir (el resto queda colapsado). */
const COLUMN_PREVIEW_LIMIT = 3

type ColumnSortBy = 'edicion' | 'fecha_entrega' | 'prioridad'

const PRIORITY_SORT_RANK: Record<string, number> = {
  P1_Critica: 0,
  P2_Media: 1,
  P3_Baja: 2,
}

type StatusCatalogMap = ReturnType<typeof statusCatalogByKey>

function deliveryTimestampMs(a: AccionDiaria): number {
  const time = a.hora_limite?.length === 5 ? `${a.hora_limite}:00` : a.hora_limite ?? '00:00:00'
  const ms = Date.parse(`${a.fecha}T${time}`)
  return Number.isFinite(ms) ? ms : 0
}

function updatedTimestampMs(a: AccionDiaria): number {
  const ms = Date.parse(a.updated_at ?? a.created_at ?? '')
  return Number.isFinite(ms) ? ms : 0
}

function sortAccionesByColumnPreference(
  actions: AccionDiaria[],
  sortBy: ColumnSortBy,
  priorities: Priority[]
): AccionDiaria[] {
  const list = [...actions]
  if (sortBy === 'edicion') {
    list.sort((a, b) => updatedTimestampMs(b) - updatedTimestampMs(a))
  } else if (sortBy === 'fecha_entrega') {
    list.sort((a, b) => deliveryTimestampMs(a) - deliveryTimestampMs(b))
  } else {
    list.sort(
      (a, b) => {
        const pa = findPriorityForAccion(a, priorities)
        const pb = findPriorityForAccion(b, priorities)
        return (
          (pa?.orden ?? PRIORITY_SORT_RANK[a.prioridad] ?? 99) -
          (pb?.orden ?? PRIORITY_SORT_RANK[b.prioridad] ?? 99)
        )
      }
    )
  }
  return list
}

/** Oculta la scrollbar nativa; el desplazamiento se indica con la barra inferior. */
const KANBAN_H_SCROLL_CLASSES =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

const KANBAN_SCROLL_SIDE_PADDING = 40
/** Reduce la sensibilidad del trackpad / rueda horizontal. */
const KANBAN_WHEEL_DAMPING = 0.38

type KanbanStatusNavItem = {
  status: ActionStatus
  label: string
  count: number
  color?: string | null
}

function getKanbanColumns(el: HTMLDivElement) {
  return Array.from(el.querySelectorAll<HTMLElement>(':scope > .kanban-column'))
}

function getKanbanActiveColumnStatus(el: HTMLDivElement): ActionStatus | null {
  const columns = getKanbanColumns(el)
  if (columns.length === 0) return null

  const anchor = el.scrollLeft + KANBAN_SCROLL_SIDE_PADDING + 6
  let activeColumn = columns[0]
  for (const column of columns) {
    if (column.offsetLeft <= anchor) activeColumn = column
  }

  return (activeColumn.dataset.status as ActionStatus | undefined) ?? null
}

function scrollKanbanToColumn(el: HTMLDivElement, status: ActionStatus) {
  const column = getKanbanColumns(el).find((item) => item.dataset.status === status)
  if (!column) return

  el.scrollTo({
    left: Math.max(0, column.offsetLeft - KANBAN_SCROLL_SIDE_PADDING),
    behavior: 'smooth',
  })
}

function scrollKanbanToAdjacentColumn(el: HTMLDivElement, dir: -1 | 1) {
  const columns = getKanbanColumns(el)
  if (columns.length === 0) return

  const anchor = el.scrollLeft + KANBAN_SCROLL_SIDE_PADDING + 6
  let activeIdx = 0
  for (let i = 0; i < columns.length; i++) {
    if (columns[i].offsetLeft <= anchor) activeIdx = i
  }

  const nextIdx = Math.min(columns.length - 1, Math.max(0, activeIdx + dir))
  if (nextIdx === activeIdx) return

  el.scrollTo({
    left: Math.max(0, columns[nextIdx].offsetLeft - KANBAN_SCROLL_SIDE_PADDING),
    behavior: 'smooth',
  })
}

function stepKanbanScrollOnTrack(
  el: HTMLDivElement,
  track: HTMLDivElement,
  clientX: number,
  thumbLeftPct: number,
  thumbWidthPct: number
) {
  const rect = track.getBoundingClientRect()
  const clickX = clientX - rect.left
  const thumbCenter =
    (thumbLeftPct / 100) * rect.width + ((thumbWidthPct / 100) * rect.width) / 2

  if (clickX < thumbCenter - 14) {
    scrollKanbanToAdjacentColumn(el, -1)
    return
  }
  if (clickX > thumbCenter + 14) {
    scrollKanbanToAdjacentColumn(el, 1)
  }
}

function KanbanBoardScrollArea({
  id,
  columnCount,
  navItems,
  children,
}: {
  id: string
  columnCount: number
  navItems: KanbanStatusNavItem[]
  children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ clientX: number; scrollLeft: number } | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [activeStatus, setActiveStatus] = useState<ActionStatus | null>(navItems[0]?.status ?? null)
  const [isDraggingThumb, setIsDraggingThumb] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
  })

  const refreshEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    setScrollMetrics({ scrollLeft, scrollWidth, clientWidth })
    setActiveStatus(getKanbanActiveColumnStatus(el))
    if (maxScroll <= 0) {
      setEdges({ left: false, right: false })
      return
    }
    setEdges({
      left: scrollLeft > 1,
      right: scrollLeft < maxScroll - 1,
    })
  }, [])

  useEffect(() => {
    setActiveStatus((current) => {
      if (current && navItems.some((item) => item.status === current)) return current
      return navItems[0]?.status ?? null
    })
  }, [navItems])

  useEffect(() => {
    const el = navRef.current
    if (!el || !activeStatus) return
    const active = el.querySelector<HTMLElement>(`[data-status-nav="${activeStatus}"]`)
    if (!active) return
    const frame = window.requestAnimationFrame(() => {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeStatus])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    refreshEdges()
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(refreshEdges)
    })
    ro.observe(el)
    el.addEventListener('scroll', refreshEdges, { passive: true })
    window.addEventListener('resize', refreshEdges)

    const onWheel = (e: WheelEvent) => {
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
      if (maxScroll <= 0) return

      const absX = Math.abs(e.deltaX)
      const absY = Math.abs(e.deltaY)
      const horizontalIntent = absX > absY || e.shiftKey
      if (!horizontalIntent) return

      const rawDelta = e.shiftKey && absX < absY ? e.deltaY : e.deltaX
      if (Math.abs(rawDelta) < 0.5) return

      const atLeft = el.scrollLeft <= 0 && rawDelta < 0
      const atRight = el.scrollLeft >= maxScroll - 1 && rawDelta > 0
      if (atLeft || atRight) return

      e.preventDefault()
      el.scrollBy({ left: rawDelta * KANBAN_WHEEL_DAMPING })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', refreshEdges)
      window.removeEventListener('resize', refreshEdges)
      el.removeEventListener('wheel', onWheel)
    }
  }, [refreshEdges, columnCount])

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    scrollKanbanToAdjacentColumn(el, dir)
  }, [])

  const scrollToStatus = useCallback((status: ActionStatus) => {
    const el = scrollRef.current
    if (!el) return
    setActiveStatus(status)
    scrollKanbanToColumn(el, status)
  }, [])

  const showNav = columnCount > 1
  const maxScroll = Math.max(0, scrollMetrics.scrollWidth - scrollMetrics.clientWidth)
  const canScrollHorizontally = showNav && maxScroll > 0
  const thumbWidthPct =
    scrollMetrics.scrollWidth > 0
      ? Math.min(100, (scrollMetrics.clientWidth / scrollMetrics.scrollWidth) * 100)
      : 100
  const thumbLeftPct =
    maxScroll > 0 ? (scrollMetrics.scrollLeft / maxScroll) * (100 - thumbWidthPct) : 0

  const jumpScrollOnTrack = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      const track = trackRef.current
      if (!el || !track) return
      stepKanbanScrollOnTrack(el, track, clientX, thumbLeftPct, thumbWidthPct)
    },
    [thumbLeftPct, thumbWidthPct]
  )

  const dragThumb = useCallback((clientX: number) => {
    const el = scrollRef.current
    const track = trackRef.current
    const start = dragStartRef.current
    if (!el || !track || !start) return
    const rect = track.getBoundingClientRect()
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
    const movableWidth = rect.width * (1 - thumbWidthPct / 100)
    if (maxScroll <= 0 || movableWidth <= 0) return

    const deltaPx = clientX - start.clientX
    el.scrollLeft = Math.min(maxScroll, Math.max(0, start.scrollLeft + (deltaPx / movableWidth) * maxScroll))
  }, [thumbWidthPct])

  const handleThumbPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    event.preventDefault()
    event.stopPropagation()
    dragStartRef.current = { clientX: event.clientX, scrollLeft: el.scrollLeft }
    setIsDraggingThumb(true)
  }, [])

  useEffect(() => {
    if (!isDraggingThumb) return

    const handleMove = (event: globalThis.PointerEvent) => {
      dragThumb(event.clientX)
    }
    const handleUp = () => {
      dragStartRef.current = null
      setIsDraggingThumb(false)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
    window.addEventListener('pointercancel', handleUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragThumb, isDraggingThumb])

  return (
    <div className="relative min-w-0">
      {showNav ? (
        <div className="mb-2 rounded-xl border border-border/60 bg-card/80 p-1.5 shadow-sm">
          <div
            ref={navRef}
            className={cn(
              'flex gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth',
              'snap-x snap-proximity touch-pan-x',
              KANBAN_H_SCROLL_CLASSES
            )}
            aria-label="Estatus del tablero"
          >
            {navItems.map((item) => {
              const active = activeStatus === item.status
              const Icon = COLUMN_ICONS[item.status]
              return (
                <button
                  key={item.status}
                  type="button"
                  data-status-nav={item.status}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`Ir a estatus ${item.label}`}
                  onClick={() => scrollToStatus(item.status)}
                  className={cn(
                    'group flex h-9 min-w-fit snap-start items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background',
                    active
                      ? 'border-primary/45 bg-primary/10 text-primary shadow-sm'
                      : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground'
                    )}
                    style={item.color && !active ? { color: item.color } : undefined}
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="max-w-[8rem] truncate">{item.label}</span>
                  <span
                    className={cn(
                      'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums',
                      active ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
                    )}
                  >
                    {item.count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      {/* Botones fuera del carril de scroll (capa superior solo en el margen); el padding del carril evita que las columnas queden debajo. */}
      {showNav && edges.left ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="pointer-events-auto absolute left-0 top-[calc(50%-0.75rem)] z-30 h-9 w-9 -translate-y-1/2 rounded-full border border-primary/25 bg-background/95 text-primary shadow-lg backdrop-blur-sm hover:border-primary/40 hover:bg-background"
          onClick={() => scrollByDir(-1)}
          aria-label="Desplazar columnas hacia la izquierda"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      ) : null}
      {showNav && edges.right ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="pointer-events-auto absolute right-0 top-[calc(50%-0.75rem)] z-30 h-9 w-9 -translate-y-1/2 rounded-full border border-primary/25 bg-background/95 text-primary shadow-lg backdrop-blur-sm hover:border-primary/40 hover:bg-background"
          onClick={() => scrollByDir(1)}
          aria-label="Desplazar columnas hacia la derecha"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      ) : null}
      <div
        ref={scrollRef}
        id={id}
        className={cn(
          'kanban-board flex gap-4 overflow-x-auto overscroll-x-contain pb-2 pt-1 sm:gap-5',
          /* Reserva fija para que el contenido (columnas) nunca quede bajo los botones ni se recorte con efecto de velo */
          showNav ? 'scroll-pl-10 scroll-pr-10 px-10' : 'px-0.5',
          'snap-x snap-proximity touch-pan-x',
          KANBAN_H_SCROLL_CLASSES
        )}
      >
        {children}
      </div>
      {canScrollHorizontally ? (
        <div
          className={cn('mt-1 px-0.5', showNav && 'px-10')}
        >
          <div
            ref={trackRef}
            className={cn(
              'group relative h-4 cursor-pointer rounded-full border border-border/70 bg-muted/90 p-0.5 shadow-inner',
              isDraggingThumb && 'cursor-grabbing'
            )}
            onClick={(e) => jumpScrollOnTrack(e.clientX)}
            aria-label="Barra de desplazamiento de estatus"
            role="scrollbar"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={maxScroll}
            aria-valuenow={scrollMetrics.scrollLeft}
          >
            <div
              className={cn(
                'absolute top-0.5 h-3 min-w-[3rem] rounded-full bg-primary shadow-md ring-1 ring-primary/30 transition-colors group-hover:bg-primary/90',
                isDraggingThumb ? 'cursor-grabbing bg-primary/90' : 'cursor-grab'
              )}
              onPointerDown={handleThumbPointerDown}
              onClick={(event) => event.stopPropagation()}
              style={{
                width: `calc(${thumbWidthPct}% - 0.25rem)`,
                left: `${thumbLeftPct}%`,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export interface KanbanBoardProps {
  acciones: AccionDiaria[]
  isLoading?: boolean
  responsableNames?: Record<string, string>
  onSelectAccion?: (accion: AccionDiaria) => void
  onNewAction?: () => void
  /** Cuando está definido, se muestra solo la columna de este estado (sincronizado con el filtro de la toolbar). */
  filterEstado?: ActionStatus
  /**
   * Si es true y no hay `filterEstado`, solo se muestran columnas con al menos una tarjeta
   * (p. ej. filtro por prioridad/área/responsable ya aplicado en `acciones`).
   */
  narrowToOccupiedColumns?: boolean
  /** Progreso de checklist por acción (checkpoints activos). */
  checklistProgressByAccionId?: Record<string, { total: number; completed: number }>
}

function KanbanCardInner({
  accion,
  responsableName,
  commentCount = 0,
  isDragging,
  isOverlay,
  dragHandleProps,
  onClick,
  onMoveEstado,
  checklistProgress,
  estadoPermission,
  priority,
  statusByKey,
}: {
  accion: AccionDiaria
  responsableName: string
  commentCount?: number
  isDragging?: boolean
  isOverlay?: boolean
  dragHandleProps?: { attributes: object; listeners?: object }
  onClick?: () => void
  onMoveEstado?: (estado: ActionStatus) => void
  checklistProgress?: { total: number; completed: number }
  estadoPermission?: ReturnType<typeof useActionEstadoPermissions>
  priority?: Priority
  statusByKey: StatusCatalogMap
}) {
  const overdue = isEnRetraso(accion)
  const priorityName = priority?.nombre ?? accion.prioridad

  const stopDrag = (e: PointerEvent) => e.stopPropagation()
  const stopMenuClick = (e: MouseEvent) => e.stopPropagation()

  const title = accion.titulo_accion?.trim() || accion.descripcion_accion

  return (
    <div
      {...(dragHandleProps?.attributes ?? {})}
      {...(dragHandleProps?.listeners ?? {})}
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group rounded-xl border border-border/60 bg-card p-3 text-left shadow-sm',
        'transition-all duration-200 ease-out',
        !isOverlay && 'cursor-grab active:cursor-grabbing hover:border-border hover:shadow-md',
        isDragging && 'scale-[0.98] opacity-40',
        isOverlay && 'scale-[1.02] cursor-grabbing shadow-xl ring-2 ring-primary/10'
      )}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 pr-1">
            <AccionPriorityBadge
              prioridad={priorityName}
              catalogColor={priority?.color}
              compact
              className="mt-0.5 max-w-[6.5rem] shrink-0"
            />
            <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground" title={title}>
              {title}
            </p>
          </div>
          <div className="pl-[18px]">
            <KanbanCardMeta
              accion={accion}
              responsableName={responsableName}
              checklistProgress={checklistProgress}
              overdue={overdue}
            />
          </div>
        </div>

        <div
          className={cn(
            'flex shrink-0 flex-col items-end gap-1 self-start',
            !isOverlay && (onClick || onMoveEstado) ? undefined : 'pointer-events-none'
          )}
          onPointerDown={stopDrag}
          onClick={stopMenuClick}
        >
          {commentCount > 0 ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={`${commentCount} comentario${commentCount !== 1 ? 's' : ''}`}
              aria-label={`${commentCount} comentario${commentCount !== 1 ? 's' : ''}`}
            >
              <MessageSquare className="h-3 w-3" aria-hidden />
              {commentCount}
            </span>
          ) : null}
          {!isOverlay && (onClick || onMoveEstado) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  aria-label="Opciones de la acción"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]" onClick={stopMenuClick}>
                {onClick ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onClick()
                    }}
                  >
                    Editar acción
                  </DropdownMenuItem>
                ) : null}
                {onClick && onMoveEstado ? <div className="my-1 h-px bg-border" role="separator" /> : null}
                {onMoveEstado
                  ? COLUMN_ORDER.filter((s) => s !== accion.estado).map((status) => {
                      const restricted = estadoPermission
                        ? !estadoPermission.canChangeTo(accion, status)
                        : false
                      const denyTitle = restricted
                        ? estadoPermission?.denialMessage(accion, status) ?? undefined
                        : undefined
                      return (
                        <DropdownMenuItem
                          key={status}
                          disabled={restricted}
                          title={denyTitle}
                          onClick={(e) => {
                            e.stopPropagation()
                            onMoveEstado(status)
                          }}
                        >
                          Mover a {statusCatalogLabel(status, statusByKey) || COLUMN_LABELS[status]}
                        </DropdownMenuItem>
                      )
                    })
                  : null}
                {commentCount > 0 ? (
                  <>
                    <div className="my-1 h-px bg-border" role="separator" />
                    <DropdownMenuItem disabled className="text-muted-foreground">
                      {commentCount} comentario{commentCount !== 1 ? 's' : ''}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function KanbanCard({
  accion,
  responsableName,
  commentCount = 0,
  onSelectAccion,
  onMoveEstado,
  checklistProgress,
  estadoPermission,
  priority,
  statusByKey,
}: {
  accion: AccionDiaria
  responsableName: string
  commentCount?: number
  onSelectAccion?: (accion: AccionDiaria) => void
  onMoveEstado?: (accion: AccionDiaria, estado: ActionStatus) => void
  checklistProgress?: { total: number; completed: number }
  estadoPermission?: ReturnType<typeof useActionEstadoPermissions>
  priority?: Priority
  statusByKey: StatusCatalogMap
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: accion.id,
    data: { accion },
  })
  return (
    <div ref={setNodeRef} className="kanban-card transition-transform duration-200" data-accion-id={accion.id}>
      <KanbanCardInner
        accion={accion}
        responsableName={responsableName}
        commentCount={commentCount}
        isDragging={isDragging}
        dragHandleProps={{ attributes, listeners }}
        onClick={() => onSelectAccion?.(accion)}
        onMoveEstado={
          onMoveEstado ? (estado) => onMoveEstado(accion, estado) : undefined
        }
        checklistProgress={checklistProgress}
        estadoPermission={estadoPermission}
        priority={priority}
        statusByKey={statusByKey}
      />
    </div>
  )
}

function KanbanColumnEmpty({
  status,
  onNewAction,
  statusByKey,
}: {
  status: ActionStatus
  onNewAction?: () => void
  statusByKey: StatusCatalogMap
}) {
  const Icon = COLUMN_ICONS[status]
  const label = statusCatalogLabel(status, statusByKey) || COLUMN_LABELS[status]
  const style = COLUMN_STYLES[status]
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center">
      <Icon className={cn('mb-2 h-8 w-8', style.icon, 'opacity-60')} />
      <p className="text-sm font-medium text-muted-foreground">Sin acciones en {label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground/80">
        Arrastra aquí o crea una nueva
      </p>
      {onNewAction && (
        <button
          type="button"
          onClick={onNewAction}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva acción
        </button>
      )}
    </div>
  )
}

function KanbanColumn({
  status,
  actions,
  responsableNames,
  commentCounts = {},
  onSelectAccion,
  onNewAction,
  onMoveEstado,
  checklistProgressByAccionId = {},
  /** Tarjeta activa no puede entrar a esta columna (Hecho/Verificado); solo UI — la validación final es al soltar. */
  dropForbidden = false,
  estadoPermission,
  priorities,
  statusByKey,
}: {
  status: ActionStatus
  actions: AccionDiaria[]
  responsableNames: Record<string, string>
  commentCounts?: Record<string, number>
  onSelectAccion?: (accion: AccionDiaria) => void
  onNewAction?: () => void
  onMoveEstado?: (accion: AccionDiaria, estado: ActionStatus) => void
  checklistProgressByAccionId?: Record<string, { total: number; completed: number }>
  dropForbidden?: boolean
  estadoPermission?: ReturnType<typeof useActionEstadoPermissions>
  priorities: Priority[]
  statusByKey: StatusCatalogMap
}) {
  const [expanded, setExpanded] = useState(false)
  const [sortBy, setSortBy] = useState<ColumnSortBy>('edicion')

  const sortedActions = useMemo(
    () => sortAccionesByColumnPreference(actions, sortBy, priorities),
    [actions, priorities, sortBy]
  )

  const hasOverflow = sortedActions.length > COLUMN_PREVIEW_LIMIT
  const visibleActions = useMemo(() => {
    if (!hasOverflow || expanded) return sortedActions
    return sortedActions.slice(0, COLUMN_PREVIEW_LIMIT)
  }, [sortedActions, hasOverflow, expanded])

  const hiddenCount = sortedActions.length - COLUMN_PREVIEW_LIMIT

  const { setNodeRef, isOver } = useDroppable({ id: status })
  const style = COLUMN_STYLES[status]
  const Icon = COLUMN_ICONS[status]
  const label = statusCatalogLabel(status, statusByKey)
  const description = statusCatalogDescription(status, statusByKey, COLUMN_DESCRIPTIONS[status])
  const catalogColor = statusCatalogColor(status, statusByKey)

  return (
    <div
      ref={setNodeRef}
      data-status={status}
      className={cn(
        'kanban-column flex w-[min(300px,calc(100vw-1.25rem))] shrink-0 snap-start flex-col rounded-2xl border border-border/50 border-l-4 transition-all duration-200 sm:w-[300px] sm:min-w-[280px] sm:max-w-[300px]',
        !catalogColor && style.border,
        style.bg,
        isOver &&
          (dropForbidden
            ? 'ring-2 ring-destructive/35 ring-offset-2 ring-offset-background'
            : 'ring-2 ring-primary/20 ring-offset-2 ring-offset-background')
      )}
      style={{
        borderLeftColor: catalogColor ?? undefined,
        backgroundColor: hexToRgba(catalogColor, 0.06),
      }}
    >
      <div className="kanban-column-header flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn('h-4 w-4 shrink-0', !catalogColor && style.icon)} />
          <h3 className="truncate text-sm font-semibold text-foreground">
            {label}
          </h3>
          <div className="group relative shrink-0">
            <button
              type="button"
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-background/80',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background'
              )}
              title="Ver descripción del estado"
              aria-label={`Descripción: ${description}`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <div
              role="tooltip"
              className={cn(
                'pointer-events-none absolute left-0 top-full z-50 mt-1.5 max-w-[260px] rounded-lg border border-border/80 bg-popover px-3 py-2.5 text-sm text-popover-foreground shadow-lg',
                'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
                'border-l-4',
                !catalogColor && style.border
              )}
              style={{ borderLeftColor: catalogColor ?? undefined }}
            >
              <p className="leading-snug text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                  title="Ordenar"
                  aria-label="Ordenar acciones de la columna"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => setSortBy('edicion')}
                >
                  <span className="flex-1">Edición reciente</span>
                  {sortBy === 'edicion' ? (
                    <Check className="h-4 w-4 shrink-0 opacity-80" />
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => setSortBy('fecha_entrega')}
                >
                  <span className="flex-1">Fecha de entrega</span>
                  {sortBy === 'fecha_entrega' ? (
                    <Check className="h-4 w-4 shrink-0 opacity-80" />
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => setSortBy('prioridad')}
                >
                  <span className="flex-1">Prioridad</span>
                  {sortBy === 'prioridad' ? (
                    <Check className="h-4 w-4 shrink-0 opacity-80" />
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="min-w-[24px] rounded-full bg-background/80 px-2.5 py-0.5 text-center text-xs font-medium tabular-nums text-muted-foreground">
            {actions.length}
          </span>
        </div>
      </div>
      <div className="kanban-column-cards flex min-h-[200px] flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4 pt-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-border">
        {actions.length === 0 ? (
          <KanbanColumnEmpty status={status} onNewAction={onNewAction} statusByKey={statusByKey} />
        ) : (
          <>
            {visibleActions.map((accion) => (
              <KanbanCard
                key={accion.id}
                accion={accion}
                responsableName={responsableNames[accion.responsable] ?? accion.responsable ?? '—'}
                commentCount={commentCounts[accion.id] ?? 0}
                onSelectAccion={onSelectAccion}
                onMoveEstado={onMoveEstado}
                checklistProgress={checklistProgressByAccionId[accion.id]}
                estadoPermission={estadoPermission}
                priority={findPriorityForAccion(accion, priorities)}
                statusByKey={statusByKey}
              />
            ))}
            {hasOverflow ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-muted/20 py-2.5 text-xs font-medium text-muted-foreground',
                  'transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground'
                )}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Mostrar menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Ver {hiddenCount} más
                  </>
                )}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function KanbanBoardSkeleton({ columns = COLUMN_ORDER }: { columns?: ActionStatus[] }) {
  return (
    <div
      id="kanban-board"
      className={cn(
        'kanban-board kanban-board-skeleton relative min-w-0 flex gap-4 overflow-x-auto overscroll-x-contain px-0.5 pb-4 sm:gap-5',
        'snap-x snap-proximity touch-pan-x',
        KANBAN_H_SCROLL_CLASSES
      )}
    >
      {columns.map((status) => (
        <div
          key={status}
          className="kanban-column flex w-[min(300px,calc(100vw-1.25rem))] shrink-0 snap-start flex-col rounded-2xl border border-border/50 bg-muted/10 p-4 sm:w-[300px] sm:min-w-[280px] sm:max-w-[300px]"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-8 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl bg-muted/60"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function KanbanBoard({
  acciones,
  isLoading,
  responsableNames = {},
  onSelectAccion,
  onNewAction,
  filterEstado,
  narrowToOccupiedColumns = false,
  checklistProgressByAccionId = {},
}: KanbanBoardProps) {
  const updateEstado = useUpdateAccionEstado()
  const [activeId, setActiveId] = useState<string | null>(null)
  const autoSyncedByFechaRef = useRef<Set<string>>(new Set())
  const { data: currentUser } = useCurrentUser()
  const { data: priorities = [] } = usePriorities()
  const { data: statuses = [] } = useStatuses()
  const statusByKey = useMemo(() => statusCatalogByKey(statuses), [statuses])
  const columnOrder = useMemo(() => orderedActionStatuses(statuses, COLUMN_ORDER), [statuses])
  const estadoPermission = useActionEstadoPermissions(currentUser ?? undefined)
  const { data: commentCounts = {} } = useCommentCounts(acciones.map((a) => a.id))

  const autoEstadoTargets = useMemo(
    () =>
      acciones
        .map((accion) => ({
          accion,
          target: getAutoEstadoPorFechaCompromiso(accion),
        }))
        .filter(
          (item): item is { accion: AccionDiaria; target: ActionStatus } =>
            item.target !== null && item.target !== item.accion.estado
        ),
    [acciones]
  )

  useEffect(() => {
    if (isLoading || updateEstado.isPending || autoEstadoTargets.length === 0) return

    for (const { accion, target } of autoEstadoTargets) {
      const syncKey = `${accion.id}:${accion.fecha}:${target}`
      if (autoSyncedByFechaRef.current.has(syncKey)) continue
      if (estadoPermission.denialMessage(accion, target)) continue
      autoSyncedByFechaRef.current.add(syncKey)
      updateEstado.mutate(
        { id: accion.id, estado: target },
        {
          onError: (e) => {
            autoSyncedByFechaRef.current.delete(syncKey)
            console.warn('No se pudo sincronizar el estado por fecha compromiso', e)
          },
        }
      )
    }
  }, [autoEstadoTargets, estadoPermission, isLoading, updateEstado])

  const byStatus = useMemo(() => {
    const map: Record<ActionStatus, AccionDiaria[]> = {
      Pendiente: [],
      Hoy: [],
      En_Ejecucion: [],
      Bloqueado: [],
      Retraso: [],
      Hecho: [],
      Verificado: [],
    }
    for (const a of acciones) {
      const column = getAccionKanbanColumn(a)
      if (map[column]) map[column].push(a)
    }
    return map
  }, [acciones])

  const columnsToShow = useMemo(() => {
    if (filterEstado && columnOrder.includes(filterEstado)) return [filterEstado]
    if (narrowToOccupiedColumns) {
      const occupied = columnOrder.filter((s) => (byStatus[s]?.length ?? 0) > 0)
      return occupied.length > 0 ? occupied : columnOrder
    }
    return columnOrder
  }, [filterEstado, narrowToOccupiedColumns, byStatus, columnOrder])

  const statusNavItems = useMemo<KanbanStatusNavItem[]>(
    () =>
      columnsToShow.map((status) => ({
        status,
        label: statusCatalogLabel(status, statusByKey) || COLUMN_LABELS[status],
        count: byStatus[status]?.length ?? 0,
        color: statusCatalogColor(status, statusByKey),
      })),
    [byStatus, columnsToShow, statusByKey]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const activeAccion = useMemo(
    () => (activeId ? acciones.find((a) => a.id === activeId) : null),
    [activeId, acciones]
  )

  const isColumnDropDisabled = useCallback(
    (columnStatus: ActionStatus) => {
      if (!activeAccion) return false
      if (activeAccion.estado === columnStatus) return false
      return !estadoPermission.canChangeTo(activeAccion, columnStatus)
    },
    [activeAccion, estadoPermission]
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return
      // over.id es el id del droppable (columna) = status; active.id es el id de la acción
      const newStatus = columnOrder.find((s) => s === over.id) as ActionStatus | undefined
      if (!newStatus) return
      const accion = acciones.find((a) => a.id === active.id)
      if (!accion) return
      if (accion.estado === newStatus) return
      const denied = estadoPermission.denialMessage(accion, newStatus)
      if (denied) {
        toast.error(denied)
        return
      }
      updateEstado.mutate(
        { id: accion.id, estado: newStatus },
        {
          onSuccess: () => toast.success('Estado actualizado'),
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al actualizar estado'),
        }
      )
    },
    [acciones, updateEstado, estadoPermission, columnOrder]
  )

  const handleMoveEstado = useCallback(
    (accion: AccionDiaria, estado: ActionStatus) => {
      const denied = estadoPermission.denialMessage(accion, estado)
      if (denied) {
        toast.error(denied)
        return
      }
      updateEstado.mutate(
        { id: accion.id, estado },
        {
          onSuccess: () => toast.success('Estado actualizado'),
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al actualizar estado'),
        }
      )
    },
    [updateEstado, estadoPermission]
  )

  if (isLoading) {
    return <KanbanBoardSkeleton columns={columnsToShow} />
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <KanbanBoardScrollArea
        id="kanban-board"
        columnCount={columnsToShow.length}
        navItems={statusNavItems}
      >
        {columnsToShow.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            actions={byStatus[status] ?? []}
            responsableNames={responsableNames}
            commentCounts={commentCounts}
            onSelectAccion={onSelectAccion}
            onNewAction={onNewAction}
            onMoveEstado={handleMoveEstado}
            checklistProgressByAccionId={checklistProgressByAccionId}
            dropForbidden={isColumnDropDisabled(status)}
            estadoPermission={estadoPermission}
            priorities={priorities}
            statusByKey={statusByKey}
          />
        ))}
      </KanbanBoardScrollArea>
      <DragOverlay dropAnimation={null}>
        {activeAccion ? (
          <div className="w-[280px]">
            <KanbanCardInner
              accion={activeAccion}
              responsableName={responsableNames[activeAccion.responsable] ?? activeAccion.responsable ?? '—'}
              commentCount={commentCounts[activeAccion.id] ?? 0}
              priority={findPriorityForAccion(activeAccion, priorities)}
              statusByKey={statusByKey}
              isOverlay
              checklistProgress={checklistProgressByAccionId[activeAccion.id]}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
