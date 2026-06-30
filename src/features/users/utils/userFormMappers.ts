import type { CreateUserInput, UpdateUserInput } from '../types/user.types'
import type { UserFormValues } from '../schemas/user.schema'

/** Payload explícito para UPDATE: siempre envía todos los campos editables. */
export function toUpdateUserInput(values: UserFormValues): UpdateUserInput {
  return {
    nombre: values.nombre.trim(),
    rol: values.rol,
    area: values.area ?? null,
    activo: Boolean(values.activo),
  }
}

/** Payload explícito para CREATE vía invite-user. */
export function toCreateUserInput(values: UserFormValues): CreateUserInput {
  const email = values.email?.trim().toLowerCase() ?? ''
  if (!email) {
    throw new Error('Indica un correo válido para enviar la invitación.')
  }

  return {
    email,
    nombre: values.nombre.trim(),
    rol: values.rol,
    area: values.area ?? null,
    activo: Boolean(values.activo),
  }
}
