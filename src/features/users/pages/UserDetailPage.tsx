import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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
import { UserDetailCard } from '../components/UserDetailCard'
import { PasswordManagementCard } from '../components/PasswordManagementCard'
import { UserWhatsAppCard } from '../components/UserWhatsAppCard'
import { UserEditDialog } from '../components/UserEditDialog'
import { UserHierarchySection } from '../components/UserHierarchySection'
import { useUser, useUserAuthEmail, useUpdateUser, useToggleUserStatus, useCurrentUser } from '../hooks'
import type { UserFormValues } from '../schemas/user.schema'
import { toUpdateUserInput } from '../utils/userFormMappers'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { useOrgChart } from '@/features/org-chart/hooks/useOrgChart'
import {
  canAccessAiAssistAndWhatsApp,
  canEditOrgUserHierarchy,
} from '@/features/auth/lib/permissions'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { mapManagerUpdateError } from '@/features/org-chart/utils/orgHierarchy'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { ROUTES } from '@/constants'

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [formOpen, setFormOpen] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(false)

  const { data: user, isLoading, isError, error } = useUser(id)
  const { data: authEmail } = useUserAuthEmail(user?.email ? null : user?.user_id)
  const { data: currentUser } = useCurrentUser()
  const { data: appRole } = useAppRole()
  const { data: orgUsers = [] } = useOrgChart()
  const { data: catalogAreas = [] } = useAreas({ activo: true })
  const email = user?.email ?? authEmail ?? null
  const updateUser = useUpdateUser()
  const toggleStatus = useToggleUserStatus()
  const canEditManager = canEditOrgUserHierarchy({
    actorUserId: currentUser?.id,
    targetUserId: user?.id ?? id,
    rol: currentUser?.rol,
    appRole,
    area: currentUser?.area,
    areas: currentUser?.areas,
  })
  const canManageWhatsApp = canAccessAiAssistAndWhatsApp(
    currentUser?.rol,
    appRole,
    currentUser?.area,
    currentUser?.areas
  )

  const handleFormSubmit = (values: UserFormValues) => {
    if (!id) return
    updateUser.mutate(
      {
        id,
        input: toUpdateUserInput(
          values,
          catalogAreas.map((a) => ({ id: a.id, nombre: a.nombre })),
          { includeManager: canEditManager }
        ),
      },
      {
        onSuccess: () => {
          toast.success('Cambios guardados')
          setFormOpen(false)
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Error al actualizar'
          toast.error(mapManagerUpdateError(message))
        },
      }
    )
  }

  const handleConfirmToggle = () => {
    if (!user) return
    toggleStatus.mutate(
      { id: user.id, activo: !user.activo },
      {
        onSuccess: () => {
          toast.success(
            user.activo
              ? 'Cuenta desactivada: no podrá entrar hasta que la reactives.'
              : 'Cuenta activada: ya puede entrar al tablero.'
          )
          setConfirmToggle(false)
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'No pudimos cambiar el estado. Inténtalo de nuevo.')
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div
        className="flex h-64 items-center justify-center text-sm text-muted-foreground"
        aria-busy="true"
      >
        Cargando ficha…
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to={ROUTES.SETTINGS_USERS}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Volver al listado
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Usuario no encontrado'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 w-fit px-2 text-muted-foreground" asChild>
            <Link to={ROUTES.SETTINGS_USERS}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Usuarios
            </Link>
          </Button>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ficha de persona
          </p>
        </div>
      </div>

      <UserDetailCard
        user={user}
        email={email ?? null}
        onEdit={() => setFormOpen(true)}
        onToggleStatus={() => setConfirmToggle(true)}
        isToggling={toggleStatus.isPending}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Organización</h2>
        <UserHierarchySection user={user} users={orgUsers} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Canales y acceso</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <UserWhatsAppCard
            usuarioId={user.id}
            userNombre={user.nombre}
            canManage={canManageWhatsApp}
          />
          <PasswordManagementCard
            usuarioId={user.id}
            userNombre={user.nombre}
            userEmail={email ?? null}
            hasAuthAccount={Boolean(user.user_id)}
          />
        </div>
      </div>

      <UserEditDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode="edit"
        user={user}
        onSubmit={handleFormSubmit}
        isSubmitting={updateUser.isPending}
        managerOptions={orgUsers}
        canEditManager={canEditManager}
      />

      <AlertDialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.activo
                ? `¿Desactivar a ${user.nombre}? No podrá entrar al tablero hasta que reactives su cuenta.`
                : `¿Activar a ${user.nombre}? Podrá volver a entrar con su correo y contraseña.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggle}
              className={user.activo ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {user.activo ? 'Desactivar' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
