import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { priorityFormSchema, type PriorityFormValues } from '../schemas/priority.schema'
import {
  priorityColorClasses,
  priorityColorForForm,
  priorityDotClasses,
  type PriorityColor,
} from '@/features/operations/utils/priorityColors'

interface PriorityFormProps {
  defaultValues?: Partial<PriorityFormValues> | null
  onSubmit: (values: PriorityFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

const COLOR_OPTIONS: PriorityColor[] = ['rojo', 'amarillo', 'verde']

function colorLabel(color: PriorityColor): string {
  return color[0].toUpperCase() + color.slice(1)
}

export function PriorityForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PriorityFormProps) {
  const resolvedDefaults = useMemo((): PriorityFormValues => {
    const nombre = defaultValues?.nombre ?? ''
    return {
      nombre,
      descripcion: defaultValues?.descripcion,
      color: priorityColorForForm(nombre, defaultValues?.color),
      orden: defaultValues?.orden ?? 0,
      activo: defaultValues?.activo ?? true,
    }
  }, [defaultValues])

  const form = useForm<PriorityFormValues>({
    resolver: zodResolver(priorityFormSchema),
    defaultValues: resolvedDefaults,
  })

  useEffect(() => {
    form.reset(resolvedDefaults)
  }, [form, resolvedDefaults])

  const colorValue = form.watch('color')

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
        <Label htmlFor="descripcion">Descripcion</Label>
        <Input id="descripcion" {...form.register('descripcion')} placeholder="Opcional" />
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <Select
            value={colorValue}
            onValueChange={(value) =>
              form.setValue('color', value as PriorityColor, { shouldDirty: true, shouldValidate: true })
            }
          >
            <SelectTrigger id="color" className={priorityColorClasses(colorValue, true)}>
              <SelectValue placeholder="Seleccionar color">
                <span className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${priorityDotClasses(colorValue)}`} aria-hidden />
                  <span>{colorLabel(colorValue)}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {COLOR_OPTIONS.map((color) => (
                <SelectItem key={color} value={color}>
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${priorityDotClasses(color)}`} aria-hidden />
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${priorityColorClasses(color)}`}>
                      {colorLabel(color)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="orden">Orden</Label>
          <Input id="orden" type="number" {...form.register('orden')} min={0} />
          {form.formState.errors.orden && (
            <p className="text-sm text-destructive">{form.formState.errors.orden.message}</p>
          )}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" {...form.register('activo')} className="h-4 w-4 rounded border-input" />
        <span className="text-sm font-medium">Activo</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}
