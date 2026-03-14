/**
 * Pantalla de login.
 * Si el usuario ya está autenticado y tiene perfil válido, redirige al dashboard.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_NAME, ROUTES } from '@/constants'
import { authService } from '@/services/auth.service'
import { useAuth } from '../hooks/useAuth'
import { LoginForm } from '../components/LoginForm'
import { AuthLoader } from '../components/AuthLoader'
import { toast } from 'sonner'
import type { LoginFormValues } from '../schemas/login.schema'

export function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isReady, isLoading: authLoading, profile } = useAuth()

  useEffect(() => {
    if (!authLoading && isAuthenticated && isReady && profile?.activo) {
      navigate(ROUTES.DASHBOARD, { replace: true })
    }
  }, [authLoading, isAuthenticated, isReady, profile?.activo, navigate])

  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const handleSubmit = async (values: LoginFormValues) => {
    setLoginError(null)
    setLoginLoading(true)
    try {
      await authService.signIn(values.email, values.password)
      toast.success('Sesión iniciada')
      navigate(ROUTES.DASHBOARD, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión'
      setLoginError(message)
      toast.error(message)
    } finally {
      setLoginLoading(false)
    }
  }

  if (authLoading) {
    return <AuthLoader />
  }

  if (isAuthenticated && isReady && profile?.activo) {
    return <AuthLoader />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>
            Inicia sesión para acceder al tablero
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loginError && (
            <div
              className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {loginError}
            </div>
          )}
          <LoginForm onSubmit={handleSubmit} isLoading={loginLoading} />
        </CardContent>
      </Card>
    </div>
  )
}
