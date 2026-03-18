import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  accionesService,
  type AccionesFilter,
} from '@/services/acciones.service'

const KEY = ['acciones'] as const

/** QueryKey estable por filtros: evita que cambios en prioridad/estado/etc. no disparen refetch. */
function filterQueryKey(filter: AccionesFilter): unknown[] {
  const estado =
    filter.estado == null
      ? ''
      : Array.isArray(filter.estado)
        ? filter.estado.join(',')
        : filter.estado
  const prioridad =
    filter.prioridad == null
      ? ''
      : Array.isArray(filter.prioridad)
        ? filter.prioridad.join(',')
        : filter.prioridad
  return [
    filter.fecha_creacion ?? '',
    filter.fecha ?? '',
    filter.fecha_min ?? '',
    filter.fecha_max ?? '',
    estado,
    prioridad,
    filter.area ?? '',
    filter.responsable ?? '',
    filter.search ?? '',
  ]
}

export function useAcciones(filter: AccionesFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filterQueryKey(filter)],
    queryFn: () => accionesService.list(filter),
    placeholderData: keepPreviousData,
  })
}

export function useAccionesByDate(fecha: string) {
  return useQuery({
    queryKey: [...KEY, 'byDate', fecha],
    queryFn: () => accionesService.listByDate(fecha),
    enabled: !!fecha,
  })
}
