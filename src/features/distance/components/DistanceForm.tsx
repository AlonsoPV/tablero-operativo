/**
 * Formulario de consulta de distancia: origen y destino (nombre + ubicación).
 */

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { distanceFormSchema, type DistanceFormSchema } from '../schemas/distance.schema'
import { MapPin } from 'lucide-react'

export interface DistanceFormProps {
  onSubmit: (values: DistanceFormSchema) => void
  isSubmitting?: boolean
}

export function DistanceForm({ onSubmit, isSubmitting = false }: DistanceFormProps) {
  const form = useForm<DistanceFormSchema>({
    resolver: zodResolver(distanceFormSchema),
    defaultValues: {
      origen_nombre: '',
      origen_ubicacion: '',
      destino_nombre: '',
      destino_ubicacion: '',
    },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Card className="border-border/60 bg-muted/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Origen y destino</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Nombre: alias (ej. Sucursal Polanco). Ubicación: dirección que se enviará a Google.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="origen_nombre">Nombre origen</Label>
              <Input
                id="origen_nombre"
                placeholder="ej. Sucursal Polanco"
                {...form.register('origen_nombre')}
                className="h-9"
              />
              {form.formState.errors.origen_nombre && (
                <p className="text-xs text-destructive">{form.formState.errors.origen_nombre.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="origen_ubicacion">Ubicación origen</Label>
              <Input
                id="origen_ubicacion"
                placeholder="Dirección o referencia completa"
                {...form.register('origen_ubicacion')}
                className="h-9"
              />
              {form.formState.errors.origen_ubicacion && (
                <p className="text-xs text-destructive">{form.formState.errors.origen_ubicacion.message}</p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="destino_nombre">Nombre destino</Label>
              <Input
                id="destino_nombre"
                placeholder="ej. Cliente Monterrey"
                {...form.register('destino_nombre')}
                className="h-9"
              />
              {form.formState.errors.destino_nombre && (
                <p className="text-xs text-destructive">{form.formState.errors.destino_nombre.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="destino_ubicacion">Ubicación destino</Label>
              <Input
                id="destino_ubicacion"
                placeholder="Dirección o referencia completa"
                {...form.register('destino_ubicacion')}
                className="h-9"
              />
              {form.formState.errors.destino_ubicacion && (
                <p className="text-xs text-destructive">{form.formState.errors.destino_ubicacion.message}</p>
              )}
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? 'Calculando…' : 'Calcular distancia'}
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}
