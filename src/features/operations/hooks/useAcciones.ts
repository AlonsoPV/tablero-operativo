import { useQuery } from '@tanstack/react-query'
import {
  accionesService,
  type AccionesFilter,
} from '@/services/acciones.service'

const KEY = ['acciones'] as const

export function useAcciones(filter: AccionesFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => accionesService.list(filter),
  })
}

export function useAccionesByDate(fecha: string) {
  return useQuery({
    queryKey: [...KEY, 'byDate', fecha],
    queryFn: () => accionesService.listByDate(fecha),
    enabled: !!fecha,
  })
}
