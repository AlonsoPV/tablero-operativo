/**
 * Hook para reportes históricos: acciones en rango de fechas (spec §5.8).
 */

import { useQuery } from '@tanstack/react-query'
import { reportesService } from '@/services/reportes.service'

const KEY = ['reportes', 'historico'] as const

export function useReportesHistorico(
  fechaDesde: string,
  fechaHasta: string,
  responsableId?: string | null
) {
  return useQuery({
    queryKey: [...KEY, fechaDesde, fechaHasta, responsableId ?? 'all'],
    queryFn: () => reportesService.getAccionesRango(fechaDesde, fechaHasta, responsableId),
    enabled: !!fechaDesde && !!fechaHasta && fechaDesde <= fechaHasta,
  })
}
