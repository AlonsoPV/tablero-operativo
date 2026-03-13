import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { statusFormSchema, type StatusFormValues } from '../schemas/status.schema'

interface StatusFormProps {
  defaultValues?: Partial<StatusFormValues> | null
  onSubmit: (values: StatusFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function StatusForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: StatusFormProps) {
  const form = useForm<StatusFormValues>({
    resolver: zodResolver(statusFormSchema),
    defaultValues: defaultValues ?? {
      nombre: '',
      descripcion: undefined,
      color: undefined,
      orden: 0,
      es_cierre: false,
      activo: true,
    },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" {...form.register('nombre')} placeholder="Nombre del estatus" />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Input id="descripcion" {...form.register('descripcion')} placeholder="Opcional" />
      </div>
      <div className="flex gap-4">
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <div className="flex gap-2">
            <input
              type="color"
              className="h-9 w-14 cursor-pointer rounded border border-input"
              value={form.watch('color') ?? '#3B82F6'}
              onChange={(e) => form.setValue('color', e.target.value)}
            />
            <Input
              id="color"
              {...form.register('color')}
              placeholder="#3B82F6"
              className="flex-1"
            />
          </div>
        </div>
        <div className="space-y-2 w-24">
          <Label htmlFor="orden">Orden</Label>
          <Input id="orden" type="number" {...form.register('orden')} min={0} />
          {form.formState.errors.orden && (
            <p className="text-sm text-destructive">{form.formState.errors.orden.message}</p>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" {...form.register('es_cierre')} className="h-4 w-4 rounded border-input" />
        <span className="text-sm font-medium">Es cierre (estatus final)</span>
      </label>
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
