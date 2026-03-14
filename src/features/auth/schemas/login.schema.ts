import { z } from 'zod'

export const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es obligatorio')
    .trim()
    .email('Email no válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export type LoginFormValues = z.infer<typeof loginFormSchema>
