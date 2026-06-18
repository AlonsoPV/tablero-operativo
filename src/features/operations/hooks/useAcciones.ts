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
  const prioridadId =
    filter.prioridad_id == null
      ? ''
      : Array.isArray(filter.prioridad_id)
        ? filter.prioridad_id.join(',')
        : filter.prioridad_id
  const excluir =
    filter.excluir_estados?.length ? filter.excluir_estados.join(',') : ''
  const tipoAccion =
    filter.tipo_accion == null
      ? ''
      : Array.isArray(filter.tipo_accion)
        ? filter.tipo_accion.join(',')
        : filter.tipo_accion
  return [
    filter.fecha_creacion ?? '',
    filter.fecha ?? '',
    filter.fecha_min ?? '',
    filter.fecha_max ?? '',
    filter.calendario_creadas_hasta ?? '',
    estado,
    excluir,
    prioridad,
    prioridadId,
    filter.area ?? '',
    filter.responsable ?? '',
    filter.created_by ?? '',
    tipoAccion,
    filter.sprint_id ?? '',
    filter.search ?? '',
  ]
}

export function useAcciones(
  filter: AccionesFilter = {},
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [...KEY, filterQueryKey(filter)],
    queryFn: () => accionesService.list(filter),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    retry: 1,
  })
}

export function useAccionesByDate(fecha: string) {
  return useQuery({
    queryKey: [...KEY, 'byDate', fecha],
    queryFn: () => accionesService.listByDate(fecha),
    enabled: !!fecha,
    staleTime: 30_000,
    retry: 1,
  })
}
