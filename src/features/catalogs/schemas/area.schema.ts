import type { z } from 'zod'
import { catalogNombreDescripcionActivoSchema } from './common'

/** Formulario de área; valores alineados con CreateAreaInput / UpdateAreaInput */
export const areaFormSchema = catalogNombreDescripcionActivoSchema

export type AreaFormValues = z.infer<typeof areaFormSchema>
