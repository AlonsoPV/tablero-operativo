/**
 * Tipos del módulo de autenticación.
 * Separa sesión Supabase, usuario Auth y perfil de negocio (usuarios).
 *
 * Invariantes:
 * - session null => user null, profile null (sesión inválida o no existe).
 * - user null => profile null.
 * - error no_profile | user_inactive => sesión válida pero problema de perfil (nunca logout automático).
 */

import type { Session, User } from '@supabase/supabase-js'
import type { Usuario } from '@/types'

/** Usuario de Supabase Auth (auth.users). */
export type AuthUser = User

/** Perfil de negocio en tabla usuarios. */
export type AuthProfile = Usuario

/** Estado de autenticación. session es la fuente de verdad de Supabase; user = session?.user. */
export interface AuthState {
  /** Sesión actual de Supabase (null = no hay sesión o no se pudo verificar). */
  session: Session | null
  /** Usuario de Supabase Auth; siempre session?.user cuando session existe. */
  user: AuthUser | null
  /** Perfil en tabla usuarios (null si no hay perfil o no hay sesión). */
  profile: AuthProfile | null
  /** true solo durante el bootstrap inicial o mientras se valida sesión por primera vez. */
  isLoading: boolean
  /** true si Supabase reporta sesión válida (session != null). No se falsea por error de perfil. */
  isAuthenticated: boolean
  /** true si hay sesión + perfil cargado + usuario activo (puede usar la app). */
  isReady: boolean
  /** Error: network/session = no sesión usable; no_profile/user_inactive = sesión OK, problema de perfil. */
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
