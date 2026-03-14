import { z } from 'zod'

/** Rol y área vienen de catálogos (catalog_roles, areas); se validan como texto no vacío. */
export const userFormSchema = z.object({
  /** UUID del usuario en auth.users; obligatorio al crear perfil desde administración */
  user_id: z
    .string()
    .optional()
    .transform((s) => (s?.trim() === '' ? undefined : s?.trim()))
    .pipe(z.string().uuid('ID de usuario (Auth) no válido').optional()),
  nombre: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(100, 'El nombre no puede superar 100 caracteres')
    ),
  rol: z.string().min(1, 'Selecciona un rol'),
  area: z
    .string()
    .transform((s) => (s?.trim() === '' ? undefined : s?.trim() ?? undefined))
    .optional()
    .nullable(),
  activo: z.boolean().default(true),
  onboarding_completed: z.boolean().default(false),
})

export type UserFormValues = z.infer<typeof userFormSchema>
