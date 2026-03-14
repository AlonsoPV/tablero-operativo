/**
 * Métricas de Disciplina (spec §5.4, §12).
 * DisciplinaCard: % cumplimiento, acciones sin evidencia, racha días verde, reincidencias.
 * TODO: cálculo automático de medicion_disciplina en BD (spec §16.8); mientras tanto se calcula desde acciones.
 */

import { useState } from 'react'
import { DisciplinaCard, useDisciplinaMetrics } from '@/features/metrics'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { todayCDMX } from '@/lib/dateUtils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function DisciplinaPage() {
  const today = todayCDMX()
  const [fecha, setFecha] = useState(today)
  const { data: currentUser } = useCurrentUser()
  const { data: metrics, isLoading, isError } = useDisciplinaMetrics(currentUser?.id, fecha)

  const fechaLabel =
    fecha === today ? 'Hoy' : new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'medium' })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Métricas de disciplina</h2>
        <p className="text-muted-foreground">
          Cumplimiento, sin evidencia, racha en verde, reincidencias (spec §5.4)
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="disciplina-fecha">Fecha</Label>
          <Input
            id="disciplina-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      {!currentUser ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
          Inicia sesión para ver tus métricas de disciplina.
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las métricas.
        </div>
      ) : isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed bg-muted/30">
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      ) : metrics ? (
        <DisciplinaCard metrics={metrics} fechaLabel={fechaLabel} />
      ) : null}
    </div>
  )
}
