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
import { CatalogPageHeader } from '@/features/catalogs/components/CatalogPageHeader'
import { CatalogStatusBadge } from '@/features/catalogs/components/CatalogStatusBadge'
import { CatalogFilterBar } from '@/features/catalogs/components/CatalogFilterBar'
import { CatalogTableLayout } from '@/features/catalogs/components/CatalogTableLayout'
import { CatalogRowActions } from '@/features/catalogs/components/CatalogRowActions'
import { ConfirmActivateDialog } from '@/features/catalogs/components/ConfirmActivateDialog'
import { DestinationForm } from '../components/DestinationForm'
import { useDestinations, useCreateDestination, useUpdateDestination, useToggleDestinationStatus } from '../hooks/useDestinations'
import type { DistanceDestination } from '../types/distance.types'
import type { DestinationFormValues } from '../schemas/destination.schema'
import type { CatalogFilter } from '@/features/catalogs/types/catalogs.types'
import { toast } from 'sonner'

const DEFAULT_FILTER: CatalogFilter = {}

export function DistanceDestinationsCatalogPage() {
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DistanceDestination | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<DistanceDestination | null>(null)

  const { data: items = [], isLoading, isError, error } = useDestinations(filter)
  const createM = useCreateDestination()
  const updateM = useUpdateDestination()
  const toggleM = useToggleDestinationStatus()

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_FILTER), [])

  const handleCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((row: DistanceDestination) => {
    setEditing(row)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (values: DestinationFormValues) => {
      if (editing) {
        updateM.mutate(
          { id: editing.id, input: values },
          {
            onSuccess: () => {
              toast.success('Destino actualizado correctamente')
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
            toast.success('Destino creado correctamente')
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
          toast.success(newActivo ? 'Destino activado' : 'Destino desactivado')
          setConfirmToggle(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
      }
    )
  }, [confirmToggle, toggleM])

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        title="Destinos (distancias)"
        description="Catálogo de destinos para el cálculo de rutas. Se usan en el tablero de distancias."
        onAdd={handleCreate}
        addLabel="Crear destino"
      />

      <CatalogFilterBar
        filter={filter}
        onFilterChange={setFilter}
        onClear={handleClearFilters}
        searchPlaceholder="Nombre o ubicación..."
      />

      <CatalogTableLayout
        isLoading={isLoading}
        error={isError ? (error instanceof Error ? error : new Error('Error al cargar')) : null}
        emptyTitle="No hay destinos"
        emptyDescription="Crea el primer destino o ajusta los filtros."
        itemCount={items.length}
      >
        <>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead className="w-[70px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.nombre}</TableCell>
                <TableCell className="max-w-[300px] truncate text-muted-foreground" title={row.ubicacion}>
                  {row.ubicacion}
                </TableCell>
                <TableCell>
                  <CatalogStatusBadge activo={row.activo} />
                </TableCell>
                <TableCell>
                  <CatalogRowActions
                    item={row}
                    onEdit={handleEdit}
                    onToggleActivo={setConfirmToggle}
                    resourceLabel="destino"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </>
      </CatalogTableLayout>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar destino' : 'Nuevo destino'}</DialogTitle>
          </DialogHeader>
          <DestinationForm
            defaultValues={
              editing
                ? { nombre: editing.nombre, ubicacion: editing.ubicacion, activo: editing.activo }
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
        title={confirmToggle?.activo ? 'Desactivar destino' : 'Activar destino'}
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
