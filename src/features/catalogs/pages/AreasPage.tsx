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
import { AreaForm } from '../components/AreaForm'
import { useAreas, useCreateArea, useUpdateArea, useToggleAreaStatus } from '../hooks/useAreas'
import type { Area } from '../types/catalogs.types'
import type { CatalogFilter } from '../types/catalogs.types'
import type { AreaFormValues } from '../schemas/area.schema'
import { toast } from 'sonner'

const DEFAULT_FILTER: CatalogFilter = {}

export function CatalogAreasPage() {
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Area | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<Area | null>(null)

  const { data: items = [], isLoading, isError, error } = useAreas(filter)
  const createM = useCreateArea()
  const updateM = useUpdateArea()
  const toggleM = useToggleAreaStatus()

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_FILTER), [])

  const handleCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((row: Area) => {
    setEditing(row)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (values: AreaFormValues) => {
      if (editing) {
        updateM.mutate(
          { id: editing.id, input: values },
          {
            onSuccess: () => {
              toast.success('Área actualizada correctamente')
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
            toast.success('Área creada correctamente')
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
          toast.success(newActivo ? 'Área activada' : 'Área desactivada')
          setConfirmToggle(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
      }
    )
  }, [confirmToggle, toggleM])

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        title="Áreas"
        description="Departamentos o áreas para usuarios, filtros y reportes."
        onAdd={handleCreate}
        addLabel="Crear área"
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
        emptyTitle="No hay áreas"
        emptyDescription="Crea la primera área o ajusta los filtros."
        itemCount={items.length}
      >
        <>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Estatus</TableHead>
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
                <TableCell>
                  <CatalogRowActions
                    item={row}
                    onEdit={handleEdit}
                    onToggleActivo={setConfirmToggle}
                    resourceLabel="área"
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
            <DialogTitle>{editing ? 'Editar área' : 'Nueva área'}</DialogTitle>
          </DialogHeader>
          <AreaForm
            defaultValues={
              editing
                ? {
                    nombre: editing.nombre,
                    descripcion: editing.descripcion ?? undefined,
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
        title={confirmToggle?.activo ? 'Desactivar área' : 'Activar área'}
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
