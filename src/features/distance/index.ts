/**
 * Módulo de distancias: catálogos origen/destino, cálculo ida/vuelta vía Edge Function,
 * tablero de solicitudes (distance_requests).
 */

export { DistanceDashboardPage } from './pages/DistanceDashboardPage'
export { DistancePage } from './pages/DistancePage'
export { DistanceOriginsCatalogPage } from './pages/DistanceOriginsCatalogPage'
export { DistanceDestinationsCatalogPage } from './pages/DistanceDestinationsCatalogPage'
export { DistanceRequestsSavedPage } from './pages/DistanceRequestsSavedPage'
export { DistanceRequestForm } from './components/DistanceRequestForm'
export { DistanceForm } from './components/DistanceForm'
export { DistanceResultCard } from './components/DistanceResultCard'
export { DistanceHistoryTable } from './components/DistanceHistoryTable'
export { DistanceRequestsTable } from './components/DistanceRequestsTable'
export { OriginSelect } from './components/OriginSelect'
export { DestinationSelect } from './components/DestinationSelect'
export { useOrigins } from './hooks/useOrigins'
export { useDestinations } from './hooks/useDestinations'
export { useCalculateRoute } from './hooks/useCalculateRoute'
export { useDistanceRequests, useCreateDistanceRequest, DISTANCE_REQUESTS_QUERY_KEY } from './hooks/useDistanceRequests'
export { useDistanceCalculator } from './hooks/useDistanceCalculator'
export { useDistanceHistory, DISTANCE_QUERY_KEY } from './hooks/useDistanceHistory'
export { distanceService } from './services/distance.service'
export { originsService } from './services/origins.service'
export { destinationsService } from './services/destinations.service'
export { distanceFormSchema } from './schemas/distance.schema'
export { distanceRequestFormSchema } from './schemas/distance-request.schema'
export type {
  DistanceOrigin,
  DistanceDestination,
  DistanceCatalogRow,
  DistanceRequestRow,
  DistanceRequestWithDetails,
  CalculateRoutePayload,
  CalculateRouteResult,
  DistanceRequestFormValues,
  DistanceQueryRow,
  DistanceFormValues,
  DistanceCalculatePayload,
  DistanceCalculateResult,
} from './types/distance.types'
