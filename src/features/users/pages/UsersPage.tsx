import { useState, useCallback } from 'react'
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
import { SettingsPageHeader } from '@/components/layout/SettingsPageHeader'
import { UserFilters } from '../components/UserFilters'
import { UsersTable } from '../components/UsersTable'
import { UserEditDialog } from '../components/UserEditDialog'
import { useUsers, useCreateUser, useUpdateUser, useToggleUserStatus } from '../hooks'
import type { UserProfile, UsersFilter } from '../types/user.types'
import type { UserFormValues } from '../schemas/user.schema'
import { toCreateUserInput, toUpdateUserInput } from '../utils/userFormMappers'
import { toast } from 'sonner'
import { useAreas } from '@/features/catalogs/hooks/useAreas'

const DEFAULT_FILTER: UsersFilter = {}

export function UsersPage() {
  const [filter, setFilter] = useState<UsersFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<UserProfile | null>(null)

  const { data: users = [], isLoading, isError, error } = useUsers(filter)
  const { data: catalogAreas = [] } = useAreas({ activo: true })
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
        {
          id: editingUser.id,
          input: toUpdateUserInput(
            values,
            catalogAreas.map((a) => ({ id: a.id, nombre: a.nombre }))
          ),
        },
        {
          onSuccess: () => {
            toast.success('Cambios guardados')
            setFormOpen(false)
            setEditingUser(null)
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'No pudimos guardar los cambios. Inténtalo de nuevo.')
          },
        }
      )
    } else {
      try {
        createUser.mutate(toCreateUserInput(values), {
          onSuccess: (result) => {
            const email = values.email?.trim().toLowerCase() ?? ''
            const temp = result.temporaryPassword
            if (temp) {
              void navigator.clipboard?.writeText(temp).catch(() => undefined)
              toast.success(
                `Usuario creado: ${email}. Contraseña temporal copiada al portapapeles. Compártela por un canal seguro.`
              )
            } else {
              toast.success(
                `Usuario creado: ${email}. Asigna una contraseña desde el detalle del usuario.`
              )
            }
            setFilter(DEFAULT_FILTER)
            setFormOpen(false)
            setEditingUser(null)
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'No pudimos enviar la invitación. Inténtalo de nuevo.')
          },
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Indica un correo válido para enviar la invitación.')
      }
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
            newActivo
              ? 'Cuenta activada: ya puede entrar al tablero.'
              : 'Cuenta desactivada: no podrá entrar hasta que la reactives.'
          )
          setConfirmToggle(null)
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'No pudimos cambiar el estado. Inténtalo de nuevo.')
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Configuración"
        title="Usuarios"
        description="Invita personas por correo, revisa su ficha y ajusta rol, área o acceso."
        onAdd={handleCreate}
        addLabel="Invitar usuario"
      />

      <UserFilters
        filter={filter}
        onFilterChange={setFilter}
        onClear={handleClearFilters}
      />

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'No pudimos cargar el listado. Revisa la conexión o inténtalo de nuevo.'}
        </div>
      )}

      <UsersTable
        users={users}
        onEdit={handleEdit}
        onToggleStatus={handleToggleStatus}
        isLoading={isLoading}
      />

      <UserEditDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingUser(null)
        }}
        mode={editingUser ? 'edit' : 'create'}
        user={editingUser}
        onSubmit={handleFormSubmit}
        isSubmitting={createUser.isPending || updateUser.isPending}
      />

      <AlertDialog open={!!confirmToggle} onOpenChange={() => setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.activo
                ? `¿Desactivar a ${confirmToggle.nombre}? No podrá entrar al tablero hasta que reactives su cuenta.`
                : `¿Activar a ${confirmToggle?.nombre}? Podrá volver a entrar con su correo y contraseña.`}
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
