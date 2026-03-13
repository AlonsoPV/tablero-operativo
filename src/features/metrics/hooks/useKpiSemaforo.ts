/**
 * Hook para estado del semáforo KPI por fecha (spec §10.2, §10.3).
 * Combina kpis, kpi_metas y kpi_mediciones; si no hay medición se considera 100%.
 */

import { useQueries } from '@tanstack/react-query'
import { kpisService, semaforoFromValor } from '@/services/kpis.service'
import type { Kpi } from '@/types'
import type { KpiSemaforo } from '@/types'
import type { KpiMeta, KpiMedicion } from '@/types'

export interface KpiSemaforoItem {
  kpi: Kpi
  meta: KpiMeta | null
  valor: number
  color: KpiSemaforo
}

const KPIS_KEY = ['kpis'] as const
const METAS_KEY = ['kpis', 'metas'] as const
const MEDICIONES_KEY = ['kpis', 'mediciones'] as const

function getMedicionesByFecha(fecha: string): Promise<KpiMedicion[]> {
  return kpisService.getMedicionesByFecha(fecha) as Promise<KpiMedicion[]>
}

export function useKpiSemaforo(fecha: string | undefined) {
  const [kpisQuery, metasQuery, medicionesQuery] = useQueries({
    queries: [
      {
        queryKey: KPIS_KEY,
        queryFn: () => kpisService.list(),
      },
      {
        queryKey: METAS_KEY,
        queryFn: () => kpisService.getMetasAll(),
      },
      {
        queryKey: [...MEDICIONES_KEY, fecha],
        queryFn: () => getMedicionesByFecha(fecha!),
        enabled: !!fecha,
      },
    ],
  })

  const kpis = kpisQuery.data ?? []
  const metas = metasQuery.data ?? []
  const mediciones = (medicionesQuery.data ?? []) as KpiMedicion[]

  const items: KpiSemaforoItem[] = kpis.map((kpi) => {
    const meta = metas.find((m) => m.kpi_id === kpi.id) ?? null
    const medicion = mediciones.find((m) => m.kpi_id === kpi.id)
    // Spec §10.3: si no hay acciones para el KPI, se considera 100%
    const valor = medicion != null ? Number(medicion.valor) : 100
    const umbralAlerta = meta?.umbral_alerta ?? 80
    const umbralCritico = meta?.umbral_critico ?? 50
    const color = semaforoFromValor(valor, umbralAlerta, umbralCritico)
    return { kpi, meta, valor, color }
  })

  return {
    items,
    isLoading: kpisQuery.isLoading || metasQuery.isLoading || (!!fecha && medicionesQuery.isLoading),
    isError: kpisQuery.isError || metasQuery.isError || medicionesQuery.isError,
    error: kpisQuery.error ?? metasQuery.error ?? medicionesQuery.error,
  }
}
