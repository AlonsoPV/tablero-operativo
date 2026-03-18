import { z } from 'zod'

const requiredTrim = (msg: string) =>
  z.string().transform((s) => (s ?? '').trim()).pipe(z.string().min(1, msg))

export const originFormSchema = z.object({
  nombre: requiredTrim('El nombre es obligatorio'),
  ubicacion: requiredTrim('La ubicación es obligatoria'),
  activo: z.boolean().default(true),
})

export type OriginFormValues = z.infer<typeof originFormSchema>
