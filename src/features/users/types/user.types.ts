/**
 * Tipos del módulo de administración de usuarios.
 * Alineados con tabla usuarios (perfil extendido de auth.users).
 * rol y area conectados con catálogos (catalog_roles.nombre, areas.nombre).
 */

/** Perfil de usuario (tabla usuarios). No incluye contraseña. */
export interface UserProfile {
  id: string
  user_id: string
  nombre: string
  rol: string
  area: string | null
  activo: boolean
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

/** Payload para invitar usuario por correo y crear el perfil automáticamente. */
export interface CreateUserInput {
  email: string
  nombre: string
  rol: string
  area?: string | null
  activo?: boolean
  onboarding_completed?: boolean
}

/** Payload para actualizar usuario (parcial). */
export interface UpdateUserInput {
  nombre?: string
  rol?: string
  area?: string | null
  activo?: boolean
  onboarding_completed?: boolean
}

/** Filtros del listado de usuarios. */
export interface UsersFilter {
  search?: string
  rol?: string | null
  area?: string | null
  activo?: boolean | null
  onboarding_completed?: boolean | null
}

/** Opciones de paginación (preparado para fase futura). */
export interface UsersPagination {
  page: number
  pageSize: number
}
