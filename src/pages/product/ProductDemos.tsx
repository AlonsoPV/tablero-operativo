/**
 * Demos locales de la landing `/producto`.
 * Estado en memoria · no llama servicios · no escribe en Supabase.
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCheck,
  GripVertical,
  MoreVertical,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SectionCard, SectionCardBody } from '@/components/SectionCard'
import { AccionFormBlock } from '@/features/operations/components/form/AccionFormBlock'
import { AccionFormField } from '@/features/operations/components/AccionFormSection'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { cn } from '@/lib/utils'
import {
  Eyebrow,
  LandingSection,
  LandingShell,
  SectionLead,
  SectionTitle,
} from './ProductUI'
import { ModuleMetaBadge } from './ProductVisual'
import { StatusToken } from './StatusToken'
import { LANDING_SEO } from './landingSeo'
import { PRODUCT_STORY, PRODUCT_STORY_DEMO_LABEL } from './productStory'

const owners = ['Ana Martínez', 'Juan Reyes', 'Laura Cruz'] as const
const priorities = [
  { value: 'Alta', dot: 'bg-destructive' },
  { value: 'Media', dot: 'bg-amber-500' },
  { value: 'Baja', dot: 'bg-emerald-500' },
] as const
const validations = ['Correo de validación', 'Evidencia adjunta', 'Checklist completo'] as const

type ColumnId = 'pendiente' | 'ejecucion' | 'bloqueado' | 'retraso' | 'hecho' | 'verificado'

type DemoCard = {
  id: string
  publicId: string
  title: string
  description: string
  owner: string
  ownerName: string
  date: string
  priority: 'Alta' | 'Media' | 'Baja'
  column: ColumnId
  validation: string
  checklist: { total: number; completed: number }
  ageLabel: string
  note?: string
}

const stateToColumn: Record<string, ColumnId> = {
  Pendiente: 'pendiente',
  'En ejecución': 'ejecucion',
  Bloqueado: 'bloqueado',
  Retraso: 'retraso',
  Hecho: 'hecho',
  Verificado: 'verificado',
}

const INITIAL_SPINE_COLUMN: ColumnId =
  stateToColumn[PRODUCT_STORY.action.state] ?? 'pendiente'

/** Tablero ligero: AC-1042 + 3 compromisos para no saturar columnas. */
function buildInitialCards(): DemoCard[] {
  const focusIds = new Set(['AC-1055', 'AC-1031', 'AC-1060'])
  const spine: DemoCard = {
    id: '1',
    publicId: PRODUCT_STORY.action.id,
    title: PRODUCT_STORY.action.title,
    description: PRODUCT_STORY.action.description,
    owner: PRODUCT_STORY.owner.initials,
    ownerName: PRODUCT_STORY.owner.fullName,
    date: PRODUCT_STORY.action.dueShort,
    priority: PRODUCT_STORY.action.priority,
    column: INITIAL_SPINE_COLUMN,
    validation: PRODUCT_STORY.action.evidenceExpected,
    checklist: { ...PRODUCT_STORY.action.checklist },
    ageLabel: PRODUCT_STORY.action.ageLabel,
    note: INITIAL_SPINE_COLUMN === 'bloqueado' ? PRODUCT_STORY.blocker.detail : undefined,
  }

  const support = PRODUCT_STORY.supportingActions
    .filter((item) => focusIds.has(item.id))
    .map((item, index) => ({
      id: String(index + 2),
      publicId: item.id,
      title: item.title,
      description: 'note' in item && item.note ? item.note : `Compromiso de ejemplo · ${item.owner}`,
      owner: item.initials,
      ownerName: item.owner,
      date: item.due,
      priority: item.priority,
      column: stateToColumn[item.state],
      validation: 'Evidencia adjunta',
      checklist: {
        total: item.state === 'Verificado' || item.state === 'Hecho' ? 2 : 3,
        completed: item.state === 'Verificado' ? 2 : item.state === 'Hecho' ? 2 : 1,
      },
      ageLabel: item.state === 'Verificado' ? 'Cerrada hace 2 días' : 'Abierta hace 3 días',
      note: 'note' in item ? item.note : undefined,
    }))

  return [spine, ...support]
}

const SPINE_ADVANCE: ColumnId[] = ['pendiente', 'ejecucion', 'bloqueado', 'hecho']
const INITIAL_ADVANCE_STEP = Math.max(0, SPINE_ADVANCE.indexOf(INITIAL_SPINE_COLUMN))

const columns: Array<{
  id: ColumnId
  title: string
  estadoLabel: string
  Icon: typeof Clock
  border: string
  bg: string
  iconClass: string
}> = [
  {
    id: 'pendiente',
    title: 'Pendiente',
    estadoLabel: 'Pendiente',
    Icon: Clock,
    border: 'border-l-slate-400',
    bg: 'bg-slate-500/5',
    iconClass: 'text-slate-500',
  },
  {
    id: 'ejecucion',
    title: 'En ejecución',
    estadoLabel: 'En ejecución',
    Icon: PlayCircle,
    border: 'border-l-blue-400',
    bg: 'bg-blue-500/5',
    iconClass: 'text-blue-600',
  },
  {
    id: 'bloqueado',
    title: 'Bloqueado',
    estadoLabel: 'Bloqueado',
    Icon: AlertCircle,
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    iconClass: 'text-red-600',
  },
  {
    id: 'retraso',
    title: 'Retraso',
    estadoLabel: 'Retraso',
    Icon: AlertTriangle,
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/5',
    iconClass: 'text-orange-600',
  },
  {
    id: 'hecho',
    title: 'Hecho',
    estadoLabel: 'Hecho',
    Icon: CheckCircle2,
    border: 'border-l-emerald-400',
    bg: 'bg-emerald-500/5',
    iconClass: 'text-emerald-600',
  },
  {
    id: 'verificado',
    title: 'Verificado',
    estadoLabel: 'Verificado',
    Icon: BadgeCheck,
    border: 'border-l-violet-400',
    bg: 'bg-violet-500/5',
    iconClass: 'text-violet-600',
  },
]

const estadoBadgeClass: Record<ColumnId, string> = {
  pendiente: 'bg-slate-500/15 text-slate-800 dark:text-slate-200',
  ejecucion: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  bloqueado: 'bg-red-500/15 text-red-800 dark:text-red-200',
  retraso: 'bg-orange-500/15 text-orange-800 dark:text-orange-200',
  hecho: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  verificado: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
}

function DemoReadonlyValue({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 min-h-5 whitespace-pre-wrap break-words text-sm font-medium text-foreground">
        {value || <span className="text-muted-foreground">Sin dato</span>}
      </div>
    </div>
  )
}

const inputBase =
  'rounded-md border-input bg-background shadow-sm focus-visible:ring-1 focus-visible:ring-ring'

function formatDemoDueLabel(fecha: string, hora: string): string {
  if (!fecha) return hora || 'Sin fecha'
  const date = new Date(`${fecha}T12:00:00`)
  if (Number.isNaN(date.getTime())) return `${fecha} · ${hora}`
  const day = date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  return `${day} · ${hora}`
}

function DemoCreateAccionForm({
  onCreate,
  created,
}: {
  created: boolean
  onCreate: (input: {
    title: string
    description: string
    ownerName: string
    priority: DemoCard['priority']
    dateLabel: string
    validation: string
  }) => void
}) {
  const [title, setTitle] = useState('Solicitar apoyo a Legal para cláusula de pago')
  const [description, setDescription] = useState(
    'Confirmar cláusula de pago con Legal para desbloquear la validación AC-1042.'
  )
  const [owner, setOwner] = useState<string>(owners[0])
  const [priority, setPriority] = useState<DemoCard['priority']>('Alta')
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [hora, setHora] = useState('14:00')
  const [requiereEvidencia, setRequiereEvidencia] = useState(true)
  const [validation, setValidation] = useState<string>(validations[0])
  const [blocksOpen, setBlocksOpen] = useState({ principal: true, validacion: false })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onCreate({
      title: title.trim() || 'Acción demo',
      description: description.trim(),
      ownerName: owner,
      priority,
      dateLabel: formatDemoDueLabel(fecha, hora),
      validation: requiereEvidencia ? validation : 'No requiere evidencia',
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-col overflow-hidden"
      data-accion-form-mode="create"
    >
      <div className="shrink-0 border-b border-border/60 bg-card px-3 py-2.5 sm:px-4 sm:py-3">
        <h2 className="text-sm font-semibold leading-tight tracking-tight sm:text-base">Nueva acción</h2>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">
          Completa los datos para crear la acción
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-3 py-3 sm:space-y-4 sm:px-5 sm:py-4">
        <AccionFormBlock
          blockId="demo-block-principal"
          step={1}
          title="Información principal"
          subtitle="¿Qué se hará, quién lo hará y para cuándo?"
          icon={CalendarClock}
          expanded={blocksOpen.principal}
          onToggle={() => setBlocksOpen((b) => ({ ...b, principal: !b.principal }))}
          collapsedSummary={title}
        >
          <fieldset className="space-y-4">
            <AccionFormField label="Título de la acción" htmlFor="demo-titulo" required>
              <Input
                id="demo-titulo"
                value={title}
                maxLength={70}
                onChange={(event) => setTitle(event.target.value)}
                className={cn(inputBase, 'h-10')}
              />
            </AccionFormField>
            <AccionFormField label="Descripción" htmlFor="demo-descripcion" required>
              <textarea
                id="demo-descripcion"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className={cn(
                  inputBase,
                  'flex min-h-[88px] w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring'
                )}
              />
            </AccionFormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AccionFormField label="Responsable de ejecutar" htmlFor="demo-responsable" required>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger id="demo-responsable" className={cn(inputBase, 'h-10')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccionFormField>
              <AccionFormField label="Prioridad" htmlFor="demo-prioridad" required>
                <div className="flex flex-wrap gap-2" id="demo-prioridad">
                  {priorities.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPriority(item.value)}
                      className={cn(
                        'rounded-md transition',
                        priority === item.value && 'ring-2 ring-primary/25'
                      )}
                    >
                      <AccionPriorityBadge prioridad={item.value} />
                    </button>
                  ))}
                </div>
              </AccionFormField>
            </div>
            <AccionFormField label="Fecha y hora límite" htmlFor="demo-fecha" required>
              <div className="grid gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_8.5rem]">
                <Input
                  id="demo-fecha"
                  type="date"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  className={cn(inputBase, 'h-10')}
                />
                <Input
                  id="demo-hora"
                  type="time"
                  value={hora}
                  step={60}
                  onChange={(event) => setHora(event.target.value)}
                  className={cn(inputBase, 'h-10')}
                />
              </div>
            </AccionFormField>
          </fieldset>
        </AccionFormBlock>

        <AccionFormBlock
          blockId="demo-block-validacion"
          step={2}
          title="Evidencia y validación"
          subtitle="Opcional: define evidencia solo si hace falta comprobar el cierre."
          icon={FileCheck}
          expanded={blocksOpen.validacion}
          onToggle={() => setBlocksOpen((b) => ({ ...b, validacion: !b.validacion }))}
        >
          <label
            htmlFor="demo-requiere-evidencia"
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
          >
            <input
              id="demo-requiere-evidencia"
              type="checkbox"
              checked={requiereEvidencia}
              onChange={(event) => setRequiereEvidencia(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary"
            />
            <span className="text-sm font-medium text-foreground">Requiere evidencia</span>
          </label>
          {requiereEvidencia ? (
            <AccionFormField label="¿Qué evidencia comprobará que se hizo?" htmlFor="demo-evidencia" required>
              <Select value={validation} onValueChange={setValidation}>
                <SelectTrigger id="demo-evidencia" className={cn(inputBase, 'h-10')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {validations.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AccionFormField>
          ) : null}
        </AccionFormBlock>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 bg-card/95 px-3 py-3 sm:px-5">
        <span
          className={cn(
            'text-xs font-semibold',
            created ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
          )}
        >
          {created ? '✓ Solo en esta demo' : 'Interactiva · No crea acciones reales'}
        </span>
        <Button type="submit" className="h-10 rounded-lg px-4 font-semibold">
          Crear acción
        </Button>
      </div>
    </form>
  )
}

function KanbanCardFace({ card }: { card: DemoCard }) {
  return (
    <div className="scale-[1.02] cursor-grabbing rounded-xl border border-white/20 bg-[#17171a] p-3 text-left shadow-xl ring-1 ring-white/20">
      <div className="flex items-start gap-2 pr-1">
        <AccionPriorityBadge prioridad={card.priority} compact className="mt-0.5 max-w-[6.5rem] shrink-0" />
        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{card.title}</p>
      </div>
      <p className="mt-1 truncate pl-[18px] text-xs text-white/55">{card.ownerName}</p>
    </div>
  )
}

function DraggableCard({ card, onOpen }: { card: DemoCard; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { column: card.column },
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group transition-all duration-200', isDragging ? 'z-20 opacity-30' : 'opacity-100')}
    >
      <div className="flex items-start gap-0.5">
        <button
          type="button"
          className="mt-3 shrink-0 cursor-grab touch-none rounded-md p-0.5 text-muted-foreground hover:bg-muted/60 active:cursor-grabbing"
          aria-label="Arrastrar acción"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="rounded-lg border border-white/10 bg-white/[0.05] p-2 transition hover:bg-white/[0.08]">
            <div className="flex items-start gap-1">
              <button type="button" onClick={() => onOpen(card.id)} className="min-w-0 flex-1 text-left">
                <div className="flex items-start gap-1.5 pr-0.5">
                  <AccionPriorityBadge
                    prioridad={card.priority}
                    compact
                    className="mt-0.5 max-w-[5.5rem] shrink-0"
                  />
                  <p className="line-clamp-2 text-xs font-medium leading-snug text-white" title={card.title}>
                    {card.title}
                  </p>
                </div>
                <p className="mt-1 truncate pl-0 text-[10px] text-white/55">
                  <span>{card.ownerName}</span>
                  <span className="text-white/30"> · </span>
                  <span>{card.date}</span>
                </p>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Ver acción"
                onClick={() => onOpen(card.id)}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DemoAccionDetailModal({ card, onClose }: { card: DemoCard; onClose: () => void }) {
  const column = columns.find((item) => item.id === card.column)
  const estadoLabel = column?.estadoLabel ?? 'Pendiente'

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end bg-foreground/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Acción ${card.publicId}`}
        className={cn(
          'flex w-full max-w-none flex-col overflow-hidden border border-border/60 bg-card shadow-xl',
          'h-[min(92dvh,900px)] rounded-t-2xl sm:h-auto sm:max-h-[min(90dvh,900px)] sm:max-w-2xl sm:rounded-lg'
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-border/60 bg-card px-3 py-2.5 pr-11 sm:px-4 sm:py-3 sm:pr-12">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold sm:text-base">Detalle de acción</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Demo local · Hecho no es Verificado</p>
            </div>
            <div className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1">
              <span className="text-xs font-semibold tabular-nums">{card.publicId}</span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                  estadoBadgeClass[card.column]
                )}
              >
                {estadoLabel}
              </span>
              <AccionPriorityBadge prioridad={card.priority} compact />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-10 w-10 sm:right-4 sm:top-4 sm:h-8 sm:w-8"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          <SectionCard className="border-primary/25 shadow-sm ring-1 ring-primary/10">
            <SectionCardBody className="space-y-3 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DemoReadonlyValue label="Título" value={card.title} />
                <DemoReadonlyValue label="Responsable" value={card.ownerName} />
                <DemoReadonlyValue label="Fecha límite" value={card.date} />
                <DemoReadonlyValue label="Evidencia esperada" value={card.validation} />
                <div className="sm:col-span-2">
                  <DemoReadonlyValue label="Descripción" value={card.description} />
                </div>
                {card.note ? (
                  <div className="sm:col-span-2">
                    <DemoReadonlyValue label="Nota" value={card.note} />
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Checklist
                </p>
                <p className="mt-1 text-sm font-medium">
                  {card.checklist.completed}/{card.checklist.total} completados
                </p>
              </div>
            </SectionCardBody>
          </SectionCard>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/70 px-3 py-3 sm:px-5">
          <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )
}

function DropColumn({
  column,
  cards,
  onOpen,
}: {
  column: (typeof columns)[number]
  cards: DemoCard[]
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column: column.id } })
  const Icon = column.Icon
  return (
    <div
      className={cn(
        'flex w-[min(200px,calc(100vw-2.75rem))] shrink-0 snap-start flex-col rounded-xl border border-white/10 border-l-4 bg-white/[0.03] xl:min-w-[9.5rem] xl:w-auto xl:flex-1',
        column.border,
        isOver && 'ring-2 ring-white/30'
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-2 sm:px-2.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', column.iconClass)} />
        <h3 className="truncate text-xs font-semibold text-white">{column.title}</h3>
        <span className="rounded-md bg-white/10 px-1 py-0.5 text-[9px] font-semibold tabular-nums text-white/60">
          {cards.length}
        </span>
      </div>
      <div ref={setNodeRef} className="min-h-[180px] flex-1 space-y-1.5 px-2 pb-2.5 sm:px-2.5">
        {cards.length === 0 ? (
          <div className="flex min-h-[140px] flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-2 text-center">
            <p className="text-[10px] text-white/40">Suelta aquí</p>
          </div>
        ) : (
          cards.map((card) => <DraggableCard key={card.id} card={card} onOpen={onOpen} />)
        )}
      </div>
    </div>
  )
}

function resolveDropColumn(overId: string, cards: DemoCard[]): ColumnId | null {
  if (columns.some((column) => column.id === overId)) return overId as ColumnId
  return cards.find((card) => card.id === overId)?.column ?? null
}

function CollapsedCreateActionPanel({
  created,
  onCreate,
}: {
  created: boolean
  onCreate: (input: {
    title: string
    description: string
    ownerName: string
    priority: DemoCard['priority']
    dateLabel: string
    validation: string
  }) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="liquid-glass mt-3 overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-white/[0.04]"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white">
          <Plus className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-white">Nueva acción</span>
            <ModuleMetaBadge code="FRM·002" className="hidden sm:inline-flex" />
            {created ? (
              <Badge variant="outline" className="h-5 border-white/25 text-[9px] text-white">
                Demo creada
              </Badge>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[11px] text-white/50">
            Responsable, fecha y evidencia
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-white/50 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="border-t border-white/10 bg-black/30">
          <DemoCreateAccionForm created={created} onCreate={onCreate} />
        </div>
      ) : null}
    </div>
  )
}

export function ProductInAction() {
  const [cards, setCards] = useState<DemoCard[]>(() => buildInitialCards())
  const [advanceStep, setAdvanceStep] = useState(INITIAL_ADVANCE_STEP)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const spine = cards.find((card) => card.id === '1')
  const openCard = cards.find((card) => card.id === openId) ?? null
  const draggingCard = cards.find((card) => card.id === draggingId) ?? null
  const spineColumnLabel =
    columns.find((column) => column.id === spine?.column)?.estadoLabel ?? 'Pendiente'

  const onDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id))
  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null)
    const overId = event.over?.id ? String(event.over.id) : null
    if (!overId) return
    const nextColumn = resolveDropColumn(overId, cards)
    if (!nextColumn) return
    setCards((current) =>
      current.map((card) =>
        card.id === String(event.active.id) ? { ...card, column: nextColumn } : card
      )
    )
  }

  const advanceSpine = () => {
    const nextStep = Math.min(advanceStep + 1, SPINE_ADVANCE.length - 1)
    const nextColumn = SPINE_ADVANCE[nextStep]
    setAdvanceStep(nextStep)
    setCards((current) =>
      current.map((card) => {
        if (card.id !== '1') return card
        return {
          ...card,
          column: nextColumn,
          checklist: {
            total: 3,
            completed: nextColumn === 'pendiente' ? 0 : nextColumn === 'ejecucion' ? 1 : nextColumn === 'bloqueado' ? 1 : 3,
          },
          note:
            nextColumn === 'hecho'
              ? 'Reportada como Hecho · aún no Verificado'
              : nextColumn === 'bloqueado'
                ? PRODUCT_STORY.blocker.detail
                : undefined,
        }
      })
    )
  }

  const resetSpine = () => {
    setAdvanceStep(INITIAL_ADVANCE_STEP)
    setCards((current) =>
      current.map((card) =>
        card.id === '1'
          ? {
              ...card,
              column: INITIAL_SPINE_COLUMN,
              checklist: { ...PRODUCT_STORY.action.checklist },
              note:
                INITIAL_SPINE_COLUMN === 'bloqueado' ? PRODUCT_STORY.blocker.detail : undefined,
            }
          : card
      )
    )
  }

  return (
    <LandingSection
      id="ejecucion"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={LANDING_SEO.sections.ejecucion.description}
    >
      <LandingShell wide>
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
          <div className="max-w-xl">
            <Eyebrow dark tokenColor="blue">
              Gestión de acciones y Kanban
            </Eyebrow>
            <SectionTitle dark>De los planes a compromisos con seguimiento.</SectionTitle>
            <SectionLead dark>
              Cada prioridad se traduce en acciones con responsables, fechas y verificación de
              cumplimiento.
            </SectionLead>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="liquid-glass rounded-xl px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/45">
                {PRODUCT_STORY.action.id} ahora
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white">
                {spineColumnLabel}
                {spine?.column === 'hecho' ? ' · falta Verificado' : ''}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-white/90"
              onClick={advanceStep >= SPINE_ADVANCE.length - 1 ? resetSpine : advanceSpine}
            >
              {advanceStep >= SPINE_ADVANCE.length - 1 ? 'Reiniciar' : 'Avanzar'}
            </Button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <p className="text-[10px] font-semibold text-white/45">
            {PRODUCT_STORY_DEMO_LABEL} · Avanza {PRODUCT_STORY.action.id} o arrastra · Hecho ≠ Verificado
          </p>
          <div className="liquid-glass overflow-hidden rounded-2xl">
            <div className="flex flex-col gap-2 border-b border-white/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <ModuleMetaBadge code="KBN·001" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Kanban operativo</p>
                  <p className="text-[11px] text-white/55">Responsable · fecha · prioridad · estado</p>
                </div>
              </div>
              <div className="relative w-full sm:w-44">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <Input
                  readOnly
                  placeholder="Buscar..."
                  className="h-8 rounded-lg border-white/15 bg-white/5 pl-8 text-xs text-white placeholder:text-white/35"
                  aria-label="Buscar (solo demo)"
                />
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <div className="flex gap-2 overflow-x-auto scroll-smooth px-2.5 py-3 snap-x snap-mandatory sm:px-3 xl:overflow-visible">
                {columns.map((column) => (
                  <DropColumn
                    key={column.id}
                    column={column}
                    cards={cards.filter((card) => card.column === column.id)}
                    onOpen={setOpenId}
                  />
                ))}
              </div>
              <DragOverlay>{draggingCard ? <KanbanCardFace card={draggingCard} /> : null}</DragOverlay>
            </DndContext>
          </div>

          <CollapsedCreateActionPanel
            created={created}
            onCreate={(input) => {
              const initials = input.ownerName
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
              setCards((current) => [
                {
                  id: `new-${current.length + 1}`,
                  publicId: `AC-${1100 + current.length}`,
                  title: input.title,
                  description: input.description,
                  owner: initials || 'XX',
                  ownerName: input.ownerName,
                  date: input.dateLabel,
                  priority: input.priority,
                  column: 'pendiente',
                  validation: input.validation,
                  checklist: { total: 2, completed: 0 },
                  ageLabel: 'Recién creada',
                },
                ...current,
              ])
              setCreated(true)
            }}
          />
        </div>
      </LandingShell>
      {openCard ? <DemoAccionDetailModal card={openCard} onClose={() => setOpenId(null)} /> : null}
    </LandingSection>
  )
}

const toneSurface = {
  green: 'border-emerald-300/30 bg-emerald-400/10',
  yellow: 'border-amber-200/30 bg-amber-400/10',
  red: 'border-red-300/30 bg-red-500/15',
} as const

export function DashboardDemo() {
  const [selected, setSelected] = useState(2)
  const items = PRODUCT_STORY.attention.items
  const primary = items[2]
  const secondary = items.filter((_, index) => index !== 2)
  const active = items[selected] ?? primary

  return (
    <LandingSection
      id="visibilidad"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={LANDING_SEO.sections.visibilidad.description}
    >
      <LandingShell wide>
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="max-w-xl">
            <Eyebrow dark tokenColor="green">
              Visibilidad directiva
            </Eyebrow>
            <SectionTitle dark>Lo que no avanza también debe ser visible.</SectionTitle>
            <SectionLead dark>
              Consulta objetivos, indicadores, retrasos y bloqueos desde una misma visión de gestión.
            </SectionLead>
          </div>
          <p className="text-sm text-white/45 lg:text-right">
            {PRODUCT_STORY.attention.weekLabel} · {PRODUCT_STORY_DEMO_LABEL}
          </p>
        </div>

        <div className="liquid-glass mt-5 overflow-hidden rounded-2xl">
          <button
            type="button"
            onClick={() => setSelected(2)}
            className={cn(
              'grid w-full gap-3 border-b border-white/10 p-3.5 text-left transition sm:grid-cols-[1.2fr_0.8fr] sm:p-4',
              selected === 2 ? 'bg-red-500/15' : 'hover:bg-white/[0.04]'
            )}
          >
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  Intervención primero
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-red-200">
                  {primary.kind}
                </span>
              </div>
              <p className="mt-1.5 text-base font-semibold leading-snug text-white sm:text-lg">
                {primary.title}
              </p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/65">{primary.detail}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                Responsable
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">{PRODUCT_STORY.owner.fullName}</p>
              <p className="text-xs text-white/55">{PRODUCT_STORY.owner.area}</p>
              <p className="mt-2 text-xs font-medium text-white">
                Compromiso · {PRODUCT_STORY.action.dueLabel}
              </p>
            </div>
          </button>

          <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <ul className="divide-y divide-white/10 border-b border-white/10 lg:border-b-0 lg:border-r">
              {secondary.map((item) => {
                const index = items.indexOf(item)
                const isActive = index === selected
                return (
                  <li key={`${item.kind}-${item.title}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(index)}
                      className={cn(
                        'flex w-full gap-2.5 px-3.5 py-2.5 text-left transition sm:px-4',
                        isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1 h-2 w-2 shrink-0 rounded-full',
                          item.tone === 'red' ? 'bg-red-500' : 'bg-amber-400'
                        )}
                      />
                      <span className="min-w-0">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                          {item.kind}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold text-white">{item.title}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="space-y-2.5 p-3.5 sm:p-4">
              <div className={cn('rounded-xl border p-3', toneSurface[active.tone])}>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/45">
                  Detalle consultado
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{active.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/70">{active.detail}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs font-semibold text-white">Continuidad del caso</p>
                <ul className="mt-1.5 space-y-1 text-xs text-white/60">
                  <li>
                    Objetivo · {PRODUCT_STORY.objective.id} · {PRODUCT_STORY.objective.progressLabel}
                  </li>
                  <li>
                    Compromiso · {PRODUCT_STORY.action.id} · {PRODUCT_STORY.action.state}
                  </li>
                  <li>Gap ejemplo · {PRODUCT_STORY.objective.gapLabel}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

const followStages = [
  {
    label: 'Compromiso próximo a vencer',
    summary: `${PRODUCT_STORY.action.id} vence ${PRODUCT_STORY.action.dueLabel}`,
    detail: 'La fecha de compromiso está en el horizonte de hoy. Aún puede cerrarse a tiempo.',
  },
  {
    label: 'Sin actualización reciente',
    summary: `Última nota · ${PRODUCT_STORY.lastUpdate.at}`,
    detail: PRODUCT_STORY.lastUpdate.text,
  },
  {
    label: 'Atención requerida',
    summary: PRODUCT_STORY.blocker.label,
    detail: PRODUCT_STORY.blocker.detail,
  },
  {
    label: 'Responsable identificado',
    summary: `${PRODUCT_STORY.owner.fullName} · ${PRODUCT_STORY.owner.area}`,
    detail: PRODUCT_STORY.action.nextStep,
  },
] as const

export function FollowUpDemo() {
  const { action, owner, blocker, timeline } = PRODUCT_STORY
  const [stage, setStage] = useState(0)
  const [openDetail, setOpenDetail] = useState(false)
  const active = followStages[stage]

  return (
    <LandingSection
      id="seguimiento"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={LANDING_SEO.sections.seguimiento.description}
    >
      <LandingShell wide>
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="max-w-xl">
            <Eyebrow dark tokenColor="yellow">
              Seguimiento
            </Eyebrow>
            <SectionTitle dark>Detecta retrasos antes de que escalen.</SectionTitle>
            <SectionLead dark>
              Identifica compromisos detenidos y facilita que los responsables reporten avances.
            </SectionLead>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="liquid-glass overflow-hidden rounded-2xl">
            <div className="border-b border-white/10 px-3.5 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                Situación · {PRODUCT_STORY_DEMO_LABEL}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">{active.label}</p>
              <p className="mt-0.5 text-xs text-white/55">{active.summary}</p>
            </div>
            <ol className="divide-y divide-white/10">
              {followStages.map((item, index) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => setStage(index)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition',
                      index === stage ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold',
                        index === stage
                          ? 'bg-white text-black'
                          : index < stage
                            ? 'bg-white/25 text-white'
                            : 'bg-white/10 text-white/60'
                      )}
                    >
                      0{index + 1}
                    </span>
                    <span className="text-xs font-semibold text-white">{item.label}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-3.5 py-2.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-white/20 bg-transparent px-3 text-xs text-white hover:bg-white/10 hover:text-white"
                disabled={stage === 0}
                onClick={() => setStage((value) => Math.max(0, value - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-white/90"
                disabled={stage === followStages.length - 1}
                onClick={() => setStage((value) => Math.min(followStages.length - 1, value + 1))}
              >
                Siguiente
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-white/20 bg-transparent px-3 text-xs text-white hover:bg-white/10 hover:text-white"
                onClick={() => setOpenDetail(true)}
              >
                Consultar
              </Button>
            </div>
          </div>

          <div className="liquid-glass overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold tabular-nums text-white/45">{action.id}</span>
                <StatusToken color="red" label={action.state} />
                <AccionPriorityBadge prioridad={action.priority} compact />
              </div>
            </div>
            <div className="space-y-3 p-3.5 sm:p-4">
              <div>
                <p className="text-base font-semibold text-white">{action.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/65">{active.detail}</p>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {[
                  ['Fecha compromiso', action.dueLabel],
                  ['Responsable', `${owner.fullName} · ${owner.area}`],
                  ['Bloqueo', blocker.label],
                  ['Próximo paso', action.nextStep],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <dt className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-xs font-medium text-white">{value}</dd>
                  </div>
                ))}
              </dl>
              {openDetail ? (
                <ol className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  {timeline.map((item) => (
                    <li key={`${item.at}-${item.title}`}>
                      <p className="text-[9px] font-semibold tabular-nums text-white/40">{item.at}</p>
                      <p className="text-xs font-semibold text-white">{item.title}</p>
                      <p className="text-[11px] text-white/55">{item.detail}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-white/55">
                  Consulta el compromiso para ver el historial. Sin automatización inventada.
                </p>
              )}
            </div>
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

export function CollaborationDemo() {
  const { action, collaboration, requester, owner, blocker } = PRODUCT_STORY
  const [visibleCount, setVisibleCount] = useState(1)

  return (
    <LandingSection
      id="colaboracion"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={LANDING_SEO.sections.colaboracion.description}
    >
      <LandingShell wide>
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="max-w-xl">
            <Eyebrow dark tokenColor="blue">
              Comunicación y colaboración
            </Eyebrow>
            <SectionTitle dark>Cada solicitud tiene contexto, responsable y respuesta.</SectionTitle>
            <SectionLead dark>
              Menos información dispersa. Más claridad para coordinar el trabajo.
            </SectionLead>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(16rem,0.78fr)_minmax(0,1.22fr)]">
          <aside className="liquid-glass rounded-2xl p-3.5 sm:p-4">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
              Compromiso en el tablero
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-white/45">{action.id}</span>
              <StatusToken color="red" label={action.state} />
            </div>
            <p className="mt-1.5 text-sm font-semibold leading-snug text-white">{action.title}</p>
            <dl className="mt-3 space-y-2 text-xs">
              {[
                ['Quién solicitó', `${requester.fullName} · ${requester.area}`],
                ['Quién responde', `${owner.fullName} · ${owner.area}`],
                ['Qué se necesita', action.evidenceExpected],
                ['Acuerdo', `Validación formal · ${action.dueLabel}`],
                ['Pendiente', blocker.label],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                    {label}
                  </dt>
                  <dd className="mt-0.5 font-medium text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[9px] font-semibold text-white/40">
              {PRODUCT_STORY_DEMO_LABEL}
            </p>
          </aside>

          <div className="liquid-glass overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
              <p className="text-xs font-semibold text-white">Hilo del compromiso</p>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-white/90"
                disabled={visibleCount >= collaboration.length}
                onClick={() => setVisibleCount((value) => Math.min(collaboration.length, value + 1))}
              >
                Siguiente mensaje
              </Button>
            </div>
            <ul className="divide-y divide-white/10">
              {collaboration.slice(0, visibleCount).map((msg) => (
                <li key={`${msg.at}-${msg.author}`} className="flex gap-2.5 px-3.5 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-black">
                    {msg.author
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-xs font-semibold text-white">{msg.author}</p>
                      <p className="text-[10px] text-white/45">
                        {msg.area} · {msg.at}
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/80">{msg.text}</p>
                    {'evidence' in msg && msg.evidence ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-white">
                        <FileCheck className="h-3.5 w-3.5 text-white/70" />
                        {msg.evidence}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

type EnviardianPhase = 'idle' | 'question' | 'lookup' | 'answer' | 'proposal'

export function EnviardianBridgeDemo() {
  const [phase, setPhase] = useState<EnviardianPhase>('idle')
  const [question, setQuestion] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const runPrompt = (prompt: string) => {
    setQuestion(prompt)
    setConfirmed(false)
    setPhase('question')
    window.setTimeout(() => setPhase('lookup'), 450)
    window.setTimeout(() => setPhase('answer'), 1100)
    window.setTimeout(() => setPhase('proposal'), 1700)
  }

  return (
    <LandingSection
      id="enviardian"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={LANDING_SEO.sections.enviardian.description}
    >
      <LandingShell wide>
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="max-w-xl">
            <Eyebrow dark tokenColor="yellow">
              Asistente de IA integrado
            </Eyebrow>
            <SectionTitle dark>Tu información también está disponible en una conversación.</SectionTitle>
            <SectionLead dark>
              Consulta objetivos, acciones y bloqueos; prepara nuevas acciones por voz o texto con
              confirmación humana.
            </SectionLead>
            <p className="mt-3 text-sm text-white/70">
              <Link to="/agente" className="font-medium text-white underline-offset-4 hover:underline">
                Conoce Enviardián, el asistente de IA conectado con tu operación.
              </Link>
            </p>
          </div>
          <div className="lg:justify-self-end">
            <Button
              asChild
              size="lg"
              className="h-11 rounded-full bg-white px-6 font-semibold text-black hover:bg-white/90"
            >
              <Link to="/agente">
                Conocer Enviardián
                <Sparkles className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="liquid-glass mt-5 overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-white/70" />
              <p className="text-sm font-semibold text-white">Asistente integrado a Scrumban</p>
            </div>
            <Badge variant="outline" className="border-white/20 text-[9px] text-white/70">
              {PRODUCT_STORY_DEMO_LABEL}
            </Badge>
          </div>

          <div className="grid xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-2 border-b border-white/10 p-3.5 sm:p-4 xl:border-b-0 xl:border-r">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Pregunta</p>
              {PRODUCT_STORY.enviardian.prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => runPrompt(prompt)}
                  className={cn(
                    'agent-chip block w-full rounded-xl px-3 py-2.5 text-left text-xs font-medium transition',
                    question === prompt && 'agent-chip--active'
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="space-y-2.5 p-3.5 sm:p-4">
              <div
                className={cn(
                  'rounded-xl border px-3 py-2.5 transition',
                  phase === 'idle'
                    ? 'border-dashed border-white/15 bg-white/[0.02]'
                    : 'border-white/15 bg-white/[0.05]'
                )}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                  1 · Pregunta
                </p>
                <p className="mt-1 text-xs text-white">
                  {question || 'Elige una consulta para ver el flujo completo.'}
                </p>
              </div>

              <div
                className={cn(
                  'rounded-xl border px-3 py-2.5 transition',
                  phase === 'lookup' || phase === 'answer' || phase === 'proposal'
                    ? 'border-sky-300/30 bg-sky-400/10'
                    : 'border-dashed border-white/15 bg-white/[0.02] opacity-60'
                )}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                  2 · Consulta
                </p>
                <p className="mt-1 text-xs text-white">
                  {phase === 'lookup' || phase === 'answer' || phase === 'proposal'
                    ? `Lee ${PRODUCT_STORY.objective.id}, ${PRODUCT_STORY.action.id} y bloqueos autorizados.`
                    : 'Esperando consulta…'}
                </p>
              </div>

              <div
                className={cn(
                  'rounded-xl border px-3 py-2.5 transition',
                  phase === 'answer' || phase === 'proposal'
                    ? 'border-white/15 bg-white/[0.05]'
                    : 'border-dashed border-white/15 bg-white/[0.02] opacity-60'
                )}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                  3 · Respuesta
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/85">
                  {phase === 'answer' || phase === 'proposal'
                    ? PRODUCT_STORY.enviardian.reply
                    : 'La respuesta aparece con el contexto del caso.'}
                </p>
              </div>

              <div
                className={cn(
                  'rounded-xl border px-3 py-2.5 transition',
                  phase === 'proposal'
                    ? 'border-white/30 bg-white/[0.08] ring-1 ring-white/20'
                    : 'border-dashed border-white/15 bg-white/[0.02] opacity-60'
                )}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                  4 · Propuesta
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Solicitar apoyo a Legal para cláusula de pago
                </p>
                <p className="mt-0.5 text-[11px] text-white/55">
                  Relacionada con {PRODUCT_STORY.action.id} · confirmar antes de crear
                </p>
                {phase === 'proposal' ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-white/90"
                      disabled={confirmed}
                      onClick={() => setConfirmed(true)}
                    >
                      {confirmed ? 'Confirmada' : 'Confirmar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-white/20 bg-transparent px-3 text-xs text-white hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setPhase('idle')
                        setQuestion('')
                        setConfirmed(false)
                      }}
                    >
                      Limpiar
                    </Button>
                  </div>
                ) : null}
                {confirmed ? (
                  <p className="mt-2 text-[11px] font-medium text-emerald-300">
                    Demo local · no crea la acción real.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}
