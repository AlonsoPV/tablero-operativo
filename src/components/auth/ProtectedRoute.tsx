/**
 * Protege rutas que requieren autenticación.
 * Valida sesión, perfil y usuario activo.
 */

import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { ROUTES } from '@/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAppStore } from '@/store'
import { AuthLoader } from '@/features/auth/components/AuthLoader'

export function ProtectedRoute() {
  const navigate = useNavigate()
  const resetOnLogout = useAppStore((s) => s.resetOnLogout)
  const {
    isLoading,
    isAuthenticated,
    isReady,
    error,
    logout,
  } = useAuth()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      navigate(ROUTES.LOGIN, { replace: true })
      return
    }

    if (!isReady) {
      if (error?.type === 'no_profile' || error?.type === 'user_inactive') {
        return
      }
      navigate(ROUTES.LOGIN, { replace: true })
    }
  }, [isLoading, isAuthenticated, isReady, error, navigate])

  if (isLoading) {
    return <AuthLoader />
  }

  if (!isAuthenticated) {
    return <AuthLoader />
  }

  if (!isReady && error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <h2 className="mb-2 font-semibold text-destructive">
            {error.type === 'user_inactive' ? 'Cuenta desactivada' : 'Sin perfil'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
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

  return <Outlet />
}
