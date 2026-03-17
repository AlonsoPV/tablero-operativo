/**
 * Protege rutas que requieren autenticación.
 * - Bootstrap (authLoading): solo loader; nunca redirige.
 * - Sesión inválida (no Supabase session): redirige a login una sola vez.
 * - Error de perfil (no_profile / user_inactive): pantalla específica; no redirige por sesión.
 * - Error de red: pantalla Reintentar; no se asume sesión inválida.
 */

import { useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { ROUTES } from '@/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAppStore } from '@/store'
import { AuthLoader } from '@/features/auth/components/AuthLoader'
import { Button } from '@/components/ui/button'

export function ProtectedRoute() {
  const navigate = useNavigate()
  const resetOnLogout = useAppStore((s) => s.resetOnLogout)
  const hasRedirectedRef = useRef(false)
  const {
    isLoading: authLoading,
    isAuthenticated,
    error,
    logout,
    refetch,
  } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated) {
      hasRedirectedRef.current = false
      return
    }
    if (error?.type === 'network') return
    if (!hasRedirectedRef.current) {
      hasRedirectedRef.current = true
      navigate(ROUTES.LOGIN, { replace: true })
    }
  }, [authLoading, isAuthenticated, error?.type, navigate])

  if (authLoading) {
    return <AuthLoader />
  }

  const isProfileError = isAuthenticated && error && (error.type === 'no_profile' || error.type === 'user_inactive')
  if (isProfileError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <h2 className="mb-2 font-semibold text-destructive">
            {error!.type === 'user_inactive' ? 'Cuenta desactivada' : 'Sin perfil'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{error!.message}</p>
          <button
            type="button"
            onClick={() => {
              resetOnLogout()
              logout().then(() => navigate(ROUTES.LOGIN))
            }}
            className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated && error?.type === 'network') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <div className="max-w-md rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center">
          <h2 className="mb-2 font-semibold text-amber-700 dark:text-amber-400">
            Error de conexión
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
          <Button onClick={() => refetch()}>Reintentar</Button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthLoader />
  }

  return <Outlet />
}
