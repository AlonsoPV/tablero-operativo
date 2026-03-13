/**
 * Schema Zod para crear/editar acción diaria (spec §5.1).
 * Validaciones: descripcion 10-500, evidencia_esperada mín 5.
 */

import { z } from 'zod'
import { ACTION_STATUS, PRIORIDAD_NC } from '@/types'

const descripcionAccionSchema = z
  .string()
  .min(1, 'La descripción es obligatoria')
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(10, 'Mínimo 10 caracteres')
      .max(500, 'Máximo 500 caracteres')
  )

const evidenciaEsperadaSchema = z
  .string()
  .min(1, 'La evidencia esperada es obligatoria')
  .transform((s) => s.trim())
  .pipe(z.string().min(5, 'Mínimo 5 caracteres'))

/** Formato hora HH:MM (sin segundos) */
const horaSchema = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, 'Formato HH:MM')
  .refine(
    (v) => {
      const [h, m] = v.split(':').map(Number)
      return h >= 0 && h <= 23 && m >= 0 && m <= 59
    },
    { message: 'Hora inválida' }
  )

export const accionCreateSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD').optional(),
  descripcion_accion: descripcionAccionSchema,
  responsable: z.string().uuid('Responsable obligatorio'),
  hora_limite: horaSchema,
  evidencia_esperada: evidenciaEsperadaSchema,
  estado: z.enum(ACTION_STATUS as unknown as [string, ...string[]]).optional(),
  prioridad: z.enum(PRIORIDAD_NC as unknown as [string, ...string[]]).optional(),
  kpi_afectado: z.string().uuid().nullable().optional(),
  okr_impactado: z.string().uuid().nullable().optional(),
  proceso: z.string().uuid().nullable().optional(),
  area: z.string().trim().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  causa_raiz: z.string().trim().nullable().optional(),
  responsable_bloqueo: z.string().uuid().nullable().optional(),
})

export const accionUpdateSchema = accionCreateSchema.partial().extend({
  evidencia_cargada: z.boolean().optional(),
  evidencia_adjunta: z.string().trim().nullable().optional(),
})

export type AccionCreateInput = z.infer<typeof accionCreateSchema>
export type AccionUpdateInput = z.infer<typeof accionUpdateSchema>
