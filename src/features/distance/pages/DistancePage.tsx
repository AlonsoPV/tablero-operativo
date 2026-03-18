/**
 * Página de consulta de distancias (Google Routes API).
 * Formulario, resultado, historial y manejo de loading/errores.
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { DistanceForm } from '../components/DistanceForm'
import { DistanceResultCard } from '../components/DistanceResultCard'
import { DistanceHistoryTable } from '../components/DistanceHistoryTable'
import { useDistanceCalculator } from '../hooks/useDistanceCalculator'
import { useDistanceHistory } from '../hooks/useDistanceHistory'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import type { DistanceFormSchema } from '../schemas/distance.schema'

export function DistancePage() {
  const { data: currentUser } = useCurrentUser()
  const calculate = useDistanceCalculator(currentUser?.id ?? null)
  const { data: history = [], isLoading: historyLoading } = useDistanceHistory()

  const handleSubmit = useCallback(
    (values: DistanceFormSchema) => {
      calculate.mutate(values, {
        onSuccess: (result) => {
          if (result.ok && result.distance_km != null) {
            const saved = (result as { saved?: boolean }).saved
            toast.success(
              saved
                ? `Distancia: ${result.distance_km.toFixed(2)} km. Guardada en historial.`
                : `Distancia: ${result.distance_km.toFixed(2)} km. No se pudo guardar en historial.`
            )
          } else {
            toast.error(result.message || 'No se pudo calcular la distancia.')
          }
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Error al calcular la distancia.')
        },
      })
    },
    [calculate]
  )

  const showResult = calculate.isSuccess && calculate.data
  const resultOk = showResult && calculate.data.ok
  const resultError = showResult && !calculate.data.ok ? calculate.data.message : null

  return (
    <div id="distance-page" className="distance-page space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Consultar distancia</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calcula la distancia en kilómetros entre dos ubicaciones usando Google Routes (en coche).
        </p>
        <p className="text-xs text-muted-foreground mt-1">Powered by Google, ©{new Date().getFullYear()} Google</p>
      </header>

      <section className="space-y-4">
        <DistanceForm
          onSubmit={handleSubmit}
          isSubmitting={calculate.isPending}
        />
        <DistanceResultCard
          distanceKm={resultOk ? calculate.data.distance_km : null}
          duracionSegundos={resultOk ? (calculate.data as { duracion_segundos?: number }).duracion_segundos : null}
          errorMessage={resultError}
          saved={resultOk && (calculate.data as { saved?: boolean }).saved}
          cached={resultOk && !!(calculate.data as { cached?: boolean }).cached}
          hidden={!showResult}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Historial de consultas</h2>
        <DistanceHistoryTable rows={history} isLoading={historyLoading} />
      </section>
    </div>
  )
}
