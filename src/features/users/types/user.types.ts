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
  /** Correo de auth.users; se rellena en listados de administración. */
  email?: string | null
  rol: string
  role_ids?: string[]
  role_names?: string[]
  primary_role_id?: string | null
  /** Área principal (usuarios.area). */
  area: string | null
  /** Todas las áreas (principal + adicionales). */
  areas?: string[]
  activo: boolean
  manager_user_id?: string | null
  created_at: string
  updated_at: string
}

/** Payload para invitar usuario por correo y crear el perfil automáticamente. */
export interface CreateUserInput {
  email: string
  nombre: string
  rol: string
  role_ids?: string[]
  primary_role_id?: string | null
  area?: string | null
  /** IDs de áreas adicionales (además del área principal por nombre). */
  area_ids?: string[]
  primary_area_id?: string | null
  activo?: boolean
}

/** Payload para actualizar usuario (parcial). */
export interface UpdateUserInput {
  nombre?: string
  rol?: string
  role_ids?: string[]
  primary_role_id?: string | null
  area?: string | null
  primary_area_id?: string | null
  area_ids?: string[]
  activo?: boolean
  manager_user_id?: string | null
  /** IDs de usuarios que reportan a este perfil. */
  direct_report_ids?: string[]
}

/** Filtros del listado de usuarios. */
export interface UsersFilter {
  search?: string
  rol?: string | null
  area?: string | null
  activo?: boolean | null
}

/** Opciones de paginación (preparado para fase futura). */
export interface UsersPagination {
  page: number
  pageSize: number
}
