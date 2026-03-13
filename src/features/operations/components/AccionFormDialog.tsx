/**
 * Diálogo para crear o editar una acción diaria.
 * Usa AccionForm + useCreateAccion / useUpdateAccion.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccionForm } from './AccionForm'
import { useCreateAccion, useUpdateAccion } from '../hooks'
import type { AccionDiaria, ActionStatus, PrioridadNc } from '@/types'
import type { AccionCreateInput } from '../schemas/accion.schema'
import { toast } from 'sonner'

/** Fecha de hoy en YYYY-MM-DD */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface AccionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si se proporciona, modo edición */
  accion?: AccionDiaria | null
  /** Fecha por defecto al crear (default: hoy) */
  defaultFecha?: string
  /** Callback tras crear/editar correctamente */
  onSuccess?: () => void
}

export function AccionFormDialog({
  open,
  onOpenChange,
  accion,
  defaultFecha,
  onSuccess,
}: AccionFormDialogProps) {
  const createAccion = useCreateAccion()
  const updateAccion = useUpdateAccion()
  const isEdit = !!accion?.id

  const defaultValues: Partial<AccionCreateInput> | null = accion
    ? {
        fecha: accion.fecha,
        descripcion_accion: accion.descripcion_accion,
        responsable: accion.responsable,
        hora_limite: accion.hora_limite?.slice(0, 5) ?? '17:00',
        evidencia_esperada: accion.evidencia_esperada,
        estado: accion.estado,
        prioridad: accion.prioridad,
        area: accion.area ?? undefined,
      }
    : {
        fecha: defaultFecha ?? todayISO(),
        hora_limite: '17:00',
        prioridad: 'P2_Media',
      }

  const handleSubmit = (values: AccionCreateInput) => {
    const fecha = values.fecha ?? todayISO()
    const prioridad = (values.prioridad ?? 'P2_Media') as PrioridadNc
    const estado = (values.estado ?? 'Pendiente') as ActionStatus
    const payload: Partial<AccionDiaria> = {
      fecha,
      descripcion_accion: values.descripcion_accion,
      responsable: values.responsable,
      hora_limite: values.hora_limite,
      evidencia_esperada: values.evidencia_esperada,
      prioridad,
      estado,
      area: values.area ?? null,
    }

    if (isEdit && accion) {
      updateAccion.mutate(
        { id: accion.id, payload },
        {
          onSuccess: () => {
            toast.success('Acción actualizada correctamente')
            onOpenChange(false)
            onSuccess?.()
          },
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
        }
      )
    } else {
      createAccion.mutate(payload, {
        onSuccess: () => {
          toast.success('Acción creada correctamente')
          onOpenChange(false)
          onSuccess?.()
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Error al crear'),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar acción' : 'Nueva acción'}</DialogTitle>
        </DialogHeader>
        <AccionForm
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={createAccion.isPending || updateAccion.isPending}
          isEdit={isEdit}
        />
      </DialogContent>
    </Dialog>
  )
}
