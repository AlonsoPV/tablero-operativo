import { CatalogPageHeader } from '@/features/catalogs/components/CatalogPageHeader'
import { DistanceRequestsTable } from '../components/DistanceRequestsTable'
import { useDistanceRequests } from '../hooks/useDistanceRequests'

/**
 * Página de catálogos: listado de solicitudes de distancia guardadas (solo lectura).
 */
export function DistanceRequestsSavedPage() {
  const { data: requests = [], isLoading } = useDistanceRequests()

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        title="Solicitudes guardadas"
        description="Historial de solicitudes de rutas guardadas en el tablero de distancias."
      />

      <DistanceRequestsTable rows={requests} isLoading={isLoading} />
    </div>
  )
}
