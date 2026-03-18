import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { originFormSchema, type OriginFormValues } from '../schemas/origin.schema'

interface OriginFormProps {
  defaultValues?: Partial<OriginFormValues> | null
  onSubmit: (values: OriginFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function OriginForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: OriginFormProps) {
  const form = useForm<OriginFormValues>({
    resolver: zodResolver(originFormSchema),
    defaultValues: defaultValues ?? { nombre: '', ubicacion: '', activo: true },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="origin-nombre">Nombre *</Label>
        <Input id="origin-nombre" {...form.register('nombre')} placeholder="ej. DHL Macrocentro" />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="origin-ubicacion">Ubicación *</Label>
        <Input
          id="origin-ubicacion"
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
