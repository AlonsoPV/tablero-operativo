/**
 * Feature: Administración de usuarios (admin).
 * Listado, filtros, alta/edición de perfil, detalle, activar/desactivar.
 * Gestión de contraseña: placeholder para fase 2 (Supabase Auth).
 */

export { UsersPage } from './pages/UsersPage'
export { UserDetailPage } from './pages/UserDetailPage'
export { useUsers, useUser, useUpdateUser, useToggleUserStatus, useCreateUser } from './hooks'
export type { UserProfile, CreateUserInput, UpdateUserInput, UsersFilter } from './types/user.types'
