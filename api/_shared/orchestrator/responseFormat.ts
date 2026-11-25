/**
 * Selección del formato de respuesta: directiva explícita del usuario y regla automática.
 * Todo es determinista (expresiones regulares y la intención ya clasificada); no hay modelo.
 * Una directiva de formato sólo produce un ResponseFormat: nunca toca permisos, herramientas
 * ni ejecución, y el texto restante se clasifica y autoriza como cualquier otro mensaje.
 */
import type { AgentIntent } from './intent.js'
import type { FormatResolution, ResolvedFormat, ResponseFormat } from './answerContract.js'

export { parseFormatDirective, type FormatDirective } from '../../../src/features/ai-support/responseFormat.js'

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const CAUSAL =
  /\b(por que|porque|causa|causas|razon|razones|motivo|motivos|a que se debe|escenario|escenarios|que pasa si|que pasaria|explica|explicame|analiza|analisis|origen)\b/
const REPORT =
  /\b(resumen|resume|resumeme|avance|avances|indicador|indicadores|kpi|kpis|reporte|informe|como vamos|como van|estado general|panorama|comparativo|comparar|balance|dashboard)\b/
const RISK = /\b(riesgo|riesgos|en peligro|amenaza|amenazas)\b/
const POINT = /\b(cuant[oa]s?|cual|cuales|quien|quienes|tengo|tiene|tienen|hay|cuando)\b/

/**
 * Reglas del modo Automático:
 * pregunta puntual → Directo; resumen/avance/indicadores → Reporte; causas, riesgos o
 * escenarios → Análisis; en la duda, Directo con opción de profundizar.
 */
export function resolveFormat(selected: ResponseFormat, intent: AgentIntent['kind'], utterance: string): FormatResolution {
  if (selected !== 'auto') return { format: selected, ambiguous: false }
  const text = normalize(utterance)
  const done = (format: ResolvedFormat, ambiguous = false): FormatResolution => ({ format, ambiguous })

  if (
    intent === 'executive_brief' ||
    intent === 'executive_commitments' ||
    intent === 'executive_discipline' ||
    intent === 'executive_preventive' ||
    intent === 'executive_evidence' ||
    intent === 'executive_review'
  ) {
    return done('report')
  }
  if (CAUSAL.test(text)) return done('analysis')
  if (intent === 'analyze_risk') return done(REPORT.test(text) ? 'report' : 'analysis')
  if (intent === 'aggregate_execution') return done('report')
  if (intent === 'query_okrs') return done(POINT.test(text) && !REPORT.test(text) ? 'direct' : 'report')
  if (intent === 'query_initiatives') {
    const pointInit = /\b(cuant[ao]s?|quien es (?:el )?responsable|responsable de esta iniciativa)\b/.test(text)
    return done(pointInit && !REPORT.test(text) ? 'direct' : 'report')
  }
  if (intent === 'query_knowledge') return done('direct')
  if (REPORT.test(text)) return done('report')
  if (RISK.test(text)) return done('analysis')
  if (
    intent === 'who_most_urgent' ||
    intent === 'recommend_next' ||
    intent === 'unsupported_metric' ||
    intent === 'write_request' ||
    intent === 'clarify'
  ) {
    return done('direct')
  }
  if (intent === 'query_actions') return done('direct', !POINT.test(text))
  return done('direct', true)
}

export const FORMAT_DESCRIPTION: Record<ResponseFormat, string> = {
  auto: 'elijo Directo, Reporte o Análisis según tu pregunta',
  direct: 'respuestas breves con la cifra principal, el hallazgo y la acción recomendada',
  report: 'indicadores, prioridades, riesgos y comparativos',
  analysis: 'evidencia, inferencias, hipótesis y recomendaciones por separado',
}

export const DEEPEN_HINT = '¿Quieres más detalle? Escribe «modo reporte» o «modo análisis».'
