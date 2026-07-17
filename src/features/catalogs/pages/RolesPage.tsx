import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CatalogPageHeader } from '../components/CatalogPageHeader'
import { CatalogStatusBadge } from '../components/CatalogStatusBadge'
import { CatalogFilterBar } from '../components/CatalogFilterBar'
import { CatalogTableLayout } from '../components/CatalogTableLayout'
import { CatalogRowActions } from '../components/CatalogRowActions'
import { ConfirmActivateDialog } from '../components/ConfirmActivateDialog'
import { RoleForm } from '../components/RoleForm'
import { useRoles, useCreateRole, useUpdateRole, useToggleRoleStatus, useAppModules } from '../hooks/useRoles'
import type { CatalogRole } from '../types/catalogs.types'
import type { CatalogFilter } from '../types/catalogs.types'
import type { RoleFormValues } from '../schemas/role.schema'
import { toast } from 'sonner'
import { useRouteAccess } from '@/features/auth/hooks/useRouteAccess'
import { isAppSuperAdminByAppRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'

const DEFAULT_FILTER: CatalogFilter = {}

export function RolesPage() {
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogRole | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<CatalogRole | null>(null)

  const { data: items = [], isLoading, isError, error } = useRoles(filter)
  const { data: modules = [] } = useAppModules()
  const { rol, appRole } = useRouteAccess()
  const canEdit = isSuperAdminByRole(rol) || isAppSuperAdminByAppRole(appRole)
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const toggleStatus = useToggleRoleStatus()

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_FILTER), [])

  const handleCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((row: CatalogRole) => {
    setEditing(row)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (values: RoleFormValues) => {
      if (editing) {
        updateRole.mutate(
          { id: editing.id, input: values },
          {
            onSuccess: () => {
              toast.success('Rol actualizado correctamente')
              setFormOpen(false)
              setEditing(null)
            },
            onError: (e) =>
              toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
          }
        )
      } else {
        createRole.mutate(values, {
          onSuccess: () => {
            toast.success('Rol creado correctamente')
            setFormOpen(false)
          },
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : 'Error al crear'),
        })
      }
    },
    [editing, updateRole, createRole]
  )

  const confirmToggleStatus = useCallback(() => {
    if (!confirmToggle) return
    const newActivo = !confirmToggle.activo
    toggleStatus.mutate(
      { id: confirmToggle.id, activo: newActivo },
      {
        onSuccess: () => {
          toast.success(newActivo ? 'Rol activado' : 'Rol desactivado')
          setConfirmToggle(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
      }
    )
  }, [confirmToggle, toggleStatus])

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        title="Roles"
        description="Define el nombre de cada rol y las secciones del tablero a las que puede acceder."
        onAdd={canEdit ? handleCreate : undefined}
        addLabel="Crear rol"
      />

      <CatalogFilterBar
        filter={filter}
        onFilterChange={setFilter}
        onClear={handleClearFilters}
        searchPlaceholder="Nombre o descripción..."
      />

      <CatalogTableLayout
        isLoading={isLoading}
        error={isError ? (error instanceof Error ? error : new Error('Error al cargar')) : null}
        emptyTitle="No hay roles"
        emptyDescription="Crea el primer rol o ajusta los filtros."
        itemCount={items.length}
      >
        <>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead>Secciones</TableHead>
              <TableHead className="w-[70px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.nombre}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.descripcion ?? '—'}
                </TableCell>
                <TableCell>
                  <CatalogStatusBadge activo={row.activo} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.module_keys.length} habilitadas
                </TableCell>
                <TableCell>
                  {canEdit ? <CatalogRowActions
                    item={row}
                    onEdit={handleEdit}
                    onToggleActivo={setConfirmToggle}
                    resourceLabel="rol"
                  /> : <span className="text-xs text-muted-foreground">Solo lectura</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </>
      </CatalogTableLayout>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined} className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar rol' : 'Nuevo rol'}</DialogTitle>
          </DialogHeader>
          <RoleForm
            defaultValues={
              editing
                ? {
                    nombre: editing.nombre,
                    descripcion: editing.descripcion ?? undefined,
                    activo: editing.activo,
                    module_keys: editing.module_keys,
                  }
                : undefined
            }
            onSubmit={handleFormSubmit}
            onCancel={() => setFormOpen(false)}
            isSubmitting={createRole.isPending || updateRole.isPending}
            modules={modules}
            lockName={editing?.system_key === 'super_admin'}
          />
        </DialogContent>
      </Dialog>

      <ConfirmActivateDialog
        open={!!confirmToggle}
        onOpenChange={(open) => !open && setConfirmToggle(null)}
        title={confirmToggle?.activo ? 'Desactivar rol' : 'Activar rol'}
        description={
          confirmToggle
            ? confirmToggle.activo
              ? `¿Desactivar "${confirmToggle.nombre}"?`
              : `¿Activar "${confirmToggle.nombre}"?`
            : ''
        }
        onConfirm={confirmToggleStatus}
        isActivo={confirmToggle?.activo ?? false}
        itemName={confirmToggle?.nombre ?? ''}
        isLoading={toggleStatus.isPending}
      />
    </div>
  )
}
