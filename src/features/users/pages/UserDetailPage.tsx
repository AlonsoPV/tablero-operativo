import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { UserForm } from '../components/UserForm'
import { UserHierarchySection } from '../components/UserHierarchySection'
import { useUser, useUserAuthEmail, useUpdateUser, useToggleUserStatus, useCurrentUser } from '../hooks'
import type { UserFormValues } from '../schemas/user.schema'
import { toUpdateUserInput } from '../utils/userFormMappers'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { useOrgChart } from '@/features/org-chart/hooks/useOrgChart'
import { canEditOrgUserHierarchy } from '@/features/auth/lib/permissions'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { mapManagerUpdateError } from '@/features/org-chart/utils/orgHierarchy'
import { useAreas } from '@/features/catalogs/hooks/useAreas'

const USER_FORM_ID = 'user-detail-form'

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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

  const handleFormSubmit = (values: UserFormValues) => {
    if (!id) return
    updateUser.mutate(
      {
        id,
        input: toUpdateUserInput(
          values,
          catalogAreas.map((a) => ({ id: a.id, nombre: a.nombre }))
        ),
      },
      {
        onSuccess: () => {
          toast.success('Usuario actualizado correctamente')
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
          toast.success(user.activo ? 'Usuario desactivado' : 'Usuario activado')
          setConfirmToggle(false)
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Error al cambiar estatus')
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Cargando usuario...
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings/users')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver al listado
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Usuario no encontrado'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings/users')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver al listado
        </Button>
      </div>

      <UserDetailCard
        user={user}
        email={email ?? null}
        onEdit={() => setFormOpen(true)}
        onToggleStatus={() => setConfirmToggle(true)}
        isToggling={toggleStatus.isPending}
      />

      <UserHierarchySection user={user} users={orgUsers} />

      <PasswordManagementCard userEmail={email ?? null} />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[min(90dvh,720px)] w-[calc(100vw-2rem)] max-w-lg grid-rows-none flex-col overflow-hidden p-0 gap-0"
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6 pr-12 text-left">
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <UserForm
              key={`edit-user-${user.id}`}
              formId={USER_FORM_ID}
              hideActions
              editingUserId={user.id}
              managerOptions={orgUsers}
              canEditManager={canEditManager}
              defaultValues={{
                nombre: user.nombre,
                rol: user.rol,
                area: user.area ?? null,
                activo: user.activo,
                manager_user_id: user.manager_user_id ?? null,
              }}
              membershipAreaNames={user.areas ?? []}
              onSubmit={handleFormSubmit}
              onCancel={() => setFormOpen(false)}
              isSubmitting={updateUser.isPending}
              isCreate={false}
            />
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={updateUser.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" form={USER_FORM_ID} disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user.activo ? 'Desactivar usuario' : 'Activar usuario'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.activo
                ? `¿Desactivar a ${user.nombre}? El usuario no podrá acceder hasta que se reactive.`
                : `¿Activar a ${user.nombre}?`}
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

