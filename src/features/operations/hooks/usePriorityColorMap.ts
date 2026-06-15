import { useMemo } from 'react'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'

type PriorityWithOptionalColor = {
  nombre: string
  color?: string | null
}

export function usePriorityColorMap(): Map<string, string | null> {
  const { data: priorities = [] } = usePriorities()

  return useMemo(
    () =>
      new Map(
        (priorities as PriorityWithOptionalColor[]).map((priority) => [
          priority.nombre,
          priority.color ?? null,
        ])
      ),
    [priorities]
  )
}
