import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dropdownOptionFormSchema, type DropdownOptionFormValues } from '../schemas/dropdownOption.schema'

interface DropdownOptionFormProps {
  defaultValues?: Partial<DropdownOptionFormValues> | null
  onSubmit: (values: DropdownOptionFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function DropdownOptionForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: DropdownOptionFormProps) {
  const form = useForm<DropdownOptionFormValues>({
    resolver: zodResolver(dropdownOptionFormSchema),
    defaultValues: defaultValues ?? { label: '', value: '', orden: 0, activo: true },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="label">Label (visible) *</Label>
        <Input id="label" {...form.register('label')} placeholder="Texto a mostrar" />
        {form.formState.errors.label && (
          <p className="text-sm text-destructive">{form.formState.errors.label.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="value">Value (estable para lógica) *</Label>
        <Input id="value" {...form.register('value')} placeholder="valor_interno" />
        {form.formState.errors.value && (
          <p className="text-sm text-destructive">{form.formState.errors.value.message}</p>
        )}
      </div>
      <div className="space-y-2 w-24">
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
