/**
 * Schema Zod para crear/editar acción diaria (spec §5.1).
 * Descripción en tres partes (Cómo / Quiero / Para qué) → una sola columna `descripcion_accion`.
 */

import { z } from 'zod'
import { ACTION_STATUS } from '@/types'
import { DEFAULT_PRIORITY_NOMBRE } from '../utils/priorityLabels'
import { formatDescripcionTriada } from '../utils/descripcionAccionTriada'
import { STORY_POINTS_OPTIONS } from '../utils/tipoAccionConfig'

const TIPO_ACCION_ENUM = z.enum(['operativa', 'sprint', 'estrategica', 'desbloqueo'])

const tituloAccionSchema = z
  .string()
  .transform((s) => (s ?? '').trim())
  .pipe(z.string().max(70, 'Máximo 70 caracteres'))

/** Cada respuesta de la triada (5–400 caracteres). */
const descripcionParteSchema = z
  .string()
  .min(1, 'Este campo es obligatorio')
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(5, 'Mínimo 5 caracteres')
      .max(400, 'Máximo 400 caracteres')
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

const DESCRIPCION_SIMPLE_MIN = 15

const accionInputShape = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD').optional(),
  titulo_accion: tituloAccionSchema,
  /** Modo de captura: una sola caja o triada estructurada. */
  descripcion_modo: z.enum(['simple', 'estructurada']).default('simple'),
  descripcion_simple: z.string().optional(),
  descripcion_como: z.string().optional(),
  descripcion_quiero: z.string().optional(),
  descripcion_para_que: z.string().optional(),
  responsable: z.string().uuid('Responsable obligatorio'),
  hora_limite: horaSchema,
  evidencia_esperada: evidenciaEsperadaSchema,
  estado: z.enum(ACTION_STATUS as unknown as [string, ...string[]]).optional(),
  prioridad: z
    .string()
    .min(1, 'Prioridad obligatoria')
    .max(100)
    .optional()
    .default(DEFAULT_PRIORITY_NOMBRE),
  kpi_afectado: z.string().uuid().nullable().optional(),
  /** Brechas O2C impactadas (tabla puente + columna primaria = primer id). */
  gap_ids: z.array(z.string().uuid()).max(50).optional().default([]),
  /** KPIs de catálogo impactados (tabla puente + columna primaria = primer id). */
  catalog_kpi_ids: z.array(z.string().uuid()).max(50).optional().default([]),
  okr_impactado: z.string().uuid().nullable().optional(),
  proceso: z.string().uuid().nullable().optional(),
  area: z.string().trim().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  causa_raiz: z.string().trim().nullable().optional(),
  responsable_bloqueo: z.string().uuid().nullable().optional(),
  tipo_accion: TIPO_ACCION_ENUM.default('operativa'),
  story_points: z
    .number()
    .refine(
      (v) => v === 0 || (STORY_POINTS_OPTIONS as readonly number[]).includes(v),
      {
        message: 'Debe ser 0 o un valor Fibonacci: 1, 2, 3, 5, 8 o 13',
      }
    )
    .default(0),
  sprint_id: z.string().uuid().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.tipo_accion === 'sprint' && !value.sprint_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sprint_id'],
      message: 'Selecciona un sprint para una accion de sprint.',
    })
  }
  if (value.tipo_accion === 'desbloqueo' && !value.responsable_bloqueo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['responsable_bloqueo'],
      message: 'Selecciona quien debe desbloquear esta accion.',
    })
  }
  if (value.descripcion_modo === 'estructurada') {
    for (const [field, path] of [
      ['descripcion_como', 'descripcion_como'],
      ['descripcion_quiero', 'descripcion_quiero'],
      ['descripcion_para_que', 'descripcion_para_que'],
    ] as const) {
      const parsed = descripcionParteSchema.safeParse(value[field] ?? '')
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'Este campo es obligatorio'
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: msg })
      }
    }
  } else {
    const s = (value.descripcion_simple ?? '').trim()
    if (s.length < DESCRIPCION_SIMPLE_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['descripcion_simple'],
        message: `Mínimo ${DESCRIPCION_SIMPLE_MIN} caracteres para describir la acción.`,
      })
    }
  }
})

export const accionCreateSchema = accionInputShape.transform(
  ({
    descripcion_modo,
    descripcion_simple,
    descripcion_como,
    descripcion_quiero,
    descripcion_para_que,
    gap_ids,
    catalog_kpi_ids,
    ...rest
  }) => {
    const gids = gap_ids ?? []
    const kids = catalog_kpi_ids ?? []
    let como: string
    let quiero: string
    let para: string
    if (descripcion_modo === 'estructurada') {
      como = (descripcion_como ?? '').trim()
      quiero = (descripcion_quiero ?? '').trim()
      para = (descripcion_para_que ?? '').trim()
    } else {
      const s = (descripcion_simple ?? '').trim()
      como = quiero = para = s
    }
    return {
      ...rest,
      descripcion_accion: formatDescripcionTriada(como, quiero, para),
      gap_ids: gids,
      catalog_kpi_ids: kids,
      gap_id: gids[0] ?? null,
      catalog_kpi_id: kids[0] ?? null,
    }
  }
)

/** Valores del formulario antes del transform (tres preguntas). */
export type AccionFormInput = z.input<typeof accionCreateSchema>

/** Payload tras validar (incluye `descripcion_accion` unificado). */
export type AccionCreateInput = z.output<typeof accionCreateSchema>

export const accionUpdateSchema = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD').optional(),
    titulo_accion: tituloAccionSchema.optional(),
    descripcion_accion: z
      .string()
      .min(15, 'Mínimo 15 caracteres')
      .max(1300, 'Máximo 1300 caracteres')
      .optional(),
    responsable: z.string().uuid().optional(),
    hora_limite: horaSchema.optional(),
    evidencia_esperada: z.string().min(5).max(500).optional(),
    estado: z.enum(ACTION_STATUS as unknown as [string, ...string[]]).optional(),
    prioridad: z.string().min(1, 'Prioridad obligatoria').max(100).optional(),
    kpi_afectado: z.string().uuid().nullable().optional(),
    gap_id: z.string().uuid().nullable().optional(),
    catalog_kpi_id: z.string().uuid().nullable().optional(),
    gap_ids: z.array(z.string().uuid()).max(50).optional(),
    catalog_kpi_ids: z.array(z.string().uuid()).max(50).optional(),
    okr_impactado: z.string().uuid().nullable().optional(),
    proceso: z.string().uuid().nullable().optional(),
    area: z.string().trim().nullable().optional(),
    cliente_id: z.string().uuid().nullable().optional(),
    causa_raiz: z.string().trim().nullable().optional(),
    responsable_bloqueo: z.string().uuid().nullable().optional(),
    evidencia_cargada: z.boolean().optional(),
    evidencia_adjunta: z.string().trim().nullable().optional(),
    tipo_accion: TIPO_ACCION_ENUM.optional(),
    story_points: z
      .number()
      .refine(
        (v) => v === 0 || (STORY_POINTS_OPTIONS as readonly number[]).includes(v),
        {
          message: 'Debe ser 0 o un valor Fibonacci: 1, 2, 3, 5, 8 o 13',
        }
      )
      .optional(),
    sprint_id: z.string().uuid().nullable().optional(),
  })
  .partial()
  .superRefine((value, ctx) => {
    if (value.tipo_accion === 'sprint' && !value.sprint_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sprint_id'],
        message: 'Selecciona un sprint para una accion de sprint.',
      })
    }
    if (value.tipo_accion === 'desbloqueo' && !value.responsable_bloqueo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responsable_bloqueo'],
        message: 'Selecciona quien debe desbloquear esta accion.',
      })
    }
  })

export type AccionUpdateInput = z.infer<typeof accionUpdateSchema>
