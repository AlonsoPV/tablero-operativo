import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { priorityFormSchema, type PriorityFormValues } from '../schemas/priority.schema'

interface PriorityFormProps {
  defaultValues?: Partial<PriorityFormValues> | null
  onSubmit: (values: PriorityFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function PriorityForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PriorityFormProps) {
  const form = useForm<PriorityFormValues>({
    resolver: zodResolver(priorityFormSchema),
    defaultValues: defaultValues ?? { nombre: '', descripcion: undefined, orden: 0, activo: true },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" {...form.register('nombre')} placeholder="Nombre de la prioridad" />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Input id="descripcion" {...form.register('descripcion')} placeholder="Opcional" />
      </div>
      <div className="space-y-2 w-32">
        <Label htmlFor="orden">Orden</Label>
        <Input id="orden" type="number" {...form.register('orden')} min={0} />
        {form.formState.errors.orden && (
          <p className="text-sm text-destructive">{form.formState.errors.orden.message}</p>
        )}
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
