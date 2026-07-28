/**
 * Establecer nueva contraseña tras hacer clic en el enlace del correo.
 * Supabase redirige aquí con hash/query; el cliente recupera la sesión del enlace (detectSessionInUrl).
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROUTES, getRuntimeAppBaseUrl } from '@/constants'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  PASSWORD_MIN_LENGTH,
  resetPasswordFormSchema,
  type ResetPasswordFormValues,
} from '../schemas/password.schema'

type RecoveryPhase = 'checking' | 'ready' | 'invalid'

/**
 * Tope de espera solo para mostrar UI (sesión recovery en URL a veces llega lento).
 * No invalida el enlace de Supabase: si el token es válido y tarda más, el usuario puede recargar la página.
 */
const MAX_WAIT_MS = 12_000
const POLL_MS = 400

export function ResetPasswordPage() {
  const [phase, setPhase] = useState<RecoveryPhase>('checking')
  const [invalidReason, setInvalidReason] = useState<string | null>(null)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirm: '' },
  })

  useEffect(() => {
    let cancelled = false
    let intervalId = 0
    const started = Date.now()

    const stopPolling = () => {
      if (intervalId) window.clearInterval(intervalId)
    }

    const markReady = () => {
      if (cancelled) return
      stopPolling()
      setPhase('ready')
    }

    const markInvalid = (message?: string) => {
      if (cancelled) return
      stopPolling()
      setInvalidReason(message ?? null)
      setPhase('invalid')
    }

    const tick = () => {
      void supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return
        if (data.session) {
          markReady()
          return
        }
        if (Date.now() - started >= MAX_WAIT_MS) {
          markInvalid()
        }
      })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!cancelled && (event === 'PASSWORD_RECOVERY' || session)) markReady()
    })

    const initializeRecoverySession = async () => {
      const currentUrl = new URL(window.location.href)
      const code = currentUrl.searchParams.get('code')
      const queryError = currentUrl.searchParams.get('error_description') || currentUrl.searchParams.get('error')
      const hash = new URLSearchParams(currentUrl.hash.replace(/^#/, ''))
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const hashError = hash.get('error_description') || hash.get('error')

      if (queryError || hashError) {
        markInvalid(queryError ?? hashError ?? undefined)
        return
      }

      const { data: existingSession } = await supabase.auth.getSession()
      if (cancelled) return
      if (existingSession.session) {
        markReady()
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (error) {
          markInvalid(error.message)
          return
        }
        markReady()
        return
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (cancelled) return
        if (error) {
          markInvalid(error.message)
          return
        }
        markReady()
        return
      }

      intervalId = window.setInterval(tick, POLL_MS)
      tick()
    }

    void initializeRecoverySession()

    return () => {
      cancelled = true
      stopPolling()
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = form.handleSubmit(async ({ password }) => {
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Contraseña guardada. Inicia sesión con la nueva.')
      await supabase.auth.signOut()
      window.location.assign(getRuntimeAppBaseUrl())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No pudimos guardar la contraseña. Inténtalo de nuevo.')
    }
  })

  if (phase === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-muted/50 to-muted/30 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <div className="max-w-sm space-y-1 text-center">
          <p className="text-sm font-medium text-foreground">Validando tu enlace…</p>
          <p className="text-xs text-muted-foreground">
            Puede tardar unos segundos. Si no avanza, vuelve a pedir un enlace desde la pantalla de acceso.
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md border-border/60 shadow-sm">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl font-semibold">Enlace caducado o ya usado</CardTitle>
            <CardDescription className="text-base">
              Pide un enlace nuevo desde la pantalla de acceso; llegará a tu correo en pocos minutos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {invalidReason ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {invalidReason}
              </p>
            ) : null}
            <Button asChild>
              <Link to={ROUTES.FORGOT_PASSWORD}>Pedir otro enlace</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={ROUTES.LOGIN}>Volver al inicio de sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/50 to-muted/30 p-4">
      <Card className="w-full max-w-md border-border/60 shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-semibold">Nueva contraseña</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Elige una contraseña que solo tú conozcas. Más adelante podrás cambiarla desde tu perfil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">Nueva contraseña</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={form.formState.isSubmitting}
                minLength={PASSWORD_MIN_LENGTH}
                {...form.register('password')}
                className={form.formState.errors.password ? 'border-destructive' : ''}
              />
              {form.formState.errors.password ? (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Mínimo {PASSWORD_MIN_LENGTH} caracteres</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm">Confirmar contraseña</Label>
              <Input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={form.formState.isSubmitting}
                {...form.register('confirm')}
                className={form.formState.errors.confirm ? 'border-destructive' : ''}
              />
              {form.formState.errors.confirm && (
                <p className="text-sm text-destructive">{form.formState.errors.confirm.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Guardando…' : 'Guardar e ir al inicio de sesión'}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            ¿No pediste este cambio?{' '}
            <Link to={ROUTES.LOGIN} className="font-medium text-primary underline-offset-4 hover:underline">
              Volver al inicio de sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
