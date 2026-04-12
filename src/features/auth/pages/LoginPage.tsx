/**
 * Pantalla de login.
 * Si el usuario ya está autenticado y tiene perfil válido, redirige al dashboard.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import { APP_NAME, ROUTES } from '@/constants'
import { authService } from '@/services/auth.service'
import { useAuth } from '../hooks/useAuth'
import { LoginForm } from '../components/LoginForm'
import { AuthLoader } from '../components/AuthLoader'
import { toast } from 'sonner'
import type { LoginFormValues } from '../schemas/login.schema'

export function LoginPage() {
  const navigate = useNavigate()
  const {
    status,
    authLoading,
    sessionStatus,
    profileStatus,
    isAuthenticated,
    isReady,
    profile,
    error,
    logout,
  } = useAuth()

  const pendingLoginResolutionRef = useRef(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated && isReady && profile?.activo) {
      navigate(ROUTES.DASHBOARD, { replace: true })
    }
  }, [authLoading, isAuthenticated, isReady, profile?.activo, navigate])

  useEffect(() => {
    if (!pendingLoginResolutionRef.current || authLoading) return

    if (sessionStatus !== 'authenticated') return

    if (profileStatus === 'loaded' && profile?.activo) {
      pendingLoginResolutionRef.current = false
      setLoginLoading(false)
      toast.success('Sesión iniciada')
      navigate(ROUTES.DASHBOARD, { replace: true })
      return
    }

    if (profileStatus === 'no_profile' || profileStatus === 'inactive') {
      pendingLoginResolutionRef.current = false
      setLoginLoading(false)
      setLoginError(error?.message ?? 'No pudimos completar tu acceso.')
      void logout()
      return
    }

    if (profileStatus === 'timeout' || profileStatus === 'network_error') {
      pendingLoginResolutionRef.current = false
      setLoginLoading(false)
      setLoginError(error?.message ?? 'No pudimos cargar tu perfil.')
    }
  }, [authLoading, sessionStatus, profileStatus, profile?.activo, error?.message, logout, navigate])

  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && status === 'signed_out' && error?.type === 'session_expired') {
      setLoginError(error.message)
    }
  }, [authLoading, status, error])

  const handleSubmit = async (values: LoginFormValues) => {
    setLoginError(null)
    setLoginLoading(true)
    try {
      await authService.signIn(values.email, values.password)
      pendingLoginResolutionRef.current = true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos iniciar sesión. Inténtalo de nuevo en un momento.'
      setLoginError(message)
      setLoginLoading(false)
    }
  }

  if (authLoading) {
    return <AuthLoader message="Comprobando tu sesión…" />
  }

  if (sessionStatus === 'authenticated' && (profileStatus === 'loading' || (isReady && profile?.activo))) {
    return <AuthLoader message={profileStatus === 'loading' ? 'Cargando tu perfil…' : 'Redirigiendo…'} />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/50 to-muted/30 p-4">
      <Card className="w-full max-w-md border-border/60 shadow-sm">
        <CardHeader className="space-y-2 pb-4 text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">{APP_NAME}</CardTitle>
          <CardDescription className="text-base">
            Usa el correo y la contraseña que te dieron para esta plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loginError && (
            <div
              className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="leading-snug">{loginError}</p>
            </div>
          )}
          <LoginForm onSubmit={handleSubmit} isLoading={loginLoading} />
        </CardContent>
      </Card>
    </div>
  )
}
