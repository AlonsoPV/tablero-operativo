import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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
import { DropdownCatalogForm } from '../components/DropdownCatalogForm'
import { useDropdownCatalogs, useCreateDropdownCatalog, useUpdateDropdownCatalog, useToggleDropdownCatalogStatus } from '../hooks/useDropdownCatalogs'
import type { DropdownCatalog } from '../types/catalogs.types'
import type { CatalogFilter } from '../types/catalogs.types'
import type { DropdownCatalogFormValues } from '../schemas/dropdownCatalog.schema'
import { ROUTES } from '@/constants'
import { toast } from 'sonner'
import { List } from 'lucide-react'

const DEFAULT_FILTER: CatalogFilter = {}

export function DropdownCatalogsPage() {
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DropdownCatalog | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<DropdownCatalog | null>(null)

  const { data: items = [], isLoading, isError, error } = useDropdownCatalogs(filter)
  const createM = useCreateDropdownCatalog()
  const updateM = useUpdateDropdownCatalog()
  const toggleM = useToggleDropdownCatalogStatus()

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_FILTER), [])

  const handleCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((row: DropdownCatalog) => {
    setEditing(row)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (values: DropdownCatalogFormValues) => {
      if (editing) {
        updateM.mutate(
          { id: editing.id, input: values },
          {
            onSuccess: () => {
              toast.success('Catálogo actualizado correctamente')
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
            toast.success('Catálogo creado correctamente')
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
          toast.success(newActivo ? 'Catálogo activado' : 'Catálogo desactivado')
          setConfirmToggle(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
      }
    )
  }, [confirmToggle, toggleM])

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        title="Listas desplegables"
        description="Catálogos reutilizables: tipo (key) + opciones label/value."
        onAdd={handleCreate}
        addLabel="Crear catálogo"
      />

      <CatalogFilterBar
        filter={filter}
        onFilterChange={setFilter}
        onClear={handleClearFilters}
        searchPlaceholder="Key o nombre..."
      />

      <CatalogTableLayout
        isLoading={isLoading}
        error={isError ? (error instanceof Error ? error : new Error('Error al cargar')) : null}
        emptyTitle="No hay catálogos desplegables"
        emptyDescription="Crea el primer catálogo o ajusta los filtros."
        itemCount={items.length}
      >
        <>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead className="w-[120px]">Opciones</TableHead>
              <TableHead className="w-[70px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-sm">{row.key}</TableCell>
                <TableCell className="font-medium">{row.nombre}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.descripcion ?? '—'}
                </TableCell>
                <TableCell>
                  <CatalogStatusBadge activo={row.activo} />
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={ROUTES.SETTINGS_CATALOGS_DROPDOWNS_OPTIONS.replace(
                        ':catalogId',
                        row.id
                      )}
                    >
                      <List className="mr-1 h-4 w-4" />
                      Opciones
                    </Link>
                  </Button>
                </TableCell>
                <TableCell>
                  <CatalogRowActions
                    item={row}
                    onEdit={handleEdit}
                    onToggleActivo={setConfirmToggle}
                    resourceLabel="catálogo"
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
            <DialogTitle>
              {editing ? 'Editar catálogo' : 'Nuevo catálogo'}
            </DialogTitle>
          </DialogHeader>
          <DropdownCatalogForm
            defaultValues={
              editing
                ? {
                    key: editing.key,
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
        title={confirmToggle?.activo ? 'Desactivar catálogo' : 'Activar catálogo'}
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
