/**
 * Proveedor de autenticación.
 * Centraliza sesión, perfil y validación (usuario activo).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { usuariosService } from '@/services/usuarios.service'
import type { AuthState } from '../types/auth.types'

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const INITIAL_STATE: AuthState = {
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  isReady: false,
  error: null,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>(INITIAL_STATE)
  const loadingRef = useRef(true)

  const loadAuth = useCallback(async () => {
    loadingRef.current = true
    setState((s) => ({ ...s, isLoading: true, error: null }))

    try {
      const { data } = await authService.getSession()
      const user = data?.session?.user ?? null

      if (!user) {
        setState({
          user: null,
          profile: null,
          isLoading: false,
          isAuthenticated: false,
          isReady: true,
          error: null,
        })
        return
      }

      let profile
      try {
        profile = await usuariosService.getByAuthId(user.id)
      } catch (err) {
        setState({
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
        setState({
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

      setState({
        user,
        profile,
        isLoading: false,
        isAuthenticated: true,
        isReady: true,
        error: null,
      })
    } catch {
      setState({
        user: null,
        profile: null,
        isLoading: false,
        isAuthenticated: false,
        isReady: true,
        error: {
          type: 'network',
          message: 'Error al verificar la sesión. Intenta de nuevo.',
        },
      })
    } finally {
      loadingRef.current = false
    }
  }, [])

  const logout = useCallback(async () => {
    setState(INITIAL_STATE)
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
      if (event === 'SIGNED_OUT') {
        setState(INITIAL_STATE)
        return
      }
      loadAuth()
    })
    return () => subscription.unsubscribe()
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
