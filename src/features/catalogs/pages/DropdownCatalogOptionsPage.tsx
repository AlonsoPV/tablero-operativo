import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CatalogPageHeader } from '../components/CatalogPageHeader'
import { CatalogStatusBadge } from '../components/CatalogStatusBadge'
import { EmptyCatalogState } from '../components/EmptyCatalogState'
import { ConfirmActivateDialog } from '../components/ConfirmActivateDialog'
import { DropdownOptionForm } from '../components/DropdownOptionForm'
import { useDropdownCatalog } from '../hooks/useDropdownCatalogs'
import { useDropdownOptions, useCreateDropdownOption, useUpdateDropdownOption, useToggleDropdownOptionStatus } from '../hooks/useDropdownOptions'
import type { DropdownOption } from '../types/catalogs.types'
import type { DropdownOptionFormValues } from '../schemas/dropdownOption.schema'
import { ROUTES } from '@/constants'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, UserCheck, UserX, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DropdownCatalogOptionsPage() {
  const { catalogId } = useParams<{ catalogId: string }>()
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DropdownOption | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<DropdownOption | null>(null)

  const { data: catalog } = useDropdownCatalog(catalogId)
  const { data: items = [], isLoading, isError, error } = useDropdownOptions(catalogId)
  const createM = useCreateDropdownOption()
  const updateM = useUpdateDropdownOption()
  const toggleM = useToggleDropdownOptionStatus()

  const handleFormSubmit = (values: DropdownOptionFormValues) => {
    if (!catalogId) return
    if (editing) {
      updateM.mutate(
        { id: editing.id, input: values },
        { onSuccess: () => { toast.success('Opción actualizada'); setFormOpen(false); setEditing(null); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Error') }
      )
    } else {
      createM.mutate(
        { catalog_id: catalogId, ...values },
        { onSuccess: () => { toast.success('Opción creada'); setFormOpen(false); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Error') }
      )
    }
  }

  const confirmToggleStatus = () => {
    if (!confirmToggle) return
    toggleM.mutate({ id: confirmToggle.id, activo: !confirmToggle.activo }, { onSuccess: () => { toast.success(confirmToggle.activo ? 'Opción desactivada' : 'Opción activada'); setConfirmToggle(null); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Error') })
  }

  if (!catalogId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.SETTINGS_CATALOGS_DROPDOWNS)}><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Button>
        <p className="text-destructive">Falta catalogId</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.SETTINGS_CATALOGS_DROPDOWNS)}><ArrowLeft className="mr-1 h-4 w-4" /> Volver a listas</Button>
      </div>
      <CatalogPageHeader
        title={catalog ? `Opciones: ${catalog.nombre}` : 'Opciones del catálogo'}
        description={catalog ? `Key: ${catalog.key}. Label y value por opción.` : 'Cargando...'}
        onAdd={catalogId ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="Crear opción"
      />
      {isError && <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error instanceof Error ? error.message : 'Error'}</div>}
      {isLoading ? <div className="flex h-64 items-center justify-center rounded-md border bg-card text-muted-foreground">Cargando...</div> : !items.length ? <EmptyCatalogState title="No hay opciones" description="Añade la primera opción para este catálogo." /> : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Value</TableHead><TableHead>Orden</TableHead><TableHead>Estatus</TableHead><TableHead className="w-[70px]">Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{row.value}</TableCell>
                  <TableCell>{row.orden}</TableCell>
                  <TableCell><CatalogStatusBadge activo={row.activo} /></TableCell>
                  <TableCell>
                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing(row); setFormOpen(true); }}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirmToggle(row)} className={cn(!row.activo && 'text-emerald-600')}>{row.activo ? <><UserX className="mr-2 h-4 w-4" /> Desactivar</> : <><UserCheck className="mr-2 h-4 w-4" /> Activar</>}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{editing ? 'Editar opción' : 'Nueva opción'}</DialogTitle></DialogHeader>
        <DropdownOptionForm defaultValues={editing ? { label: editing.label, value: editing.value, orden: editing.orden, activo: editing.activo } : undefined} onSubmit={handleFormSubmit} onCancel={() => setFormOpen(false)} isSubmitting={createM.isPending || updateM.isPending} />
      </DialogContent></Dialog>
      <ConfirmActivateDialog open={!!confirmToggle} onOpenChange={(o) => !o && setConfirmToggle(null)} title={confirmToggle?.activo ? 'Desactivar opción' : 'Activar opción'} description={confirmToggle ? `¿${confirmToggle.activo ? 'Desactivar' : 'Activar'} "${confirmToggle.label}"?` : ''} onConfirm={confirmToggleStatus} isActivo={confirmToggle?.activo ?? false} itemName={confirmToggle?.label ?? ''} isLoading={toggleM.isPending} />
    </div>
  )
}
