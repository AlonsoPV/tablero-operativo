/**
 * Formulario de creación/edición de acción diaria (spec §5.1, §6.1).
 * Diseño tipo app: secciones agrupadas, iconos, espaciado limpio.
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
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  accionCreateSchema,
  type AccionCreateInput,
} from '../schemas/accion.schema'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { useDropdownOptionsByKey } from '@/features/catalogs/hooks/useDropdownOptions'
import { PRIORIDAD_NC } from '@/types'
import { FileText, User, FileCheck, Tags } from 'lucide-react'

const inputBase =
  'flex h-9 w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50'
const textareaBase =
  'flex min-h-[88px] w-full resize-none rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50'

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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      {/* Descripción */}
      <Card className="border-border/60 bg-muted/5">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 pt-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Descripción</h4>
            <p className="text-xs text-muted-foreground">Detalle de la acción a realizar</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <textarea
            id="descripcion_accion"
            {...form.register('descripcion_accion')}
            placeholder="¿Qué debe hacerse? (10–500 caracteres)"
            rows={3}
            className={textareaBase}
          />
          {form.formState.errors.descripcion_accion && (
            <p className="text-xs text-destructive">{form.formState.errors.descripcion_accion.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Responsable y fechas */}
      <Card className="border-border/60 bg-muted/5">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 pt-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Responsable y programación</h4>
            <p className="text-xs text-muted-foreground">Quién y cuándo</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="responsable" className="text-xs font-medium text-muted-foreground">
              Responsable *
            </Label>
            <Select
              value={form.watch('responsable')}
              onValueChange={(v) => form.setValue('responsable', v)}
            >
              <SelectTrigger id="responsable" className={inputBase + ' h-10 border-input bg-muted/30'}>
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
              <p className="text-xs text-destructive">{form.formState.errors.responsable.message}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fecha" className="text-xs font-medium text-muted-foreground">
                Día límite *
              </Label>
              <Input
                id="fecha"
                type="date"
                {...form.register('fecha')}
                className={inputBase + ' h-10'}
              />
              {form.formState.errors.fecha && (
                <p className="text-xs text-destructive">{form.formState.errors.fecha.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="hora_limite" className="text-xs font-medium text-muted-foreground">
                Hora límite *
              </Label>
              <Input
                id="hora_limite"
                type="time"
                {...form.register('hora_limite')}
                step={60}
                className={inputBase + ' h-10'}
              />
              {form.formState.errors.hora_limite && (
                <p className="text-xs text-destructive">{form.formState.errors.hora_limite.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Evidencia */}
      <Card className="border-border/60 bg-muted/5">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 pt-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileCheck className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Evidencia esperada</h4>
            <p className="text-xs text-muted-foreground">Qué entregar al completar</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {evidenciaOpciones.length > 0 ? (
            <>
              <Select
                value={evidenciaSelect}
                onValueChange={(v) => {
                  setEvidenciaSelect(v)
                  if (v === '__none__') form.setValue('evidencia_esperada', '')
                  else if (v === 'otro') form.setValue('evidencia_esperada', '')
                  else {
                    const opt = evidenciaOpciones.find((o) => o.value === v)
                    if (opt) form.setValue('evidencia_esperada', opt.label)
                  }
                }}
              >
                <SelectTrigger className={inputBase + ' h-10 border-input bg-muted/30'}>
                  <SelectValue placeholder="Tipo de evidencia" />
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
                  placeholder="Especificar (mín. 5 caracteres)"
                  className={inputBase + ' h-10'}
                  {...form.register('evidencia_esperada')}
                />
              )}
            </>
          ) : (
            <Input
              id="evidencia_esperada"
              {...form.register('evidencia_esperada')}
              placeholder="Qué se debe entregar (mín. 5 caracteres)"
              className={inputBase + ' h-10'}
            />
          )}
          {form.formState.errors.evidencia_esperada && (
            <p className="text-xs text-destructive">{form.formState.errors.evidencia_esperada.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Clasificación */}
      <Card className="border-border/60 bg-muted/5">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 pt-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Tags className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Clasificación</h4>
            <p className="text-xs text-muted-foreground">Prioridad y área</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Prioridad</Label>
              <Select
                value={form.watch('prioridad') ?? 'P2_Media'}
                onValueChange={(v) => form.setValue('prioridad', v as AccionCreateInput['prioridad'])}
              >
                <SelectTrigger className={inputBase + ' h-10 border-input bg-muted/30'}>
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
              <Label className="text-xs font-medium text-muted-foreground">Área</Label>
              <Select
                value={form.watch('area') ?? '__none__'}
                onValueChange={(v) => form.setValue('area', v === '__none__' ? undefined : v)}
              >
                <SelectTrigger className={inputBase + ' h-10 border-input bg-muted/30'}>
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
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear acción'}
        </Button>
      </div>
    </form>
  )
}
