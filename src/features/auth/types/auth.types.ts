/**
 * Tipos del módulo de autenticación.
 * Separa usuario de Supabase Auth del perfil de negocio (usuarios).
 */

import type { User } from '@supabase/supabase-js'
import type { Usuario } from '@/types'

/** Usuario de Supabase Auth (auth.users). */
export type AuthUser = User

/** Perfil de negocio en tabla usuarios. */
export type AuthProfile = Usuario

/** Estado de autenticación. */
export interface AuthState {
  /** Usuario de Supabase Auth (null si no hay sesión). */
  user: AuthUser | null
  /** Perfil en tabla usuarios (null si no hay perfil o sesión). */
  profile: AuthProfile | null
  /** Validando sesión o cargando perfil. */
  isLoading: boolean
  /** true si hay sesión válida. */
  isAuthenticated: boolean
  /** true si hay sesión + perfil cargado + usuario activo. */
  isReady: boolean
  /** Error de carga (perfil no encontrado, usuario inactivo). */
  error: AuthError | null
}

export type AuthErrorType =
  | 'no_profile'
  | 'user_inactive'
  | 'session_expired'
  | 'network'

export interface AuthError {
  type: AuthErrorType
  message: string
}
