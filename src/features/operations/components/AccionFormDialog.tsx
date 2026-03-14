/**
 * Diálogo para crear o editar una acción diaria.
 * Usa AccionForm + useCreateAccion / useUpdateAccion.
 * Al crear, permite adjuntar evidencias (PDF, PNG, JPG) que se suben tras crear la acción.
 */

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AccionForm } from './AccionForm'
import { AccionEvidenciasSection } from './AccionEvidenciasSection'
import { AccionComentarios } from './AccionComentarios'
import { useCreateAccion, useUpdateAccion } from '../hooks'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { notificacionesService } from '@/services/notificaciones.service'
import {
  accionEvidenciasService,
  getAcceptedAccept,
  isAcceptedFile,
} from '@/services/accionEvidencias.service'
import { accionesService } from '@/services/acciones.service'
import type { AccionDiaria, ActionStatus, PrioridadNc } from '@/types'
import type { AccionCreateInput } from '../schemas/accion.schema'
import { toast } from 'sonner'
import { Paperclip, FileText, Image, Trash2 } from 'lucide-react'

/** Fecha de hoy en YYYY-MM-DD */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface AccionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accion?: AccionDiaria | null
  defaultFecha?: string
  onSuccess?: () => void
  /** Nombres de responsables para comentarios */
  responsableNames?: Record<string, string>
}

export function AccionFormDialog({
  open,
  onOpenChange,
  accion,
  defaultFecha,
  onSuccess,
  responsableNames = {},
}: AccionFormDialogProps) {
  const { data: currentUser } = useCurrentUser()
  const createAccion = useCreateAccion()
  const updateAccion = useUpdateAccion()
  const isEdit = !!accion?.id
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingNewEvidencias, setPendingNewEvidencias] = useState<File[]>([])
  const [dragOverNew, setDragOverNew] = useState(false)

  useEffect(() => {
    if (open && !isEdit) setPendingNewEvidencias([])
  }, [open, isEdit])

  async function notifyResponsable(usuarioId: string, accionId: string, descripcion: string) {
    if (!usuarioId || !accionId) return
    try {
      await notificacionesService.create({
        usuario_id: usuarioId,
        tipo: 'responsable',
        payload: {
          titulo: 'Te asignaron como responsable',
          mensaje: descripcion?.slice(0, 200) ?? '',
          accion_id: accionId,
        },
      })
    } catch (err) {
      console.error('Error al crear notificación de responsable:', err)
      toast.error(
        err instanceof Error ? err.message : 'No se pudo notificar al responsable. Revisa la política RLS de notificaciones.'
      )
    }
  }

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
      ...(isEdit
        ? { updated_by: currentUser?.id ?? null }
        : { created_by: currentUser?.id ?? null }),
    }

    if (isEdit && accion) {
      const nuevoResponsable = payload.responsable ?? null
      const cambiaResponsable = nuevoResponsable && nuevoResponsable !== accion.responsable
      updateAccion.mutate(
        { id: accion.id, payload },
        {
          onSuccess: async () => {
            if (cambiaResponsable && nuevoResponsable) {
              await notifyResponsable(nuevoResponsable, accion.id, payload.descripcion_accion ?? '')
            }
            toast.success('Acción actualizada correctamente')
            onOpenChange(false)
            onSuccess?.()
          },
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
        }
      )
    } else {
      const responsable = payload.responsable ?? null
      const filesToUpload = [...pendingNewEvidencias]
      createAccion.mutate(payload, {
        onSuccess: async (created) => {
          if (responsable && created?.id) {
            await notifyResponsable(responsable, created.id, payload.descripcion_accion ?? '')
          }
          if (created?.id && filesToUpload.length > 0) {
            try {
              for (const file of filesToUpload) {
                await accionEvidenciasService.upload(
                  created.id,
                  file,
                  currentUser?.id ?? null
                )
              }
              await accionesService.update(created.id, { evidencia_cargada: true })
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Error al subir evidencias')
            }
          }
          setPendingNewEvidencias([])
          toast.success('Acción creada correctamente')
          onOpenChange(false)
          onSuccess?.()
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Error al crear'),
      })
    }
  }

  const handleNewEvidenciaFile = (file: File) => {
    if (!isAcceptedFile(file)) {
      toast.error('Solo PDF, PNG o JPG (máx. 10 MB)')
      return
    }
    setPendingNewEvidencias((prev) => [...prev, file].slice(0, 10))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-hidden flex flex-col p-0 gap-0"
        aria-describedby={undefined}
      >
        <div className="shrink-0 border-b border-border/60 px-6 pr-12 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar acción' : 'Nueva acción'}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit ? 'Actualiza los campos y guarda los cambios' : 'Completa los datos para crear la acción'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AccionForm
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            isSubmitting={createAccion.isPending || updateAccion.isPending}
            isEdit={isEdit}
          />
          {!isEdit && (
            <div className="mt-6 border-t border-border/60 pt-5">
              <Card className="border-border/60 bg-muted/5">
                <CardHeader className="flex flex-row items-center gap-2 pb-2 pt-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Paperclip className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Evidencia adjunta (opcional)</h4>
                    <p className="text-xs text-muted-foreground">PDF, PNG o JPG (máx. 10 MB)</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={getAcceptedAccept()}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleNewEvidenciaFile(file)
                      e.target.value = ''
                    }}
                  />
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverNew(true) }}
                    onDragLeave={() => setDragOverNew(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverNew(false)
                      const file = e.dataTransfer.files?.[0]
                      if (file) handleNewEvidenciaFile(file)
                    }}
                    className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${dragOverNew ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/20'}`}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="mr-2 h-4 w-4" />
                      Seleccionar archivo
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">o arrastra un archivo aquí</p>
                  </div>
                  {pendingNewEvidencias.length > 0 && (
                    <ul className="space-y-2">
                      {pendingNewEvidencias.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-3 rounded-lg border border-border/50 bg-background px-3 py-2"
                        >
                          {f.type.startsWith('image/') ? (
                            <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => setPendingNewEvidencias((p) => p.filter((_, j) => j !== i))}
                            aria-label="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        {isEdit && accion && (
          <>
            <div className="mt-6 border-t border-border/60 pt-5">
              <AccionEvidenciasSection accionId={accion.id} />
            </div>
            <div className="mt-6 border-t border-border/60 pt-5">
              <AccionComentarios
                accionId={accion.id}
                responsableId={accion.responsable}
                responsableNames={responsableNames}
              />
            </div>
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
