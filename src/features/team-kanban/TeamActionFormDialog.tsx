import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CalendarClock, Check, FileCheck, Repeat2, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccionForm } from '@/features/operations/components/AccionForm'
import { AccionFormField } from '@/features/operations/components/AccionFormSection'
import { AccionFormBlock } from '@/features/operations/components/form/AccionFormBlock'
import { AccionAsignadorNote } from '@/features/operations/components/form/AccionAsignadorNote'
import { EvidenceOptionPicker } from '@/features/operations/components/form/EvidenceOptionPicker'
import { useDropdownOptionsByKey } from '@/features/catalogs/hooks/useDropdownOptions'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { AccionChecklistEditor, type LocalCheckpointDraft } from '@/features/operations/components/AccionChecklistEditor'
import type { AccionCreateInput, AccionFormInput } from '@/features/operations/schemas/accion.schema'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { notificacionesService } from '@/services/notificaciones.service'
import type { TeamBoard } from './types'
import { teamKanbanService } from './service'
import { TeamMemberSelect } from './components/TeamMemberSelect'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  areaId: string
  areaName: string
  board: TeamBoard
  priorities: Priority[]
  onDone: () => Promise<void>
}

type TeamActionMode = 'single' | 'frequent'
type FrequencyType = 'diaria' | 'semanal' | 'quincenal' | 'mensual'

const inputBase =
  'rounded-md border border-input bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const textareaBase =
  'flex min-h-[6rem] w-full resize-y rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm leading-relaxed transition-colors placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50'

/** Mismo contrato que AccionForm: valor interno para «Otro (especificar)». */
const EVIDENCIA_OTRO_INTERNAL = '__evidencia_otro__'

const modeOptions = [
  {
    value: 'single' as const,
    label: 'Única',
    hint: 'Se ejecuta una vez y se cierra.',
    icon: Target,
  },
  {
    value: 'frequent' as const,
    label: 'Frecuente',
    hint: 'Genera una acción por periodo.',
    icon: Repeat2,
  },
]

const weekdays = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
  { value: 7, label: 'Domingo' },
]

function notificationPriority(value: string | undefined): 'Normal' | 'Alta' | 'Urgente' {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('critic') || normalized.includes('p1') || normalized.includes('urgent')) return 'Urgente'
  if (normalized.includes('alta')) return 'Alta'
  return 'Normal'
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function isoWeekdayFromDate(value: string) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date()
  const day = date.getDay()
  return day === 0 ? 7 : day
}

export function TeamActionFormDialog({ open, onOpenChange, areaId, areaName, board, priorities, onDone }: Props) {
  const { data: currentUser } = useCurrentUser()
  const [mode, setMode] = useState<TeamActionMode>('single')
  const [checklist, setChecklist] = useState<LocalCheckpointDraft[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [frequentBlocksOpen, setFrequentBlocksOpen] = useState({
    principal: true,
    validacion: true,
  })
  const [frequentForm, setFrequentForm] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: priorities[0]?.nombre ?? 'P2_Media',
    dueDate: todayInputValue(),
    dueTime: '09:00',
    frequencyType: 'semanal' as FrequencyType,
    weekday: isoWeekdayFromDate(todayInputValue()),
    monthDay: new Date().getDate(),
    evidenceRequired: true,
    evidenceText: '',
  })
  const [evidenceSelect, setEvidenceSelect] = useState('')
  const { data: evidenciaOpciones = [], isLoading: evidenciaLoading } =
    useDropdownOptionsByKey('evidencia_esperada')
  const formId = 'team-action-form'
  const frequentFormId = 'team-frequent-action-form'
  const memberName = (id: string | null | undefined) =>
    id ? board.members.find((member) => member.id === id)?.nombre ?? undefined : undefined

  useEffect(() => {
    if (priorities.length === 0) return
    setFrequentForm((current) =>
      priorities.some((priority) => priority.nombre === current.priority)
        ? current
        : { ...current, priority: priorities[0].nombre }
    )
  }, [priorities])

  const notifyTeamAssignee = async (input: {
    usuarioId: string
    actionId: string
    title: string
    description: string
    dueAt: string | null
    priority: string
  }) => {
    if (!input.usuarioId || input.usuarioId === currentUser?.id) return
    await notificacionesService.create({
      usuario_id: input.usuarioId,
      tipo: 'team_responsable',
      prioridad: notificationPriority(input.priority),
      payload: {
        titulo: 'Te asignaron una accion de equipo',
        titulo_accion: input.title,
        descripcion_accion: input.description,
        equipo_accion_id: input.actionId,
        area_id: areaId,
        area_nombre: areaName,
        responsable_id: input.usuarioId,
        responsable_nombre: memberName(input.usuarioId),
        fecha_compromiso: input.dueAt ?? undefined,
        asignador_id: currentUser?.id ?? null,
        asignador_nombre: currentUser?.nombre ?? null,
      },
    })
  }

  const notifyTeamCheckpointResponsable = async (input: {
    usuarioId: string
    actionId: string
    actionTitle: string
    description: string
    checkpointText: string
  }) => {
    if (!input.usuarioId || input.usuarioId === currentUser?.id) return
    await notificacionesService.create({
      usuario_id: input.usuarioId,
      tipo: 'team_check_responsable',
      prioridad: 'Alta',
      payload: {
        titulo: 'Te asignaron un check de equipo',
        titulo_accion: input.actionTitle,
        descripcion_accion: input.description,
        mensaje: input.checkpointText,
        checklist: [input.checkpointText],
        equipo_accion_id: input.actionId,
        area_id: areaId,
        area_nombre: areaName,
        responsable_id: input.usuarioId,
        responsable_nombre: memberName(input.usuarioId),
        asignador_id: currentUser?.id ?? null,
        asignador_nombre: currentUser?.nombre ?? null,
      },
    })
  }

  const mutation = useMutation({
    mutationFn: (values: AccionCreateInput) => teamKanbanService.create({
      areaId,
      title: values.titulo_accion?.trim() || values.descripcion_accion.slice(0, 70),
      description: values.descripcion_accion,
      assignee: values.responsable,
      priority: values.prioridad,
      dueAt: values.fecha ? new Date(`${values.fecha}T${values.hora_limite}:00`).toISOString() : null,
      evidence: Boolean(values.evidencia_esperada?.trim()),
      evidenceText: values.evidencia_esperada,
      checklist: checklist
        .map((item) => ({ text: item.texto.trim(), responsable_id: item.responsable_id ?? null }))
        .filter((item) => item.text),
      storyPoints: values.story_points,
      actionType: values.tipo_accion,
      gapIds: values.gap_ids,
      catalogKpiIds: values.catalog_kpi_ids,
    }),
    onSuccess: async (created, values) => {
      toast.success('Accion de equipo creada')
      const title = values.titulo_accion?.trim() || values.descripcion_accion.slice(0, 70)
      void notifyTeamAssignee({
        usuarioId: values.responsable,
        actionId: created.id,
        title,
        description: values.descripcion_accion,
        dueAt: created.fecha_limite,
        priority: created.prioridad,
      }).catch((error) => {
        console.warn('[team-kanban] No se pudo notificar al responsable:', error)
        toast.error(error instanceof Error ? error.message : 'No se pudo notificar al responsable')
      })
      void Promise.allSettled(
        checklist
          .filter((item) => item.responsable_id)
          .map((item) =>
            notifyTeamCheckpointResponsable({
              usuarioId: item.responsable_id!,
              actionId: created.id,
              actionTitle: title,
              description: values.descripcion_accion,
              checkpointText: item.texto.trim(),
            })
          )
      )
      setChecklist([])
      setErrors([])
      onOpenChange(false)
      await onDone()
    },
    onError: (error) => toast.error(error.message),
  })

  const frequentMutation = useMutation({
    mutationFn: () => {
      const validationItems = checklist
        .map((item) => ({ text: item.texto.trim(), responsable_id: item.responsable_id ?? null }))
        .filter((item) => item.text)
      const dueAt = frequentForm.dueDate
        ? new Date(`${frequentForm.dueDate}T${frequentForm.dueTime || '09:00'}:00`).toISOString()
        : null
      const monthDay = Math.min(31, Math.max(1, Number(frequentForm.monthDay) || 1))

      return teamKanbanService.create({
        areaId,
        title: frequentForm.title.trim(),
        description: frequentForm.description.trim(),
        assignee: frequentForm.assignee,
        priority: frequentForm.priority,
        dueAt,
        evidence: frequentForm.evidenceRequired,
        evidenceText: frequentForm.evidenceRequired ? frequentForm.evidenceText.trim() : null,
        checklist: validationItems.length > 0
          ? validationItems
          : [{ text: 'Registrar actualizacion del periodo', responsable_id: frequentForm.assignee }],
        actionType: 'frecuente',
        isFrequent: true,
        recurrenceType: frequentForm.frequencyType,
        recurrenceWeekday: frequentForm.frequencyType === 'semanal' ? frequentForm.weekday : null,
        recurrenceMonthDay: ['mensual', 'quincenal'].includes(frequentForm.frequencyType) ? monthDay : null,
        recurrenceStart: frequentForm.dueDate || null,
      })
    },
    onSuccess: async (created) => {
      toast.success('Recurrencia programada: se genera una accion por periodo')
      void notifyTeamAssignee({
        usuarioId: created.asignado_a,
        actionId: created.id,
        title: created.titulo,
        description: created.descripcion ?? '',
        dueAt: created.fecha_limite,
        priority: created.prioridad,
      }).catch((error) => {
        console.warn('[team-kanban] No se pudo notificar accion frecuente:', error)
        toast.error(error instanceof Error ? error.message : 'No se pudo notificar al responsable')
      })
      void Promise.allSettled(
        (created.checklist ?? [])
          .filter((item) => item.responsable_id)
          .map((item) =>
            notifyTeamCheckpointResponsable({
              usuarioId: item.responsable_id!,
              actionId: created.id,
              actionTitle: created.titulo,
              description: created.descripcion ?? '',
              checkpointText: item.text,
            })
          )
      )
      setChecklist([])
      setErrors([])
      setEvidenceSelect('')
      setFrequentForm((current) => ({
        ...current,
        title: '',
        description: '',
        assignee: '',
        evidenceText: '',
      }))
      onOpenChange(false)
      await onDone()
    },
    onError: (error) => toast.error(error.message),
  })

  const catalogHasOtro = evidenciaOpciones.some(
    (option) => option.value.trim().toLowerCase() === 'otro'
  )
  const evidenceNeedsFreeText =
    evidenceSelect === EVIDENCIA_OTRO_INTERNAL ||
    evidenciaOpciones.find((option) => option.value === evidenceSelect)?.value.trim().toLowerCase() ===
      'otro'

  const defaults: Partial<AccionFormInput> = {
    area: areaName,
    descripcion_modo: 'simple',
    prioridad: priorities[0]?.nombre,
  }
  const isSubmitting = mutation.isPending || frequentMutation.isPending
  const assigneeName = board.members.find((member) => member.id === frequentForm.assignee)?.nombre
  const frequencyLabel = ({
    diaria: 'Diaria',
    semanal: 'Semanal',
    quincenal: 'Quincenal',
    mensual: 'Mensual',
  } as const)[frequentForm.frequencyType]

  const handleFrequentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: string[] = []
    if (!frequentForm.title.trim()) nextErrors.push('Titulo requerido')
    if (!frequentForm.assignee) nextErrors.push('Responsable requerido')
    if (frequentForm.frequencyType === 'semanal' && !frequentForm.weekday) nextErrors.push('Dia de semana requerido')
    if (['mensual', 'quincenal'].includes(frequentForm.frequencyType) && !frequentForm.monthDay) {
      nextErrors.push('Dia de referencia requerido')
    }
    if (frequentForm.evidenceRequired && frequentForm.evidenceText.trim().length < 5) {
      nextErrors.push('Indica que evidencia se requiere (min. 5 caracteres)')
    }
    setErrors(nextErrors)
    if (nextErrors.length === 0) frequentMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="accion-form-dialog !flex flex-col gap-0 overflow-hidden p-0 fixed left-0 right-0 top-0 z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none border-x-0 border-t-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:h-auto sm:max-h-[min(90dvh,900px)] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border">
        <DialogTitle className="sr-only">Nueva accion de equipo</DialogTitle>
        <div className="shrink-0 border-b border-border/60 bg-card px-3 py-2.5 pr-11 sm:px-4 sm:py-3 sm:pr-12">
          <h2 className="text-sm font-semibold sm:text-base">Nueva acción</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
            {areaName} · Kanban por Equipos
          </p>
          <AccionAsignadorNote nombre={currentUser?.nombre} className="mt-3" />
          <div
            role="radiogroup"
            aria-label="Tipo de acción"
            className="mt-3 grid grid-cols-2 gap-2"
          >
            {modeOptions.map((option) => {
              const active = mode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    active
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                      : 'border-border/70 bg-muted/20 hover:border-primary/40 hover:bg-muted/40'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                      active ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
                    )}
                  >
                    <option.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-[13px] font-semibold leading-tight text-foreground">
                      {option.label}
                      {active ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
          {board.members.length === 0 ? (
            <div className="mb-4 rounded-md border border-dashed border-border bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
              No hay usuarios disponibles dentro de tu equipo.
            </div>
          ) : null}
          {mode === 'single' ? (
            <AccionForm
              formId={formId}
              defaultValues={defaults}
              onSubmit={(values) => { setErrors([]); mutation.mutate(values) }}
              onSubmitInvalid={setErrors}
              onCancel={() => onOpenChange(false)}
              isSubmitting={isSubmitting}
              userOptions={board.members}
              renderResponsibleSelector={(props) => (
                <TeamMemberSelect members={board.members} {...props} />
              )}
              lockedAreaName={areaName}
              validationExtras={
                <AccionChecklistEditor
                  items={checklist}
                  onChange={setChecklist}
                  disabled={isSubmitting}
                  users={board.members}
                  renderResponsibleSelector={(props) => (
                    <TeamMemberSelect
                      members={board.members}
                      allowEmpty
                      emptyLabel="Sin responsable especifico"
                      {...props}
                    />
                  )}
                />
              }
            />
          ) : (
            <form
              id={frequentFormId}
              className="accion-form space-y-3 sm:space-y-4"
              onSubmit={handleFrequentSubmit}
              data-accion-form-mode="create"
            >
              <AccionFormBlock
                blockId="team-frequent-block-principal"
                step={1}
                title="Información principal"
                subtitle="Define el compromiso recurrente, quién lo ejecutará y el calendario."
                icon={CalendarClock}
                expanded={frequentBlocksOpen.principal}
                onToggle={() => setFrequentBlocksOpen((current) => ({
                  ...current,
                  principal: !current.principal,
                }))}
                collapsedSummary={[
                  frequentForm.title.trim() || null,
                  assigneeName || null,
                  frequencyLabel,
                ].filter(Boolean).join(' · ') || undefined}
              >
                <fieldset className="space-y-4" disabled={isSubmitting}>
                  <AccionFormField label="Título de la acción" htmlFor="frequent-title" required>
                    <Input
                      id="frequent-title"
                      value={frequentForm.title}
                      onChange={(event) => setFrequentForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Ej. Actualizar avance de entregas"
                      maxLength={120}
                      className={`${inputBase} h-10`}
                    />
                    <p className="text-xs text-muted-foreground">{frequentForm.title.length}/120</p>
                  </AccionFormField>

                  <AccionFormField label="Descripción" htmlFor="frequent-description" required>
                    <textarea
                      id="frequent-description"
                      value={frequentForm.description}
                      onChange={(event) => setFrequentForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))}
                      placeholder="Describe qué actualización debe capturar el responsable en cada periodo."
                      rows={4}
                      className={`${textareaBase} max-h-[min(40vh,360px)] overflow-y-auto whitespace-pre-wrap break-words`}
                    />
                  </AccionFormField>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
                    <AccionFormField
                      label="Responsable de ejecutar"
                      htmlFor="frequent-assignee"
                      hint="Persona que ejecuta y cierra cada periodo."
                      hintAsIcon
                      required
                    >
                      <TeamMemberSelect
                        id="frequent-assignee"
                        members={board.members}
                        value={frequentForm.assignee}
                        onValueChange={(value) => setFrequentForm((current) => ({
                          ...current,
                          assignee: value ?? '',
                        }))}
                        disabled={isSubmitting}
                      />
                    </AccionFormField>

                    <AccionFormField label="Prioridad" htmlFor="frequent-priority" required>
                      <Select
                        value={frequentForm.priority}
                        onValueChange={(value) => setFrequentForm((current) => ({
                          ...current,
                          priority: value,
                        }))}
                      >
                        <SelectTrigger id="frequent-priority" className={`${inputBase} h-10`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorities.map((priority) => (
                            <SelectItem key={priority.id} value={priority.nombre}>{priority.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </AccionFormField>
                  </div>

                  <AccionFormField
                    label="Primer vencimiento y hora límite"
                    htmlFor="frequent-date"
                    hint="Fecha y hora del primer ciclo."
                    hintAsIcon
                    required
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        id="frequent-date"
                        type="date"
                        value={frequentForm.dueDate}
                        onChange={(event) => setFrequentForm((current) => ({
                          ...current,
                          dueDate: event.target.value,
                          weekday: current.frequencyType === 'semanal'
                            ? isoWeekdayFromDate(event.target.value)
                            : current.weekday,
                          monthDay: ['mensual', 'quincenal'].includes(current.frequencyType)
                            ? new Date(`${event.target.value}T12:00:00`).getDate()
                            : current.monthDay,
                        }))}
                        className={`${inputBase} h-10`}
                      />
                      <Input
                        id="frequent-time"
                        type="time"
                        value={frequentForm.dueTime}
                        onChange={(event) => setFrequentForm((current) => ({
                          ...current,
                          dueTime: event.target.value,
                        }))}
                        step={60}
                        className={`${inputBase} h-10`}
                      />
                    </div>
                  </AccionFormField>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
                    <AccionFormField label="Frecuencia" htmlFor="frequent-frequency" required>
                      <Select
                        value={frequentForm.frequencyType}
                        onValueChange={(value) => setFrequentForm((current) => ({
                          ...current,
                          frequencyType: value as FrequencyType,
                        }))}
                      >
                        <SelectTrigger id="frequent-frequency" className={`${inputBase} h-10`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="diaria">Diaria</SelectItem>
                          <SelectItem value="semanal">Semanal</SelectItem>
                          <SelectItem value="quincenal">Quincenal</SelectItem>
                          <SelectItem value="mensual">Mensual</SelectItem>
                        </SelectContent>
                      </Select>
                    </AccionFormField>

                    {frequentForm.frequencyType === 'semanal' ? (
                      <AccionFormField label="Día de envío" htmlFor="frequent-weekday" required>
                        <Select
                          value={String(frequentForm.weekday)}
                          onValueChange={(value) => setFrequentForm((current) => ({
                            ...current,
                            weekday: Number(value),
                          }))}
                        >
                          <SelectTrigger id="frequent-weekday" className={`${inputBase} h-10`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {weekdays.map((day) => (
                              <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </AccionFormField>
                    ) : null}

                    {['mensual', 'quincenal'].includes(frequentForm.frequencyType) ? (
                      <AccionFormField label="Día de referencia" htmlFor="frequent-month-day" required>
                        <Input
                          id="frequent-month-day"
                          type="number"
                          min={1}
                          max={31}
                          value={frequentForm.monthDay}
                          onChange={(event) => setFrequentForm((current) => ({
                            ...current,
                            monthDay: Number(event.target.value),
                          }))}
                          className={`${inputBase} h-10`}
                        />
                      </AccionFormField>
                    ) : null}
                  </div>
                </fieldset>
              </AccionFormBlock>

              <AccionFormBlock
                blockId="team-frequent-block-validacion"
                step={2}
                title="Evidencia y validación"
                subtitle="Qué comprobará el cierre de cada periodo."
                icon={FileCheck}
                expanded={frequentBlocksOpen.validacion}
                onToggle={() => setFrequentBlocksOpen((current) => ({
                  ...current,
                  validacion: !current.validacion,
                }))}
                collapsedSummary={
                  frequentForm.evidenceRequired
                    ? `${frequentForm.evidenceText.trim() || 'Evidencia requerida'} · checklist`
                    : 'Checklist de validación'
                }
              >
                <div className="space-y-4">
                  <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input"
                      checked={frequentForm.evidenceRequired}
                      onChange={(event) => setFrequentForm((current) => ({
                        ...current,
                        evidenceRequired: event.target.checked,
                      }))}
                      disabled={isSubmitting}
                    />
                    <span>
                      <span className="block font-medium text-foreground">
                        Requiere apoyo documental al actualizar
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        El responsable deberá adjuntar evidencia al cerrar cada ciclo.
                      </span>
                    </span>
                  </label>

                  {frequentForm.evidenceRequired ? (
                    <AccionFormField
                      label="¿Qué evidencia debe adjuntar en cada periodo?"
                      required
                      hint="Se copia tal cual a cada acción que genere la recurrencia."
                    >
                      {evidenciaOpciones.length > 0 ? (
                        <EvidenceOptionPicker
                          options={evidenciaOpciones.map((option) => ({
                            id: option.id,
                            value: option.value,
                            label: option.label,
                          }))}
                          selectedValue={evidenceSelect}
                          otherInternalValue={catalogHasOtro ? undefined : EVIDENCIA_OTRO_INTERNAL}
                          disabled={isSubmitting}
                          onSelect={(value, label) => {
                            setEvidenceSelect(value)
                            setFrequentForm((current) => ({
                              ...current,
                              evidenceText: value === EVIDENCIA_OTRO_INTERNAL ? '' : label,
                            }))
                          }}
                        />
                      ) : evidenciaLoading ? (
                        <p className="text-xs text-muted-foreground">Cargando catálogo de evidencia…</p>
                      ) : null}
                      {evidenceNeedsFreeText || evidenciaOpciones.length === 0 ? (
                        <Input
                          id="frequent-evidence-text"
                          value={frequentForm.evidenceText}
                          onChange={(event) => setFrequentForm((current) => ({
                            ...current,
                            evidenceText: event.target.value,
                          }))}
                          placeholder="Especificar (mín. 5 caracteres)"
                          maxLength={200}
                          disabled={isSubmitting}
                          className={`${inputBase} mt-2 h-10`}
                        />
                      ) : null}
                    </AccionFormField>
                  ) : null}

                  <div className="space-y-4 border-t border-border/50 pt-4">
                    <AccionChecklistEditor
                      items={checklist}
                      onChange={setChecklist}
                      disabled={isSubmitting}
                      users={board.members}
                      renderResponsibleSelector={(props) => (
                        <TeamMemberSelect
                          members={board.members}
                          allowEmpty
                          emptyLabel="Sin responsable especifico"
                          {...props}
                        />
                      )}
                    />
                  </div>
                </div>
              </AccionFormBlock>
            </form>
          )}
        </div>
        <div className="shrink-0 border-t border-border/60 bg-card px-3 py-3 sm:px-5">
          {errors.length > 0 ? <p className="mb-2 text-xs text-destructive">{errors.join(' - ')}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" form={mode === 'single' ? formId : frequentFormId} disabled={isSubmitting}>
              {isSubmitting
                ? 'Creando...'
                : mode === 'frequent'
                  ? 'Programar recurrencia'
                  : 'Crear acción'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
