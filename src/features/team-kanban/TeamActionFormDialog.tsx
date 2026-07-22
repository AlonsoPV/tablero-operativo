import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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

function teamPriority(value: string | undefined): 'Baja' | 'Media' | 'Alta' | 'Critica' {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('critic') || normalized.includes('p1')) return 'Critica'
  if (normalized.includes('alta')) return 'Alta'
  if (normalized.includes('baja') || normalized.includes('p3')) return 'Baja'
  return 'Media'
}

export function TeamActionFormDialog({ open, onOpenChange, areaId, areaName, board, onDone }: Props) {
  const { data: currentUser } = useCurrentUser()
  const [checklist, setChecklist] = useState<LocalCheckpointDraft[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const formId = 'team-action-form'
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
      await notifyTeamAssignee({
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
      await Promise.allSettled(
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
  const defaults: Partial<AccionFormInput> = { area: areaName, descripcion_modo: 'simple' }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="accion-form-dialog !flex flex-col gap-0 overflow-hidden p-0 fixed left-0 right-0 top-0 z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none border-x-0 border-t-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:h-auto sm:max-h-[min(90dvh,900px)] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border">
      <DialogTitle className="sr-only">Nueva accion de equipo</DialogTitle>
      <div className="shrink-0 border-b border-border/60 bg-card px-3 py-2.5 pr-11 sm:px-4 sm:py-3 sm:pr-12">
        <h2 className="text-sm font-semibold sm:text-base">Nueva accion</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{areaName} · Kanban por Equipos</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
        <AccionForm
          formId={formId}
          defaultValues={defaults}
          onSubmit={(values) => { setErrors([]); mutation.mutate(values) }}
          onSubmitInvalid={setErrors}
          onCancel={() => onOpenChange(false)}
          isSubmitting={mutation.isPending}
          userOptions={board.members}
          areaOptions={[{ id: areaId, nombre: areaName }]}
          lockedAreaName={areaName}
          validationExtras={
            <AccionChecklistEditor
              items={checklist}
              onChange={setChecklist}
              disabled={mutation.isPending}
              users={board.members}
            />
          }
        />
      </div>
      <div className="shrink-0 border-t border-border/60 bg-card px-3 py-3 sm:px-5">
        {errors.length > 0 ? <p className="mb-2 text-xs text-destructive">{errors.join(' · ')}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form={formId} disabled={mutation.isPending}>{mutation.isPending ? 'Creando...' : 'Crear accion'}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
