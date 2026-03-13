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
import { kpiFormSchema, type KpiFormValues, KPI_UNITS, KPI_TYPES, KPI_PERIODICITIES } from '../schemas/kpi.schema'

interface KpiFormProps {
  defaultValues?: Partial<KpiFormValues> | null
  onSubmit: (values: KpiFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function KpiForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: KpiFormProps) {
  const form = useForm<KpiFormValues>({
    resolver: zodResolver(kpiFormSchema),
    defaultValues: defaultValues ?? {
      nombre: '',
      descripcion: undefined,
      unidad: 'porcentaje',
      tipo: 'manual',
      meta_objetivo: null,
      periodicidad: 'mensual',
      orden: 0,
      activo: true,
    },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" {...form.register('nombre')} placeholder="Nombre del KPI" />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Input id="descripcion" {...form.register('descripcion')} placeholder="Opcional" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Unidad</Label>
          <Select
            value={form.watch('unidad')}
            onValueChange={(v) => form.setValue('unidad', v as KpiFormValues['unidad'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KPI_UNITS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={form.watch('tipo')}
            onValueChange={(v) => form.setValue('tipo', v as KpiFormValues['tipo'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KPI_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="meta_objetivo">Meta objetivo</Label>
          <Input
            id="meta_objetivo"
            type="number"
            step="any"
            {...form.register('meta_objetivo', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })}
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-2">
          <Label>Periodicidad</Label>
          <Select
            value={form.watch('periodicidad')}
            onValueChange={(v) => form.setValue('periodicidad', v as KpiFormValues['periodicidad'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KPI_PERIODICITIES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
