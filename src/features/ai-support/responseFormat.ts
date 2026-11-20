/**
 * Formatos de respuesta del asistente. Fuente única para la interfaz y para el orquestador
 * (api/_shared/orchestrator/answerContract.ts los reexporta). Sólo describe presentación:
 * no concede permisos, herramientas ni capacidad de ejecución.
 */

export const RESPONSE_FORMATS = ['auto', 'direct', 'report', 'analysis'] as const
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number]
export type ResolvedFormat = Exclude<ResponseFormat, 'auto'>

export const DEFAULT_RESPONSE_FORMAT: ResponseFormat = 'auto'

export const FORMAT_LABEL: Record<ResponseFormat, string> = {
  auto: 'Automático',
  direct: 'Directo',
  report: 'Reporte',
  analysis: 'Análisis',
}

export function isResponseFormat(value: unknown): value is ResponseFormat {
  return typeof value === 'string' && (RESPONSE_FORMATS as readonly string[]).includes(value)
}

/** Valida entrada no confiable (cuerpo HTTP, payload persistido, almacenamiento local). */
export function coerceResponseFormat(value: unknown): ResponseFormat {
  return isResponseFormat(value) ? value : DEFAULT_RESPONSE_FORMAT
}
