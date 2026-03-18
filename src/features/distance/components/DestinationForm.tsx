import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { destinationFormSchema, type DestinationFormValues } from '../schemas/destination.schema'

interface DestinationFormProps {
  defaultValues?: Partial<DestinationFormValues> | null
  onSubmit: (values: DestinationFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function DestinationForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: DestinationFormProps) {
  const form = useForm<DestinationFormValues>({
    resolver: zodResolver(destinationFormSchema),
    defaultValues: defaultValues ?? { nombre: '', ubicacion: '', activo: true },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="destination-nombre">Nombre *</Label>
        <Input id="destination-nombre" {...form.register('nombre')} placeholder="ej. Palmar" />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="destination-ubicacion">Ubicación *</Label>
        <Input
          id="destination-ubicacion"
          {...form.register('ubicacion')}
          placeholder="Dirección completa para rutas"
        />
        {form.formState.errors.ubicacion && (
          <p className="text-sm text-destructive">{form.formState.errors.ubicacion.message}</p>
        )}
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" {...form.register('activo')} className="h-4 w-4 rounded border-input" />
        <span className="text-sm font-medium">Activo</span>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}
