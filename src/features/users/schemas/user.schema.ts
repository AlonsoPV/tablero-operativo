import { z } from 'zod'

const commonUserFormSchema = z.object({
  email: z
    .string()
    .optional()
    .transform((s) => {
      const trimmed = s?.trim().toLowerCase()
      return trimmed ? trimmed : undefined
    }),
  nombre: z
    .string()
    .min(1, 'Indica el nombre')
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(2, 'Al menos 2 caracteres')
        .max(100, 'Como máximo 100 caracteres')
    ),
  rol: z.string().min(1, 'Elige un rol'),
  area: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return null
      const trimmed = value.trim()
      return trimmed === '' ? null : trimmed
    })
    .nullable()
    .optional(),
  /** IDs de áreas adicionales (no incluye necesariamente la principal). */
  additional_area_ids: z.array(z.string().uuid()).optional().default([]),
  activo: z.boolean(),
  manager_user_id: z
    .union([z.string().uuid(), z.null(), z.undefined()])
    .transform((value) => (value == null || value === '' ? null : value))
    .nullable()
    .optional(),
  direct_report_ids: z.array(z.string().uuid()).optional().default([]),
})

/** Rol y área vienen de catálogos (catalog_roles, areas); se validan como texto no vacío. */
export const createUserFormSchema = commonUserFormSchema.extend({
  email: z
    .string()
    .min(1, 'Indica un correo')
    .email('Escribe un correo válido')
    .transform((s) => s.trim().toLowerCase()),
})

export const updateUserFormSchema = commonUserFormSchema

export type UserFormValues = z.infer<typeof commonUserFormSchema>
