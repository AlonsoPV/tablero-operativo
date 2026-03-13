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
import { StatusForm } from '../components/StatusForm'
import { useStatuses, useCreateStatus, useUpdateStatus, useToggleStatusStatus } from '../hooks/useStatuses'
import type { Status } from '../types/catalogs.types'
import type { CatalogFilter } from '../types/catalogs.types'
import type { StatusFormValues } from '../schemas/status.schema'
import { toast } from 'sonner'

const DEFAULT_FILTER: CatalogFilter = {}

export function StatusesPage() {
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Status | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<Status | null>(null)

  const { data: items = [], isLoading, isError, error } = useStatuses(filter)
  const createM = useCreateStatus()
  const updateM = useUpdateStatus()
  const toggleM = useToggleStatusStatus()

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_FILTER), [])

  const handleCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((row: Status) => {
    setEditing(row)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (values: StatusFormValues) => {
      if (editing) {
        updateM.mutate(
          { id: editing.id, input: values },
          {
            onSuccess: () => {
              toast.success('Estatus actualizado correctamente')
              setFormOpen(false)
              setEditing(null)
            },
            onError: (e) =>
              toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
          }
        )
      } else {
        createM.mutate(values, {
          onSuccess: () => {
            toast.success('Estatus creado correctamente')
            setFormOpen(false)
          },
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : 'Error al crear'),
        })
      }
    },
    [editing, updateM, createM]
  )

  const confirmToggleStatus = useCallback(() => {
    if (!confirmToggle) return
    const newActivo = !confirmToggle.activo
    toggleM.mutate(
      { id: confirmToggle.id, activo: newActivo },
      {
        onSuccess: () => {
          toast.success(newActivo ? 'Estatus activado' : 'Estatus desactivado')
          setConfirmToggle(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
      }
    )
  }, [confirmToggle, toggleM])

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        title="Estatus"
        description="Estatus operativos con orden, color y cierre."
        onAdd={handleCreate}
        addLabel="Crear estatus"
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
        emptyTitle="No hay estatus"
        emptyDescription="Crea el primer estatus o ajusta los filtros."
        itemCount={items.length}
      >
        <>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Cierre</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead className="w-[70px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.nombre}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    {row.color && (
                      <span
                        className="h-4 w-4 rounded border bg-current"
                        style={{ backgroundColor: row.color }}
                        aria-hidden
                      />
                    )}
                    <span className="text-muted-foreground">{row.color ?? '—'}</span>
                  </span>
                </TableCell>
                <TableCell>{row.orden}</TableCell>
                <TableCell>{row.es_cierre ? 'Sí' : 'No'}</TableCell>
                <TableCell>
                  <CatalogStatusBadge activo={row.activo} />
                </TableCell>
                <TableCell>
                  <CatalogRowActions
                    item={row}
                    onEdit={handleEdit}
                    onToggleActivo={setConfirmToggle}
                    resourceLabel="estatus"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </>
      </CatalogTableLayout>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar estatus' : 'Nuevo estatus'}</DialogTitle>
          </DialogHeader>
          <StatusForm
            defaultValues={
              editing
                ? {
                    nombre: editing.nombre,
                    descripcion: editing.descripcion ?? undefined,
                    color: editing.color ?? undefined,
                    orden: editing.orden,
                    es_cierre: editing.es_cierre,
                    activo: editing.activo,
                  }
                : undefined
            }
            onSubmit={handleFormSubmit}
            onCancel={() => setFormOpen(false)}
            isSubmitting={createM.isPending || updateM.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmActivateDialog
        open={!!confirmToggle}
        onOpenChange={(open) => !open && setConfirmToggle(null)}
        title={confirmToggle?.activo ? 'Desactivar estatus' : 'Activar estatus'}
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
        isLoading={toggleM.isPending}
      />
    </div>
  )
}
