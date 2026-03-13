import type { z } from 'zod'
import { catalogNombreDescripcionActivoSchema } from './common'

/** Formulario de rol; valores alineados con CreateRoleInput / UpdateRoleInput */
export const roleFormSchema = catalogNombreDescripcionActivoSchema

export type RoleFormValues = z.infer<typeof roleFormSchema>
