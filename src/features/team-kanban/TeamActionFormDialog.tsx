import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccionForm } from '@/features/operations/components/AccionForm'
import { AccionChecklistEditor, type LocalCheckpointDraft } from '@/features/operations/components/AccionChecklistEditor'
import type { AccionCreateInput, AccionFormInput } from '@/features/operations/schemas/accion.schema'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { notificacionesService } from '@/services/notificaciones.service'
import type { TeamBoard } from './types'
import { teamKanbanService } from './service'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  areaId: string
  areaName: string
  board: TeamBoard
  onDone: () => Promise<void>
}

type TeamActionMode = 'single' | 'frequent'
type FrequencyType = 'diaria' | 'semanal' | 'quincenal' | 'mensual'

const weekdays = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
  { value: 7, label: 'Domingo' },
]

function teamPriority(value: string | undefined): 'Baja' | 'Media' | 'Alta' | 'Critica' {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('critic') || normalized.includes('p1')) return 'Critica'
  if (normalized.includes('alta')) return 'Alta'
  if (normalized.includes('baja') || normalized.includes('p3')) return 'Baja'
  return 'Media'
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function isoWeekdayFromDate(value: string) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date()
  const day = date.getDay()
  return day === 0 ? 7 : day
}

export function TeamActionFormDialog({ open, onOpenChange, areaId, areaName, board, onDone }: Props) {
  const { data: currentUser } = useCurrentUser()
  const [mode, setMode] = useState<TeamActionMode>('single')
  const [checklist, setChecklist] = useState<LocalCheckpointDraft[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [frequentForm, setFrequentForm] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: 'Media' as 'Baja' | 'Media' | 'Alta' | 'Critica',
    dueDate: todayInputValue(),
    dueTime: '09:00',
    frequencyType: 'semanal' as FrequencyType,
    weekday: isoWeekdayFromDate(todayInputValue()),
    monthDay: new Date().getDate(),
    evidenceRequired: true,
  })
  const formId = 'team-action-form'
  const frequentFormId = 'team-frequent-action-form'
  const memberName = (id: string | null | undefined) =>
    id ? board.members.find((member) => member.id === id)?.nombre ?? undefined : undefined

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
      prioridad: input.priority === 'Critica' ? 'Urgente' : input.priority === 'Alta' ? 'Alta' : 'Normal',
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
      priority: teamPriority(values.prioridad),
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
        evidenceText: null,
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
      toast.success('Accion frecuente creada')
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
      setFrequentForm((current) => ({ ...current, title: '', description: '', assignee: '' }))
      onOpenChange(false)
      await onDone()
    },
    onError: (error) => toast.error(error.message),
  })

  const defaults: Partial<AccionFormInput> = { area: areaName, descripcion_modo: 'simple' }
  const isSubmitting = mutation.isPending || frequentMutation.isPending

  const handleFrequentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: string[] = []
    if (!frequentForm.title.trim()) nextErrors.push('Titulo requerido')
    if (!frequentForm.assignee) nextErrors.push('Responsable requerido')
    if (frequentForm.frequencyType === 'semanal' && !frequentForm.weekday) nextErrors.push('Dia de semana requerido')
    if (['mensual', 'quincenal'].includes(frequentForm.frequencyType) && !frequentForm.monthDay) {
      nextErrors.push('Dia de referencia requerido')
    }
    setErrors(nextErrors)
    if (nextErrors.length === 0) frequentMutation.mutate()
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="accion-form-dialog !flex flex-col gap-0 overflow-hidden p-0 fixed left-0 right-0 top-0 z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none border-x-0 border-t-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:h-auto sm:max-h-[min(90dvh,900px)] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border">
      <DialogTitle className="sr-only">Nueva accion de equipo</DialogTitle>
      <div className="shrink-0 border-b border-border/60 bg-card px-3 py-2.5 pr-11 sm:px-4 sm:py-3 sm:pr-12">
        <h2 className="text-sm font-semibold sm:text-base">Nueva accion</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{areaName} - Kanban por Equipos</p>
        <div className="mt-3 grid grid-cols-2 rounded-lg border border-border/70 bg-muted/30 p-1 text-xs">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === 'single' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setMode('single')}
          >
            Accion unica
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === 'frequent' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setMode('frequent')}
          >
            Accion frecuente
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
        {mode === 'single' ? (
          <AccionForm
            formId={formId}
            defaultValues={defaults}
            onSubmit={(values) => { setErrors([]); mutation.mutate(values) }}
            onSubmitInvalid={setErrors}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
            userOptions={board.members}
            areaOptions={[{ id: areaId, nombre: areaName }]}
            lockedAreaName={areaName}
            validationExtras={
              <AccionChecklistEditor
                items={checklist}
                onChange={setChecklist}
                disabled={isSubmitting}
                users={board.members}
              />
            }
          />
        ) : (
          <form id={frequentFormId} className="space-y-5" onSubmit={handleFrequentSubmit}>
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">1. Informacion principal</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Define el compromiso recurrente, responsable y calendario.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="frequent-title">Titulo</Label>
                  <Input
                    id="frequent-title"
                    value={frequentForm.title}
                    onChange={(event) => setFrequentForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Ej. Actualizar avance de entregas"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="frequent-description">Indicacion para el responsable</Label>
                  <textarea
                    id="frequent-description"
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={frequentForm.description}
                    onChange={(event) => setFrequentForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Describe que actualizacion debe capturar en cada periodo."
                    maxLength={600}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Responsable</Label>
                  <Select value={frequentForm.assignee} onValueChange={(value) => setFrequentForm((current) => ({ ...current, assignee: value }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {board.members.map((member) => <SelectItem key={member.id} value={member.id}>{member.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridad</Label>
                  <Select value={frequentForm.priority} onValueChange={(value) => setFrequentForm((current) => ({ ...current, priority: value as typeof frequentForm.priority }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Baja', 'Media', 'Alta', 'Critica'].map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="frequent-date">Primer vencimiento</Label>
                  <Input
                    id="frequent-date"
                    type="date"
                    value={frequentForm.dueDate}
                    onChange={(event) => setFrequentForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                      weekday: current.frequencyType === 'semanal' ? isoWeekdayFromDate(event.target.value) : current.weekday,
                      monthDay: ['mensual', 'quincenal'].includes(current.frequencyType)
                        ? new Date(`${event.target.value}T12:00:00`).getDate()
                        : current.monthDay,
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="frequent-time">Hora limite</Label>
                  <Input
                    id="frequent-time"
                    type="time"
                    value={frequentForm.dueTime}
                    onChange={(event) => setFrequentForm((current) => ({ ...current, dueTime: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Frecuencia</Label>
                  <Select value={frequentForm.frequencyType} onValueChange={(value) => setFrequentForm((current) => ({ ...current, frequencyType: value as FrequencyType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Diaria</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quincenal">Quincenal</SelectItem>
                      <SelectItem value="mensual">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {frequentForm.frequencyType === 'semanal' ? (
                  <div className="space-y-1.5">
                    <Label>Dia de envio</Label>
                    <Select value={String(frequentForm.weekday)} onValueChange={(value) => setFrequentForm((current) => ({ ...current, weekday: Number(value) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {weekdays.map((day) => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {['mensual', 'quincenal'].includes(frequentForm.frequencyType) ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="frequent-month-day">Dia de referencia</Label>
                    <Input
                      id="frequent-month-day"
                      type="number"
                      min={1}
                      max={31}
                      value={frequentForm.monthDay}
                      onChange={(event) => setFrequentForm((current) => ({ ...current, monthDay: Number(event.target.value) }))}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">3. Evidencia y validacion</p>
                <p className="mt-0.5 text-xs text-muted-foreground">El responsable capturara la actualizacion de cada periodo y cerrara los puntos de validacion.</p>
              </div>
              <label className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={frequentForm.evidenceRequired}
                  onChange={(event) => setFrequentForm((current) => ({ ...current, evidenceRequired: event.target.checked }))}
                />
                Requiere apoyo documental al actualizar
              </label>
              <AccionChecklistEditor
                items={checklist}
                onChange={setChecklist}
                disabled={isSubmitting}
                users={board.members}
              />
            </section>
          </form>
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 bg-card px-3 py-3 sm:px-5">
        {errors.length > 0 ? <p className="mb-2 text-xs text-destructive">{errors.join(' - ')}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form={mode === 'single' ? formId : frequentFormId} disabled={isSubmitting}>
            {isSubmitting ? 'Creando...' : mode === 'frequent' ? 'Crear frecuente' : 'Crear accion'}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
