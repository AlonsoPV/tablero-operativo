import { z } from 'zod'
import {
  nombreField,
  descripcionField,
  activoField,
} from './common'
import { VALIDATION, LIMITS } from '../constants/validation'

const keyField = z
  .string()
  .min(1, VALIDATION.keyRequired)
  .transform((s) => s.trim())
  .pipe(
    z.string().min(1, VALIDATION.keyRequired).max(LIMITS.keyMaxLength, VALIDATION.keyMax)
  )

export const dropdownCatalogFormSchema = z.object({
  key: keyField,
  nombre: nombreField,
  descripcion: descripcionField,
  activo: activoField,
})

export type DropdownCatalogFormValues = z.infer<typeof dropdownCatalogFormSchema>
