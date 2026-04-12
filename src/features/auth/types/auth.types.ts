/**
 * Tipos del módulo de autenticación.
 * Separa sesión Supabase, usuario Auth y perfil de negocio (usuarios).
 *
 * Invariantes:
 * - session null => user null, profile null (sesión inválida o no existe).
 * - user null => profile null.
 * - error no_profile | user_inactive => sesión válida pero problema de perfil (nunca logout automático).
 * - error session_expired => Supabase reportó token inválido; se fuerza limpieza local y re-login.
 */

import type { Session, User } from '@supabase/supabase-js'
import type { Usuario } from '@/types'

/** Usuario de Supabase Auth (auth.users). */
export type AuthUser = User

/** Perfil de negocio en tabla usuarios. */
export type AuthProfile = Usuario

/** Estado de la sesión Supabase, separado del estado del perfil. */
export type AuthSessionStatus = 'loading' | 'authenticated' | 'signed_out'

/** Estado del perfil de negocio (tabla `usuarios`). */
export type AuthProfileStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'no_profile'
  | 'inactive'
  | 'network_error'
  | 'timeout'

/** Estado combinado de alto nivel para consumidores legados o atajos de UI. */
export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'signed_out'
  | 'profile_timeout'
  | 'profile_network_error'
  | 'no_profile'
  | 'user_inactive'

export type AuthErrorType =
  | 'no_profile'
  | 'user_inactive'
  | 'session_expired'
  | 'network'
  | 'timeout'

export interface AuthError {
  type: AuthErrorType
  message: string
}

/** Estado de autenticación. session es la fuente de verdad de Supabase; user = session?.user. */
export interface AuthState {
  /** Estado combinado derivado de sessionStatus + profileStatus. */
  status: AuthStatus
  /** true solo mientras se resuelve la sesión inicial o un refetch explícito. */
  authLoading: boolean
  /** true cuando la sesión ya quedó resuelta a un estado visible. */
  authResolved: boolean
  /** Sesión Supabase separada del perfil. */
  sessionStatus: AuthSessionStatus
  /** Perfil de negocio separado de la sesión. */
  profileStatus: AuthProfileStatus
  /** Alias legado de `authLoading`. */
  isLoading: boolean
  /** Sesión actual de Supabase (null = no hay sesión o ya se limpió). */
  session: Session | null
  /** Usuario de Supabase Auth; siempre session?.user cuando session existe. */
  user: AuthUser | null
  /** Perfil en tabla usuarios (null si no hay perfil o no hay sesión). */
  profile: AuthProfile | null
  /** true si Supabase reporta sesión válida (session != null). No se falsea por error de perfil. */
  isAuthenticated: boolean
  /** true solo si hay sesión + perfil cargado + usuario activo (puede usar la app). */
  isReady: boolean
  /** Error visible del flujo de sesión o perfil. */
  error: AuthError | null
}

/** Resultado de `refetch` / `loadAuth` para decidir navegación o mensajes en login. */
export interface LoadAuthResult {
  /** true solo si hay sesión, perfil cargado y usuario activo. */
  canEnterApp: boolean
  status: AuthStatus
  sessionStatus: AuthSessionStatus
  profileStatus: AuthProfileStatus
  error: AuthError | null
}
