/**
 * Payload de correo de acción (org / send-notification-email),
 * mismo shape que el botón "Enviar correo al responsable" del Kanban.
 */

import { flattenDescripcionForForm } from '@/features/operations/utils/descripcionAccionTriada'

export type AccionEmailPayloadInput = {
  accionId: string
  tituloAccion: string
  descripcionAccion: string
  responsableId?: string | null
  responsableNombre?: string | null
  fecha?: string | null
  horaLimite?: string | null
  creadorId?: string | null
  creadorNombre?: string | null
  checklist?: string[]
  titulo?: string
  asignadorId?: string | null
  asignadorNombre?: string | null
}

export function buildAccionEmailPayload(input: AccionEmailPayloadInput): Record<string, unknown> {
  const fechaCompromiso = [input.fecha, input.horaLimite?.slice(0, 5)].filter(Boolean).join(' ')

  return {
    titulo: input.titulo ?? 'Te asignaron como responsable',
    titulo_accion: input.tituloAccion.trim() || undefined,
    descripcion_accion:
      flattenDescripcionForForm(input.descripcionAccion ?? '').trim().slice(0, 2000) || undefined,
    responsable_id: input.responsableId ?? null,
    responsable_nombre: input.responsableNombre?.trim() || undefined,
    fecha_compromiso: fechaCompromiso || undefined,
    checklist: input.checklist?.map((item) => item.trim()).filter(Boolean) ?? [],
    creador_id: input.creadorId ?? null,
    creador_nombre: input.creadorNombre ?? null,
    accion_id: input.accionId,
    asignador_id: input.asignadorId ?? null,
    asignador_nombre: input.asignadorNombre ?? null,
  }
}

export const ACCION_SHARE_EMAIL_TITLE = 'Te compartieron una accion'
