/**
 * Proveedor de autenticación.
 * Única fuente de verdad: sesión (Supabase), perfil (usuarios), usuario activo.
 * No hay timeouts ni cierre de sesión por lógica manual; solo por signOut explícito o SIGNED_OUT de Supabase.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { usuariosService } from '@/services/usuarios.service'
import type { AuthState } from '../types/auth.types'

const __DEV__ = import.meta.env.DEV

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Estado mientras se valida la sesión al montar (bootstrap). */
const LOADING_STATE: AuthState = {
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  isReady: false,
  error: null,
}

/** Estado tras cierre de sesión (explícito o SIGNED_OUT). Persistencia: Supabase limpia; no mostrar loader. */
const SIGNED_OUT_STATE: AuthState = {
  session: null,
  user: null,
  profile: null,
  isLoading: false,
  isAuthenticated: false,
  isReady: true,
  error: null,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>(LOADING_STATE)
  const initialCheckDoneRef = useRef(false)

  const loadAuth = useCallback(async () => {
    const isInitial = !initialCheckDoneRef.current
    if (isInitial) {
      if (__DEV__) console.log('[Auth] Bootstrap: validando sesión…')
      setState((s) => ({ ...s, isLoading: true, error: null }))
    } else if (__DEV__) {
      console.log('[Auth] Refrescando estado (listener)…')
    }

    try {
      const { data } = await authService.getSession()
      const session = data?.session ?? null
      const user = session?.user ?? null

      if (!session || !user) {
        if (__DEV__) console.log('[Auth] Sesión inválida o inexistente')
        initialCheckDoneRef.current = true
        setState(SIGNED_OUT_STATE)
        return
      }

      if (__DEV__) console.log('[Auth] Sesión válida, cargando perfil…')
      let profile
      try {
        profile = await usuariosService.getByAuthId(user.id)
      } catch {
        if (__DEV__) console.warn('[Auth] Error de perfil (no_profile), sesión se mantiene')
        initialCheckDoneRef.current = true
        setState({
          session,
          user,
          profile: null,
          isLoading: false,
          isAuthenticated: true,
          isReady: true,
          error: {
            type: 'no_profile',
            message:
              'No se encontró tu perfil en el sistema. Contacta al administrador.',
          },
        })
        return
      }

      if (!profile.activo) {
        if (__DEV__) console.warn('[Auth] Usuario inactivo, sesión se mantiene')
        initialCheckDoneRef.current = true
        setState({
          session,
          user,
          profile,
          isLoading: false,
          isAuthenticated: true,
          isReady: false,
          error: {
            type: 'user_inactive',
            message: 'Tu cuenta está desactivada. Contacta al administrador.',
          },
        })
        return
      }

      if (__DEV__) console.log('[Auth] Sesión y perfil OK')
      initialCheckDoneRef.current = true
      setState({
        session,
        user,
        profile,
        isLoading: false,
        isAuthenticated: true,
        isReady: true,
        error: null,
      })
    } catch (err) {
      if (__DEV__) console.warn('[Auth] Error al verificar (red/otro); no se invalida sesión:', err)
      initialCheckDoneRef.current = true
      setState({
        session: null,
        user: null,
        profile: null,
        isLoading: false,
        isAuthenticated: false,
        isReady: true,
        error: {
          type: 'network',
          message: 'Error al verificar la sesión. Revisa la conexión y reintenta.',
        },
      })
    }
  }, [])

  const logout = useCallback(async () => {
    if (__DEV__) console.log('[Auth] Logout manual')
    setState(SIGNED_OUT_STATE)
    try {
      await authService.signOut()
    } catch {
      // Ignorar error de signOut; sesión puede estar ya invalidada
    } finally {
      queryClient.clear()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:logout'))
      }
    }
  }, [queryClient])

  useEffect(() => {
    loadAuth()
    const { data: { subscription } } = authService.onAuthStateChange((event) => {
      if (__DEV__) console.log('[Auth] onAuthStateChange:', event)
      if (event === 'SIGNED_OUT') {
        setState(SIGNED_OUT_STATE)
        return
      }
      loadAuth()
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [loadAuth])

  const value: AuthContextValue = {
    ...state,
    logout,
    refetch: loadAuth,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}
