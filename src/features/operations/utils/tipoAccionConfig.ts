export type TipoAccion =
  | 'configuracion'
  | 'reporte'
  | 'integracion'
  | 'dashboard'
  | 'automatizacion'
  | 'otro'

export type TipoAccionConfig = {
  label: string
  description: string
  puntosMin: number
  puntosMax: number
  puntosSugerido: number
}

export const TIPO_ACCION_CONFIG: Record<TipoAccion, TipoAccionConfig> = {
  configuracion: {
    label: 'Configuración / ajuste',
    description: 'Cambio de parámetro, regla de validación, ajuste simple',
    puntosMin: 1,
    puntosMax: 3,
    puntosSugerido: 2,
  },
  reporte: {
    label: 'Reporte / consulta',
    description: 'Reporte nuevo, vista de datos, extracción',
    puntosMin: 1,
    puntosMax: 3,
    puntosSugerido: 3,
  },
  integracion: {
    label: 'Integración',
    description: 'Integración parcial o completa entre sistemas',
    puntosMin: 5,
    puntosMax: 8,
    puntosSugerido: 5,
  },
  dashboard: {
    label: 'Dashboard / módulo',
    description: 'Dashboard nuevo, módulo de UI, integración de datos visual',
    puntosMin: 5,
    puntosMax: 8,
    puntosSugerido: 8,
  },
  automatizacion: {
    label: 'Automatización / API',
    description: 'API end-to-end, algoritmo complejo, automatización core',
    puntosMin: 13,
    puntosMax: 13,
    puntosSugerido: 13,
  },
  otro: {
    label: 'Otro',
    description: 'Sin categoría definida — asignar puntos manualmente',
    puntosMin: 1,
    puntosMax: 13,
    puntosSugerido: 0,
  },
}

export const TIPO_ACCION_OPTIONS = Object.entries(TIPO_ACCION_CONFIG).map(
  ([value, cfg]) => ({ value: value as TipoAccion, ...cfg })
)

/** Escala Fibonacci válida para story points */
export const STORY_POINTS_OPTIONS = [1, 2, 3, 5, 8, 13] as const
