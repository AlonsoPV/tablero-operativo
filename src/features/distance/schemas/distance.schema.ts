/**
 * Validación Zod para el formulario de consulta de distancia.
 */

import { z } from 'zod'

const requiredTrim = (msg: string) =>
  z.string().transform((s) => (s ?? '').trim()).pipe(z.string().min(1, msg))

export const distanceFormSchema = z.object({
  origen_nombre: requiredTrim('El nombre de origen es obligatorio'),
  origen_ubicacion: requiredTrim('La ubicación de origen es obligatoria'),
  destino_nombre: requiredTrim('El nombre de destino es obligatorio'),
  destino_ubicacion: requiredTrim('La ubicación de destino es obligatoria'),
})

export type DistanceFormSchema = z.infer<typeof distanceFormSchema>
