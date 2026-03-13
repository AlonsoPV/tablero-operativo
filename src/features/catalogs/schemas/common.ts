/**
 * Fragmentos Zod reutilizables para formularios de catálogos.
 * Garantiza consistencia entre tipos (catalogs.types) y validación.
 */

import { z } from 'zod'
import { VALIDATION, LIMITS } from '../constants/validation'

/** Campo nombre: obligatorio, trim, longitud 2-100 */
export const nombreField = z
  .string()
  .min(1, VALIDATION.nombreRequired)
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(LIMITS.nombreMinLength, VALIDATION.nombreMin)
      .max(LIMITS.nombreMaxLength, VALIDATION.nombreMax)
  )

/** Campo descripción: opcional, trim a undefined si vacío */
export const descripcionField = z
  .string()
  .transform((s) => (s?.trim() === '' ? undefined : s?.trim()))
  .optional()
  .nullable()

/** Campo activo: por defecto true */
export const activoField = z.boolean().default(true)

/** Orden numérico entero ≥ 0 */
export const ordenField = z.coerce
  .number()
  .int()
  .min(LIMITS.ordenMin, VALIDATION.ordenMin)

/** Schema base para entidades con nombre + descripcion + activo (Roles, Áreas, etc.) */
export const catalogNombreDescripcionActivoSchema = z.object({
  nombre: nombreField,
  descripcion: descripcionField,
  activo: activoField,
})

export type CatalogNombreDescripcionActivo = z.infer<
  typeof catalogNombreDescripcionActivoSchema
>
