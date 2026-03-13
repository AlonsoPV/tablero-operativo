/**
 * Etiquetas legibles para KPIs sagrados (spec §9.4).
 */

import type { NombreKpi } from '@/types'

export const KPI_NOMBRE_LABELS: Record<NombreKpi, string> = {
  OTIF: 'On-Time In-Full',
  Incidencias: 'Incidencias de Calidad',
  Evidencias_T_mas_cero: 'Evidencias T+0',
  DSO: 'Days Sales Outstanding',
  Margen: 'Margen de Utilidad',
  NPS: 'Net Promoter Score',
}

export function getKpiLabel(nombre: string): string {
  return KPI_NOMBRE_LABELS[nombre as NombreKpi] ?? nombre
}
