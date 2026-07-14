import { useEffect, useMemo, useState } from 'react'
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
import {
  AreaMembershipFields,
  resolveAreaIdsForSave,
} from './AreaMembershipFields'

export type EditProfileSaveInput = {
  nombre: string
  primary_area_id: string | null
  area_ids: string[]
  area: string | null
}

export type EditProfileDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserProfile
  onSaveProfile: (input: EditProfileSaveInput) => Promise<void>
  isSavingProfile?: boolean
}

export function EditProfileDialog({
  open,
  onOpenChange,
  user,
  onSaveProfile,
  isSavingProfile = false,
}: EditProfileDialogProps) {
  const { data: areas = [], isLoading: loadingAreas } = useAreas({ activo: true })
  const [nombre, setNombre] = useState(user.nombre)
  const [nombreTouched, setNombreTouched] = useState(false)
  const [primaryArea, setPrimaryArea] = useState<string | null>(user.area)
  const [additionalAreaIds, setAdditionalAreaIds] = useState<string[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const currentAreaMissing = Boolean(
    user.area && !areas.some((catalogArea) => catalogArea.nombre === user.area)
  )

  const areaOptions = useMemo(
    () =>
      currentAreaMissing && user.area
        ? [
            {
              id: `current-${user.area}`,
              nombre: user.area,
              label: `${user.area} (actual, fuera del catalogo activo)`,
            },
            ...areas.map((catalogArea) => ({
              id: catalogArea.id,
              nombre: catalogArea.nombre,
              label: catalogArea.nombre,
            })),
          ]
        : areas.map((catalogArea) => ({
            id: catalogArea.id,
            nombre: catalogArea.nombre,
            label: catalogArea.nombre,
          })),
    [areas, currentAreaMissing, user.area]
  )

  useEffect(() => {
    if (!open) return
    setNombre(user.nombre)
    setNombreTouched(false)
    setPrimaryArea(user.area)
    const primaryId = areas.find((a) => a.nombre === user.area)?.id
    const membershipNames = user.areas ?? (user.area ? [user.area] : [])
    const extraIds = areas
      .filter((a) => membershipNames.includes(a.nombre) && a.id !== primaryId)
      .map((a) => a.id)
    setAdditionalAreaIds(extraIds)
    passwordForm.reset()
  }, [open, user.nombre, user.area, user.areas, areas, passwordForm])

  const initialExtraKey = useMemo(() => {
    const primaryId = areas.find((a) => a.nombre === user.area)?.id
    const membershipNames = user.areas ?? (user.area ? [user.area] : [])
    return areas
      .filter((a) => membershipNames.includes(a.nombre) && a.id !== primaryId)
      .map((a) => a.id)
      .sort()
      .join()
  }, [areas, user.area, user.areas])

  const profileDirty =
    nombre.trim() !== user.nombre.trim() ||
    (primaryArea ?? null) !== (user.area ?? null) ||
    additionalAreaIds.slice().sort().join() !== initialExtraKey

  const nombreValid = nombre.trim().length >= 2

  const passwordValues = passwordForm.watch()
  const wantsPasswordChange = Boolean(
    passwordValues.currentPassword ||
      passwordValues.newPassword ||
      passwordValues.confirmPassword
  )

  const canSaveProfile = profileDirty && nombreValid
  const canSave = canSaveProfile || wantsPasswordChange
  const showNombreError = !nombreValid && (nombreTouched || profileDirty)

  const handleOpenChange = (next: boolean) => {
    if (!next && !isSavingProfile && !savingPassword) {
      passwordForm.reset()
    }
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (profileDirty && !nombreValid) {
      setNombreTouched(true)
      toast.error('El nombre debe tener al menos 2 caracteres')
      return
    }

    let savedProfile = false
    let savedPassword = false

    if (canSaveProfile) {
      setSavingProfile(true)
      try {
        const { primaryAreaId, areaIds } = resolveAreaIdsForSave(
          areaOptions.filter((a) => !a.id.startsWith('current-')),
          primaryArea,
          additionalAreaIds
        )
        // Si el área principal está fuera de catálogo, conservar por nombre vía area field
        const resolvedPrimary =
          primaryAreaId ??
          (primaryArea && currentAreaMissing
            ? null
            : primaryAreaId)

        await onSaveProfile({
          nombre: nombre.trim(),
          primary_area_id: resolvedPrimary,
          area_ids: areaIds.length > 0 ? areaIds : primaryAreaId ? [primaryAreaId] : [],
          area: primaryArea,
        })
        savedProfile = true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No pudimos guardar el perfil')
        return
      } finally {
        setSavingProfile(false)
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
        if (savedProfile) {
          toast.success('Perfil actualizado')
        }
        toast.error(err instanceof Error ? err.message : 'No pudimos cambiar la contraseña')
        return
      } finally {
        setSavingPassword(false)
      }
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

  const isBusy = isSavingProfile || savingProfile || savingPassword

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        id="edit-profile-dialog"
        data-name="edit-profile-dialog"
        className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader
          id="edit-profile-header"
          data-name="edit-profile-header"
          className="space-y-1 border-b border-border/50 px-5 py-4 text-left sm:px-6"
        >
          <DialogTitle data-name="edit-profile-title">
            Editar perfil
          </DialogTitle>
          <DialogDescription
            data-name="edit-profile-description"
            className="text-left text-sm leading-relaxed"
          >
            Actualiza tu nombre, áreas y contraseña. El rol solo lo modifica un administrador.
          </DialogDescription>
        </DialogHeader>

        <div id="edit-profile-body" data-name="edit-profile-body" className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <section id="edit-profile-section-datos" data-name="edit-profile-section-datos" className="space-y-4">
            <div
              id="edit-profile-datos-heading"
              data-name="edit-profile-datos-heading"
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <UserRound className="h-4 w-4 text-primary" aria-hidden />
              Datos del perfil
            </div>
            <div id="edit-profile-nombre-field" data-name="edit-profile-nombre-field" className="space-y-2">
              <Label htmlFor="edit-profile-nombre" id="edit-profile-nombre-label" data-name="edit-profile-nombre-label">
                Nombre para mostrar
              </Label>
              <Input
                id="edit-profile-nombre"
                name="edit-profile-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onBlur={() => setNombreTouched(true)}
                placeholder="Tu nombre"
                autoComplete="name"
                disabled={isBusy}
                aria-invalid={showNombreError}
              />
              {showNombreError ? (
                <p id="edit-profile-nombre-error" data-name="edit-profile-nombre-error" className="text-sm text-destructive">
                  El nombre debe tener al menos 2 caracteres.
                </p>
              ) : null}
            </div>
            <AreaMembershipFields
              areas={areaOptions}
              primaryAreaNombre={primaryArea}
              additionalAreaIds={additionalAreaIds}
              onPrimaryChange={setPrimaryArea}
              onAdditionalChange={setAdditionalAreaIds}
              loading={loadingAreas || isBusy}
              idPrefix="edit-profile"
            />
          </section>

          <section
            id="edit-profile-section-password"
            data-name="edit-profile-section-password"
            className="space-y-4 border-t border-border/50 pt-5"
          >
            <div id="edit-profile-password-intro" data-name="edit-profile-password-intro" className="space-y-1">
              <div
                id="edit-profile-password-heading"
                data-name="edit-profile-password-heading"
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <KeyRound className="h-4 w-4 text-primary" aria-hidden />
                Contraseña
              </div>
              <p id="edit-profile-password-help" data-name="edit-profile-password-help" className="text-xs leading-relaxed text-muted-foreground">
                Opcional. Déjala en blanco si no quieres cambiarla. Mínimo {PASSWORD_MIN_LENGTH}{' '}
                caracteres.
              </p>
            </div>
            <div id="edit-profile-password-fields" data-name="edit-profile-password-fields" className="space-y-3">
              <div id="edit-profile-current-pw-field" data-name="edit-profile-current-pw-field" className="space-y-2">
                <Label htmlFor="edit-profile-current-pw" id="edit-profile-current-pw-label" data-name="edit-profile-current-pw-label">
                  Contraseña actual
                </Label>
                <Input
                  id="edit-profile-current-pw"
                  type="password"
                  autoComplete="current-password"
                  disabled={isBusy}
                  {...passwordForm.register('currentPassword')}
                  name="currentPassword"
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p id="edit-profile-current-pw-error" data-name="edit-profile-current-pw-error" className="text-sm text-destructive">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>
              <div id="edit-profile-new-pw-field" data-name="edit-profile-new-pw-field" className="space-y-2">
                <Label htmlFor="edit-profile-new-pw" id="edit-profile-new-pw-label" data-name="edit-profile-new-pw-label">
                  Nueva contraseña
                </Label>
                <Input
                  id="edit-profile-new-pw"
                  type="password"
                  autoComplete="new-password"
                  disabled={isBusy}
                  {...passwordForm.register('newPassword')}
                  name="newPassword"
                />
                {passwordForm.formState.errors.newPassword && (
                  <p id="edit-profile-new-pw-error" data-name="edit-profile-new-pw-error" className="text-sm text-destructive">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>
              <div id="edit-profile-confirm-pw-field" data-name="edit-profile-confirm-pw-field" className="space-y-2">
                <Label htmlFor="edit-profile-confirm-pw" id="edit-profile-confirm-pw-label" data-name="edit-profile-confirm-pw-label">
                  Confirmar nueva contraseña
                </Label>
                <Input
                  id="edit-profile-confirm-pw"
                  type="password"
                  autoComplete="new-password"
                  disabled={isBusy}
                  {...passwordForm.register('confirmPassword')}
                  name="confirmPassword"
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p id="edit-profile-confirm-pw-error" data-name="edit-profile-confirm-pw-error" className="text-sm text-destructive">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <DialogFooter
          id="edit-profile-footer"
          data-name="edit-profile-footer"
          className="gap-2 border-t border-border/50 px-5 py-4 sm:px-6"
        >
          <Button
            id="edit-profile-cancel"
            name="edit-profile-cancel"
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isBusy}
          >
            Cancelar
          </Button>
          <Button
            id="edit-profile-save"
            name="edit-profile-save"
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSave || isBusy}
          >
            {isBusy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
