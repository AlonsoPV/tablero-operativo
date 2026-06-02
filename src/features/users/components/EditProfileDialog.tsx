import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { authService } from '@/services/auth.service'
import {
  PASSWORD_MIN_LENGTH,
  changePasswordFormSchema,
  type ChangePasswordFormValues,
} from '@/features/auth/schemas/password.schema'
import type { UserProfile } from '../types/user.types'
import { KeyRound, UserRound } from 'lucide-react'
import { toast } from 'sonner'

export type EditProfileDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserProfile
  onSaveProfile: (input: { nombre: string; area: string | null }) => Promise<void>
  isSavingProfile?: boolean
}

const NONE_AREA = '__none__'

export function EditProfileDialog({
  open,
  onOpenChange,
  user,
  onSaveProfile,
  isSavingProfile = false,
}: EditProfileDialogProps) {
  const { data: areas = [], isLoading: loadingAreas } = useAreas({ activo: true })
  const [nombre, setNombre] = useState(user.nombre)
  const [area, setArea] = useState(user.area ?? NONE_AREA)
  const [savingPassword, setSavingPassword] = useState(false)

  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  useEffect(() => {
    if (!open) return
    setNombre(user.nombre)
    setArea(user.area ?? NONE_AREA)
    passwordForm.reset()
  }, [open, user.nombre, user.area, passwordForm])

  const areaValue = area === NONE_AREA ? null : area
  const profileDirty =
    nombre.trim() !== user.nombre.trim() || (areaValue ?? null) !== (user.area ?? null)
  const nombreValid = nombre.trim().length >= 2

  const passwordValues = passwordForm.watch()
  const wantsPasswordChange = Boolean(
    passwordValues.currentPassword ||
      passwordValues.newPassword ||
      passwordValues.confirmPassword
  )

  const canSaveProfile = profileDirty && nombreValid
  const canSave = canSaveProfile || wantsPasswordChange

  const handleOpenChange = (next: boolean) => {
    if (!next && !isSavingProfile && !savingPassword) {
      passwordForm.reset()
    }
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!nombreValid) {
      toast.error('El nombre debe tener al menos 2 caracteres')
      return
    }

    let savedProfile = false
    let savedPassword = false

    if (canSaveProfile) {
      try {
        await onSaveProfile({ nombre: nombre.trim(), area: areaValue })
        savedProfile = true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No pudimos guardar el perfil')
        return
      }
    }

    if (wantsPasswordChange) {
      const valid = await passwordForm.trigger()
      if (!valid) return

      setSavingPassword(true)
      try {
        const values = passwordForm.getValues()
        await authService.changePassword(values.currentPassword, values.newPassword)
        passwordForm.reset()
        savedPassword = true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No pudimos cambiar la contraseña')
        setSavingPassword(false)
        return
      }
      setSavingPassword(false)
    }

    if (savedProfile && savedPassword) {
      toast.success('Perfil y contraseña actualizados')
    } else if (savedProfile) {
      toast.success('Perfil actualizado')
    } else if (savedPassword) {
      toast.success('Contraseña actualizada')
    } else {
      toast.info('No hay cambios por guardar')
      return
    }

    handleOpenChange(false)
  }

  const isBusy = isSavingProfile || savingPassword

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1 border-b border-border/50 px-5 py-4 text-left sm:px-6">
          <DialogTitle>Editar perfil</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed">
            Actualiza tu nombre, área y contraseña. El rol solo lo modifica un administrador.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <UserRound className="h-4 w-4 text-primary" aria-hidden />
              Datos del perfil
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-profile-nombre">Nombre para mostrar</Label>
              <Input
                id="edit-profile-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-profile-area">Área</Label>
              <Select value={area} onValueChange={setArea} disabled={loadingAreas || isBusy}>
                <SelectTrigger id="edit-profile-area">
                  <SelectValue placeholder={loadingAreas ? 'Cargando áreas…' : 'Selecciona tu área'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_AREA}>Sin área</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.nombre}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Catálogo de áreas de la organización.</p>
            </div>
          </section>

          <section className="space-y-4 border-t border-border/50 pt-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <KeyRound className="h-4 w-4 text-primary" aria-hidden />
                Contraseña
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Opcional. Déjala en blanco si no quieres cambiarla. Mínimo {PASSWORD_MIN_LENGTH}{' '}
                caracteres.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-profile-current-pw">Contraseña actual</Label>
                <Input
                  id="edit-profile-current-pw"
                  type="password"
                  autoComplete="current-password"
                  disabled={isBusy}
                  {...passwordForm.register('currentPassword')}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-profile-new-pw">Nueva contraseña</Label>
                <Input
                  id="edit-profile-new-pw"
                  type="password"
                  autoComplete="new-password"
                  disabled={isBusy}
                  {...passwordForm.register('newPassword')}
                />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-profile-confirm-pw">Confirmar nueva contraseña</Label>
                <Input
                  id="edit-profile-confirm-pw"
                  type="password"
                  autoComplete="new-password"
                  disabled={isBusy}
                  {...passwordForm.register('confirmPassword')}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 border-t border-border/50 px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isBusy}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSave || isBusy || !nombreValid}>
            {isBusy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
