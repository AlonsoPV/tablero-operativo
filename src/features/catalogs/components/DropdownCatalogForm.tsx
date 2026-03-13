import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dropdownCatalogFormSchema, type DropdownCatalogFormValues } from '../schemas/dropdownCatalog.schema'

interface DropdownCatalogFormProps {
  defaultValues?: Partial<DropdownCatalogFormValues> | null
  onSubmit: (values: DropdownCatalogFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function DropdownCatalogForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: DropdownCatalogFormProps) {
  const form = useForm<DropdownCatalogFormValues>({
    resolver: zodResolver(dropdownCatalogFormSchema),
    defaultValues: defaultValues ?? { key: '', nombre: '', descripcion: undefined, activo: true },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="key">Clave (única, para frontend) *</Label>
        <Input id="key" {...form.register('key')} placeholder="ej: fuente, canal" />
        {form.formState.errors.key && (
          <p className="text-sm text-destructive">{form.formState.errors.key.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" {...form.register('nombre')} placeholder="Nombre del catálogo" />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Input id="descripcion" {...form.register('descripcion')} placeholder="Opcional" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" {...form.register('activo')} className="h-4 w-4 rounded border-input" />
        <span className="text-sm font-medium">Activo</span>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</Button>
      </div>
    </form>
  )
}
