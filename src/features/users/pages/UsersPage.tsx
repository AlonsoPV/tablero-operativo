import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { UserFilters } from '../components/UserFilters'
import { UsersTable } from '../components/UsersTable'
import { UserForm } from '../components/UserForm'
import { useUsers, useCreateUser, useUpdateUser, useToggleUserStatus } from '../hooks'
import type { UserProfile, UsersFilter } from '../types/user.types'
import type { UserFormValues } from '../schemas/user.schema'
import type { UpdateUserInput } from '../types/user.types'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

const DEFAULT_FILTER: UsersFilter = {}

export function UsersPage() {
  const [filter, setFilter] = useState<UsersFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<UserProfile | null>(null)

  const { data: users = [], isLoading, isError, error } = useUsers(filter)
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const toggleStatus = useToggleUserStatus()

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_FILTER), [])

  const handleCreate = () => {
    setEditingUser(null)
    setFormOpen(true)
  }

  const handleEdit = (user: UserProfile) => {
    setEditingUser(user)
    setFormOpen(true)
  }

  const handleFormSubmit = (values: UserFormValues) => {
    if (editingUser) {
      updateUser.mutate(
        { id: editingUser.id, input: values as UpdateUserInput },
        {
          onSuccess: () => {
            toast.success('Usuario actualizado correctamente')
            setFormOpen(false)
            setEditingUser(null)
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Error al actualizar')
          },
        }
      )
    } else {
      const email = typeof values.email === 'string' ? values.email.trim() : ''
      if (!email) {
        toast.error('Indica un correo electrónico válido para enviar la invitación.')
        return
      }
      createUser.mutate(
        {
          email,
          nombre: values.nombre,
          rol: values.rol,
          area: values.area ?? null,
          activo: values.activo ?? true,
          onboarding_completed: values.onboarding_completed ?? false,
        },
        {
          onSuccess: () => {
            toast.success(`Invitación enviada a ${email}`)
            setFormOpen(false)
            setEditingUser(null)
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Error al enviar la invitación')
          },
        }
      )
    }
  }

  const handleToggleStatus = (user: UserProfile) => setConfirmToggle(user)

  const confirmToggleStatus = () => {
    if (!confirmToggle) return
    const newActivo = !confirmToggle.activo
    toggleStatus.mutate(
      { id: confirmToggle.id, activo: newActivo },
      {
        onSuccess: () => {
          toast.success(
            newActivo ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente'
          )
          setConfirmToggle(null)
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Error al cambiar estatus')
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Administración de usuarios</h2>
          <p className="text-muted-foreground">
            Gestiona perfiles de usuario y envía invitaciones por correo.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Invitar usuario
        </Button>
      </div>

      <UserFilters
        filter={filter}
        onFilterChange={setFilter}
        onClear={handleClearFilters}
      />

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Error al cargar usuarios'}
        </div>
      )}

      <UsersTable
        users={users}
        onEdit={handleEdit}
        onToggleStatus={handleToggleStatus}
        isLoading={isLoading}
      />

      <Dialog open={formOpen} onOpenChange={(open) => !open && setFormOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar usuario' : 'Invitar usuario'}</DialogTitle>
            <DialogDescription className="sr-only">
              {editingUser ? 'Formulario para editar el perfil del usuario.' : 'Formulario para enviar una invitación por correo y crear el perfil del usuario.'}
            </DialogDescription>
          </DialogHeader>
          <UserForm
            key={editingUser ? editingUser.id : 'create-user'}
            defaultValues={
              editingUser
                ? {
                    nombre: editingUser.nombre,
                    rol: editingUser.rol,
                    area: editingUser.area ?? undefined,
                    activo: editingUser.activo,
                    onboarding_completed: editingUser.onboarding_completed,
                  }
                : undefined
            }
            onSubmit={handleFormSubmit}
            onCancel={() => setFormOpen(false)}
            isSubmitting={createUser.isPending || updateUser.isPending}
            isCreate={!editingUser}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmToggle} onOpenChange={() => setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.activo ? 'Desactivar usuario' : 'Activar usuario'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.activo
                ? `¿Desactivar a ${confirmToggle.nombre}? El usuario no podrá acceder hasta que se reactive.`
                : `¿Activar a ${confirmToggle?.nombre}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleStatus}
              className={confirmToggle?.activo ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {confirmToggle?.activo ? 'Desactivar' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
