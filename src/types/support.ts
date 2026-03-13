/**
 * Tipos de tablas de soporte (spec §8).
 * TODO: completar cuando se implementen las pantallas correspondientes.
 */

export interface Notificacion {
  id: string
  usuario_id: string
  tipo: string
  prioridad: 'Alta' | 'Urgente' | 'Normal'
  leido: boolean
  payload: Record<string, unknown> | null
  created_at: string
}

export interface KpiMedicion {
  id: string
  kpi_id: string
  fecha: string
  valor: number
  // TODO: más campos según kpi_mediciones real
}

export interface KpiMeta {
  id: string
  kpi_id: string
  meta_valor: number
  umbral_alerta: number
  umbral_critico: number
  periodo_evaluacion?: string
  notificar_a?: string[] // user ids
}

export interface MedicionDisciplina {
  id: string
  usuario_id: string
  fecha: string
  acciones_asignadas: number
  acciones_cerradas_en_tiempo: number
  porcentaje_cumplimiento: number
  acciones_sin_evidencia: number
  reincidencias: number
  dias_consecutivos_en_verde: number
  // TODO: spec indica que el cálculo automático está pendiente
}
