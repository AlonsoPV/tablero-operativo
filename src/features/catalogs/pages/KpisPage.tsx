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
import { Badge } from '@/components/ui/badge'
import { CatalogPageHeader } from '../components/CatalogPageHeader'
import { CatalogStatusBadge } from '../components/CatalogStatusBadge'
import { CatalogFilterBar } from '../components/CatalogFilterBar'
import { CatalogTableLayout } from '../components/CatalogTableLayout'
import { CatalogRowActions } from '../components/CatalogRowActions'
import { ConfirmActivateDialog } from '../components/ConfirmActivateDialog'
import { KpiForm } from '../components/KpiForm'
import { useKpis, useCreateKpi, useUpdateKpi, useToggleKpiStatus } from '../hooks/useKpis'
import type { CatalogKpi } from '../types/catalogs.types'
import type { CatalogFilter } from '../types/catalogs.types'
import type { KpiFormValues } from '../schemas/kpi.schema'
import { toast } from 'sonner'

const DEFAULT_FILTER: CatalogFilter = {}

export function KpisPage() {
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogKpi | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<CatalogKpi | null>(null)

  const { data: items = [], isLoading, isError, error } = useKpis(filter)
  const createM = useCreateKpi()
  const updateM = useUpdateKpi()
  const toggleM = useToggleKpiStatus()

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_FILTER), [])

  const handleCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((row: CatalogKpi) => {
    setEditing(row)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (values: KpiFormValues) => {
      if (editing) {
        updateM.mutate(
          { id: editing.id, input: values },
          {
            onSuccess: () => {
              toast.success('KPI actualizado correctamente')
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
            toast.success('KPI creado correctamente')
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
          toast.success(newActivo ? 'KPI activado' : 'KPI desactivado')
          setConfirmToggle(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
      }
    )
  }, [confirmToggle, toggleM])

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        title="KPIs"
        description="KPIs configurables: unidad, tipo, meta objetivo, periodicidad. Preparado para fórmulas y dashboards."
        onAdd={handleCreate}
        addLabel="Crear KPI"
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
        emptyTitle="No hay KPIs"
        emptyDescription="Crea el primer KPI o ajusta los filtros."
        itemCount={items.length}
      >
        <>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Meta</TableHead>
              <TableHead>Periodicidad</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead className="w-[70px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.nombre}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.unidad}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.tipo}</Badge>
                </TableCell>
                <TableCell>
                  {row.meta_objetivo != null ? row.meta_objetivo : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.periodicidad}</Badge>
                </TableCell>
                <TableCell>{row.orden}</TableCell>
                <TableCell>
                  <CatalogStatusBadge activo={row.activo} />
                </TableCell>
                <TableCell>
                  <CatalogRowActions
                    item={row}
                    onEdit={handleEdit}
                    onToggleActivo={setConfirmToggle}
                    resourceLabel="KPI"
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
            <DialogTitle>{editing ? 'Editar KPI' : 'Nuevo KPI'}</DialogTitle>
          </DialogHeader>
          <KpiForm
            defaultValues={
              editing
                ? {
                    nombre: editing.nombre,
                    descripcion: editing.descripcion ?? undefined,
                    unidad: editing.unidad as KpiFormValues['unidad'],
                    tipo: editing.tipo as KpiFormValues['tipo'],
                    meta_objetivo: editing.meta_objetivo,
                    periodicidad: editing.periodicidad as KpiFormValues['periodicidad'],
                    orden: editing.orden,
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
        title={confirmToggle?.activo ? 'Desactivar KPI' : 'Activar KPI'}
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
