/**
 * Página del tablero de distancias: formulario con origen/destino del catálogo,
 * cálculo ida/vuelta/total, guardar solicitud e historial en distance_requests.
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { DistanceRequestForm } from '../components/DistanceRequestForm'
import { DistanceResultCard } from '../components/DistanceResultCard'
import { DistanceRequestsTable } from '../components/DistanceRequestsTable'
import { useCalculateRoute } from '../hooks/useCalculateRoute'
import { useDistanceRequests, useCreateDistanceRequest } from '../hooks/useDistanceRequests'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import type { DistanceRequestFormSchema } from '../schemas/distance-request.schema'
import type { CalculateRouteResult } from '../types/distance.types'

export function DistanceDashboardPage() {
  const { data: currentUser } = useCurrentUser()
  const [lastResult, setLastResult] = useState<CalculateRouteResult | null>(null)

  const calculateRoute = useCalculateRoute()
  const createRequest = useCreateDistanceRequest()
  const { data: requests = [], isLoading: requestsLoading } = useDistanceRequests()

  const handleCalculate = useCallback(
    (originId: string, destinationId: string) => {
      setLastResult(null)
      calculateRoute.mutate(
        { origin_id: originId, destination_id: destinationId },
        {
          onSuccess: (result) => {
            setLastResult(result)
            if (result.ok) {
              toast.success(
                result.cached
                  ? 'Resultado desde catálogo (sin llamar a Google).'
                  : `Distancia calculada: ${result.km_total?.toFixed(2) ?? '—'} km total.`
              )
            } else {
              toast.error(result.message ?? 'No se pudo calcular la distancia.')
            }
          },
          onError: (err) => {
            const message = err instanceof Error ? err.message : 'Error al calcular la distancia.'
            setLastResult({ ok: false, message })
            toast.error(message)
          },
        }
      )
    },
    [calculateRoute]
  )

  const handleSaveRequest = useCallback(
    (values: DistanceRequestFormSchema, result: CalculateRouteResult) => {
      if (!result.ok || result.km_ida == null || result.km_vuelta == null || result.km_total == null) return
      createRequest.mutate(
        {
          ruta: values.ruta?.trim() || null,
          fecha: values.fecha,
          hora_alta: values.hora_alta,
          origin_id: values.origin_id,
          destination_id: values.destination_id,
          distance_catalog_id: result.distance_catalog_id ?? null,
          km_ida: result.km_ida,
          km_vuelta: result.km_vuelta,
          km_total: result.km_total,
          created_by: currentUser?.id ?? null,
        },
        {
          onSuccess: () => {
            toast.success('Solicitud guardada.')
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Error al guardar la solicitud.')
          },
        }
      )
    },
    [createRequest, currentUser?.id]
  )

  const showResult = lastResult != null
  const resultOk = showResult && lastResult.ok
  const resultError = showResult && !lastResult.ok ? lastResult.message : null

  return (
    <div id="distance-dashboard-page" className="distance-dashboard-page space-y-8">
      <header id="distance-dashboard-header" className="distance-dashboard-header">
        <h1 id="distance-dashboard-title" className="distance-dashboard-title text-2xl font-semibold tracking-tight">
          Distancias
        </h1>
        <p id="distance-dashboard-description" className="distance-dashboard-description text-sm text-muted-foreground mt-1">
          Calcula distancias ida y vuelta entre orígenes y destinos del catálogo. Si el par ya existe en catálogo, no se llama a Google.
        </p>
        <p id="distance-dashboard-credits" className="distance-dashboard-credits text-xs text-muted-foreground mt-1">
          Powered by Google, ©{new Date().getFullYear()} Google
        </p>
      </header>

      <section
        id="distance-request-section"
        className="distance-request-section space-y-4"
        aria-labelledby="distance-request-section-title"
      >
        <h2 id="distance-request-section-title" className="sr-only">
          Solicitud de ruta
        </h2>
        <DistanceRequestForm
          lastResult={lastResult}
          isCalculatePending={calculateRoute.isPending}
          isSavePending={createRequest.isPending}
          onCalculate={handleCalculate}
          onSaveRequest={handleSaveRequest}
        />
        <DistanceResultCard
          km_ida={resultOk ? lastResult!.km_ida : null}
          km_vuelta={resultOk ? lastResult!.km_vuelta : null}
          km_total={resultOk ? lastResult!.km_total : null}
          duracion_ida_segundos={resultOk ? lastResult!.duracion_ida_segundos : null}
          duracion_vuelta_segundos={resultOk ? lastResult!.duracion_vuelta_segundos : null}
          errorMessage={resultError}
          cached={resultOk && lastResult!.cached}
          hidden={!showResult}
        />
      </section>

      <section
        id="distance-requests-history-section"
        className="distance-requests-history-section"
        aria-labelledby="distance-requests-history-title"
      >
        <h2 id="distance-requests-history-title" className="distance-requests-history-title text-lg font-medium mb-3">
          Solicitudes guardadas
        </h2>
        <DistanceRequestsTable rows={requests} isLoading={requestsLoading} />
      </section>
    </div>
  )
}
