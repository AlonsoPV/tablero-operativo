import type { CreateUserInput, UpdateUserInput } from '../types/user.types'
import type { UserFormValues } from '../schemas/user.schema'
import type { AreaOption } from '../components/AreaMembershipFields'
import { resolveAreaIdsForSave } from '../components/AreaMembershipFields'

/** Payload explícito para UPDATE: siempre envía todos los campos editables. */
export function toUpdateUserInput(
  values: UserFormValues,
  catalogAreas: AreaOption[] = []
): UpdateUserInput {
  const { primaryAreaId, areaIds } = resolveAreaIdsForSave(
    catalogAreas,
    values.area ?? null,
    values.additional_area_ids ?? []
  )

  const roleFields = values.primary_role_id && values.role_ids?.length
    ? {
        role_ids: values.role_ids,
        primary_role_id: values.primary_role_id,
      }
    : {}

  return {
    nombre: values.nombre.trim(),
    rol: values.rol,
    ...roleFields,
    area: values.area ?? null,
    primary_area_id: primaryAreaId,
    area_ids: areaIds,
    activo: Boolean(values.activo),
    manager_user_id: values.manager_user_id ?? null,
  }
}

/** Payload explícito para CREATE vía invite-user. */
export function toCreateUserInput(values: UserFormValues): CreateUserInput {
  const email = values.email?.trim().toLowerCase() ?? ''
  if (!email) {
    throw new Error('Indica un correo válido para enviar la invitación.')
  }

  const roleFields = values.primary_role_id && values.role_ids?.length
    ? {
        role_ids: values.role_ids,
        primary_role_id: values.primary_role_id,
      }
    : {}

  return {
    email,
    nombre: values.nombre.trim(),
    rol: values.rol,
    ...roleFields,
    area: values.area ?? null,
    activo: Boolean(values.activo),
  }
}
