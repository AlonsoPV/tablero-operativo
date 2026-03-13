import { z } from 'zod'
import { ordenField, activoField } from './common'

const labelField = z
  .string()
  .min(1, 'La etiqueta es obligatoria')
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(200, 'Máximo 200 caracteres'))

const valueField = z
  .string()
  .min(1, 'El valor es obligatorio')
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(200, 'Máximo 200 caracteres'))

export const dropdownOptionFormSchema = z.object({
  label: labelField,
  value: valueField,
  orden: ordenField,
  activo: activoField,
})

export type DropdownOptionFormValues = z.infer<typeof dropdownOptionFormSchema>
