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
  color: z.enum(['verde', 'amarillo', 'rojo'], {
    required_error: 'Color obligatorio',
    invalid_type_error: 'Color obligatorio',
  }),
  orden: ordenField,
  activo: activoField,
})

export type PriorityFormValues = z.infer<typeof priorityFormSchema>
