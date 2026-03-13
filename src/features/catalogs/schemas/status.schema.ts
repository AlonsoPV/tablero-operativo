import { z } from 'zod'
import {
  nombreField,
  descripcionField,
  ordenField,
  activoField,
} from './common'

export const statusFormSchema = z.object({
  nombre: nombreField,
  descripcion: descripcionField,
  color: z
    .string()
    .transform((s) => (s?.trim() === '' ? undefined : s?.trim()))
    .optional()
    .nullable(),
  orden: ordenField,
  es_cierre: z.boolean().default(false),
  activo: activoField,
})

export type StatusFormValues = z.infer<typeof statusFormSchema>
