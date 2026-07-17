import { z } from 'zod'
import { catalogNombreDescripcionActivoSchema } from './common'

/** Formulario de rol; valores alineados con CreateRoleInput / UpdateRoleInput */
export const roleFormSchema = catalogNombreDescripcionActivoSchema.extend({
  module_keys: z.array(z.string()).default([]),
})

export type RoleFormValues = z.infer<typeof roleFormSchema>
