import { z } from 'zod'
import {
  nombreField,
  descripcionField,
  ordenField,
  activoField,
} from './common'
const KPI_UNITS = ['porcentaje', 'numero', 'dias', 'moneda', 'horas', 'cantidad'] as const
const KPI_TYPES = ['manual', 'calculado', 'informativo'] as const
const KPI_PERIODICITIES = ['diaria', 'semanal', 'mensual', 'trimestral', 'anual'] as const

const metaObjetivoField = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === '' || v == null ? null : Number(v)))
  .pipe(z.number().nullable())

export const kpiFormSchema = z.object({
  nombre: nombreField,
  descripcion: descripcionField,
  unidad: z.enum(KPI_UNITS),
  tipo: z.enum(KPI_TYPES),
  meta_objetivo: metaObjetivoField,
  periodicidad: z.enum(KPI_PERIODICITIES),
  orden: ordenField,
  activo: activoField,
})

export type KpiFormValues = z.infer<typeof kpiFormSchema>
export { KPI_UNITS, KPI_TYPES, KPI_PERIODICITIES }
