import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ROUTES } from '@/constants'
import {
  PASSWORD_MIN_LENGTH,
  resetPasswordFormSchema,
  type ResetPasswordFormValues,
} from '@/features/auth/schemas/password.schema'
import { useAdminSetPassword } from '../hooks/useAdminSetPassword'

type Props = {
  usuarioId: string
  userNombre: string
  userEmail?: string | null
  hasAuthAccount: boolean
}

/**
 * Admin: asigna contraseña en Auth (no se guarda en el directorio).
 * El enlace de recuperación sigue disponible como alternativa.
 */
export function PasswordManagementCard({
  usuarioId,
  userNombre,
  userEmail,
  hasAuthAccount,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingPassword, setPendingPassword] = useState<string | null>(null)
  const setPassword = useAdminSetPassword()

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const forgotHref =
    userEmail?.trim() != null && userEmail.trim() !== ''
      ? `${ROUTES.FORGOT_PASSWORD}?email=${encodeURIComponent(userEmail.trim())}`
      : ROUTES.FORGOT_PASSWORD

  const isBusy = setPassword.isPending
  const fieldsDisabled = isBusy || !hasAuthAccount

  const onValid = (values: ResetPasswordFormValues) => {
    setPendingPassword(values.password)
    setConfirmOpen(true)
  }

  const handleConfirm = () => {
    if (!pendingPassword) return
    setPassword.mutate(
      { usuarioId, password: pendingPassword },
      {
        onSuccess: () => {
          toast.success(`Contraseña actualizada para ${userNombre}`)
          form.reset({ password: '', confirm: '' })
          setPendingPassword(null)
          setConfirmOpen(false)
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'No pudimos actualizar la contraseña'
          toast.error(message)
          setConfirmOpen(false)
        },
      }
    )
  }

  return (
    <Card id="password-management-card" data-name="password-management-card" className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden />
          Contraseña de acceso
        </CardTitle>
        <CardDescription>
          Define una contraseña nueva para esta persona. Compártela por un canal seguro; no se envía
          por correo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasAuthAccount ? (
          <p
            id="password-management-no-auth"
            data-name="password-management-no-auth"
            className="text-sm text-muted-foreground"
          >
            Esta persona no tiene cuenta de acceso. Invítala de nuevo antes de asignar una
            contraseña.
          </p>
        ) : null}

        <form
          id="password-management-form"
          data-name="password-management-form"
          className="space-y-3"
          onSubmit={form.handleSubmit(onValid)}
        >
          <div className="space-y-2">
            <Label htmlFor="admin-set-password" id="admin-set-password-label">
              Nueva contraseña
            </Label>
            <Input
              id="admin-set-password"
              type="password"
              autoComplete="new-password"
              disabled={fieldsDisabled}
              {...form.register('password')}
            />
            {form.formState.errors.password ? (
              <p id="admin-set-password-error" className="text-sm text-destructive">
                {form.formState.errors.password.message}
              </p>
            ) : (
              <p id="admin-set-password-help" className="text-xs text-muted-foreground">
                Mínimo {PASSWORD_MIN_LENGTH} caracteres.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-set-password-confirm" id="admin-set-password-confirm-label">
              Confirmar contraseña
            </Label>
            <Input
              id="admin-set-password-confirm"
              type="password"
              autoComplete="new-password"
              disabled={fieldsDisabled}
              {...form.register('confirm')}
            />
            {form.formState.errors.confirm ? (
              <p id="admin-set-password-confirm-error" className="text-sm text-destructive">
                {form.formState.errors.confirm.message}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={fieldsDisabled} className="w-full sm:w-auto">
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              'Guardar contraseña'
            )}
          </Button>
        </form>

        <div
          id="password-management-recovery"
          data-name="password-management-recovery"
          className="space-y-2 border-t border-border/50 pt-4"
        >
          <p className="text-sm text-muted-foreground">
            Si prefieres que la persona elija su contraseña, abre el flujo de recuperación con su
            correo.
          </p>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to={forgotHref} target="_blank" rel="noopener noreferrer">
              Abrir recuperación de contraseña
            </Link>
          </Button>
        </div>
      </CardContent>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isBusy) return
          setConfirmOpen(open)
          if (!open) setPendingPassword(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Asignar esta contraseña?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a cambiar la contraseña de {userNombre}. Compártela por un canal seguro; no queda
              guardada en el directorio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleConfirm()
              }}
              disabled={isBusy}
            >
              {isBusy ? 'Guardando…' : 'Asignar contraseña'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
