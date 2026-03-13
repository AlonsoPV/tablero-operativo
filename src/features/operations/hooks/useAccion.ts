import { useQuery } from '@tanstack/react-query'
import { accionesService } from '@/services/acciones.service'

const KEY = ['acciones'] as const

export function useAccion(id: string | undefined | null) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => accionesService.getById(id!),
    enabled: !!id,
  })
}
