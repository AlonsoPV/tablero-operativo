import { z } from 'zod'
import {
  nombreField,
  descripcionField,
  ordenField,
  activoField,
} from './common'

export const priorityFormSchema = z.object({
  nombre: nombreField,
  descripcion: descripcionField,
  orden: ordenField,
  activo: activoField,
})

export type PriorityFormValues = z.infer<typeof priorityFormSchema>
