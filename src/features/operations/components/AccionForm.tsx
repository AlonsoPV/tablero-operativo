/**
 * Formulario de creación/edición de acción diaria (spec §5.1, §6.1).
 * React Hook Form + Zod. Campos requeridos: descripcion_accion, responsable, hora_limite, evidencia_esperada.
 */

import { useEffect, useState } from 'react'
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
import {
  accionCreateSchema,
  type AccionCreateInput,
} from '../schemas/accion.schema'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { useDropdownOptionsByKey } from '@/features/catalogs/hooks/useDropdownOptions'
import { PRIORIDAD_NC } from '@/types'

export interface AccionFormProps {
  defaultValues?: Partial<AccionCreateInput> | null
  onSubmit: (values: AccionCreateInput) => void
  onCancel: () => void
  isSubmitting?: boolean
  isEdit?: boolean
}

export function AccionForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isEdit = false,
}: AccionFormProps) {
  const { data: users = [] } = useUsers({ activo: true })
  const { data: areas = [] } = useAreas({ activo: true })
  const { data: evidenciaOpciones = [] } = useDropdownOptionsByKey('evidencia_esperada')
  const [evidenciaSelect, setEvidenciaSelect] = useState<string>('__none__')

  const form = useForm<AccionCreateInput>({
    resolver: zodResolver(accionCreateSchema),
    defaultValues: defaultValues ?? {
      descripcion_accion: '',
      responsable: '',
      fecha: new Date().toISOString().slice(0, 10),
      hora_limite: '17:00',
      evidencia_esperada: '',
      prioridad: 'P2_Media',
      area: undefined,
    },
  })

  useEffect(() => {
    if (evidenciaOpciones.length === 0) return
    const val = (defaultValues?.evidencia_esperada ?? form.getValues('evidencia_esperada'))?.trim() ?? ''
    const match = evidenciaOpciones.find((o) => o.label === val)
    setEvidenciaSelect(match ? match.value : val ? 'otro' : '__none__')
  }, [evidenciaOpciones.length, defaultValues?.evidencia_esperada])

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="descripcion_accion">Descripción de la acción *</Label>
        <textarea
          id="descripcion_accion"
          {...form.register('descripcion_accion')}
          placeholder="Mínimo 10, máximo 500 caracteres"
          rows={3}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
        {form.formState.errors.descripcion_accion && (
          <p className="text-sm text-destructive">
            {form.formState.errors.descripcion_accion.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="responsable">Responsable *</Label>
          <Select
            value={form.watch('responsable')}
            onValueChange={(v) => form.setValue('responsable', v)}
          >
            <SelectTrigger id="responsable">
              <SelectValue placeholder="Seleccionar responsable" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.responsable && (
            <p className="text-sm text-destructive">
              {form.formState.errors.responsable.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha">Día límite *</Label>
          <Input
            id="fecha"
            type="date"
            {...form.register('fecha')}
          />
          {form.formState.errors.fecha && (
            <p className="text-sm text-destructive">
              {form.formState.errors.fecha.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="hora_limite">Hora límite *</Label>
          <Input
            id="hora_limite"
            type="time"
            {...form.register('hora_limite')}
            step={60}
          />
          {form.formState.errors.hora_limite && (
            <p className="text-sm text-destructive">
              {form.formState.errors.hora_limite.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="evidencia_esperada">Evidencia esperada *</Label>
        {evidenciaOpciones.length > 0 ? (
          <>
            <Select
              value={evidenciaSelect}
              onValueChange={(v) => {
                setEvidenciaSelect(v)
                if (v === '__none__') {
                  form.setValue('evidencia_esperada', '')
                  return
                }
                if (v === 'otro') {
                  form.setValue('evidencia_esperada', '')
                  return
                }
                const opt = evidenciaOpciones.find((o) => o.value === v)
                if (opt) form.setValue('evidencia_esperada', opt.label)
              }}
            >
              <SelectTrigger id="evidencia_esperada">
                <SelectValue placeholder="Seleccionar tipo de evidencia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seleccionar...</SelectItem>
                {evidenciaOpciones.map((o) => (
                  <SelectItem key={o.id} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {evidenciaSelect === 'otro' && (
              <Input
                placeholder="Especificar evidencia (mín. 5 caracteres)"
                className="mt-2"
                {...form.register('evidencia_esperada')}
              />
            )}
          </>
        ) : (
          <Input
            id="evidencia_esperada"
            {...form.register('evidencia_esperada')}
            placeholder="Qué se debe entregar (mín. 5 caracteres)"
          />
        )}
        {form.formState.errors.evidencia_esperada && (
          <p className="text-sm text-destructive">
            {form.formState.errors.evidencia_esperada.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Prioridad</Label>
          <Select
            value={form.watch('prioridad') ?? 'P2_Media'}
            onValueChange={(v) => form.setValue('prioridad', v as AccionCreateInput['prioridad'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORIDAD_NC.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === 'P1_Critica' ? 'Crítica' : p === 'P2_Media' ? 'Media' : 'Baja'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Área</Label>
          <Select
            value={form.watch('area') ?? '__none__'}
            onValueChange={(v) => form.setValue('area', v === '__none__' ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin área</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.nombre}>
                  {a.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear acción'}
        </Button>
      </div>
    </form>
  )
}
