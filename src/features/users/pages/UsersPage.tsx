import { useState, useCallback } from 'react'
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
import { UserFilters } from '../components/UserFilters'
import { UsersTable } from '../components/UsersTable'
import { UserForm } from '../components/UserForm'
import { useUsers, useUpdateUser, useToggleUserStatus } from '../hooks'
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
      // Alta: por ahora no tenemos user_id desde el cliente (Auth no expone crear usuario).
      // Dejamos el flujo listo para cuando exista invitación por email o Edge Function.
      toast.info(
        'Crear usuario estará disponible cuando se integre el flujo de invitación por email con Supabase Auth.'
      )
      setFormOpen(false)
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
            Gestiona perfiles de usuario (rol, área, activo, onboarding).
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Crear usuario
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
            <DialogTitle>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>
          <UserForm
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
            isSubmitting={updateUser.isPending}
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
