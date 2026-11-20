/**
 * Selección del formato de respuesta: directiva explícita del usuario y regla automática.
 * Todo es determinista (expresiones regulares y la intención ya clasificada); no hay modelo.
 * Una directiva de formato sólo produce un ResponseFormat: nunca toca permisos, herramientas
 * ni ejecución, y el texto restante se clasifica y autoriza como cualquier otro mensaje.
 */
import type { AgentIntent } from './intent.js'
import type { FormatResolution, ResolvedFormat, ResponseFormat } from './answerContract.js'

const MARKS = /[\u0300-\u036f]/g

/** Normaliza (sin acentos, minúsculas) conservando el mapa hacia el texto original. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    const piece = text[i]!.normalize('NFD').replace(MARKS, '').toLowerCase()
    for (const ch of piece) {
      norm += ch
      map.push(i)
    }
  }
  return { norm, map }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').toLowerCase().trim()
}

const KEYWORDS: Array<[RegExp, ResponseFormat]> = [
  [/^(directo|breve|corto|conciso)$/, 'direct'],
  [/^(reporte|informe)$/, 'report'],
  [/^(analisis|detallado|profundo)$/, 'analysis'],
  [/^(automatico|auto)$/, 'auto'],
]
const KW = '(directo|breve|corto|conciso|reporte|informe|analisis|detallado|profundo|automatico|auto)'

const DIRECTIVES: RegExp[] = [
  new RegExp(`\\b(?:en\\s+)?(?:modo|formato)\\s+(?:de\\s+respuesta\\s+)?${KW}\\b`),
  new RegExp(
    `\\b(?:responde(?:me)?|contesta(?:me)?|muestra(?:lo|la|melo)?|dame(?:lo)?|quiero|usa|ponlo|pasa|cambia(?:r)?)\\s+(?:en|a|al|con)\\s+(?:modo\\s+|formato\\s+)?${KW}\\b`
  ),
]
const WHOLE_MESSAGE = new RegExp(`^(?:modo\\s+|formato\\s+)?${KW}[.!]*$`)

function keywordToFormat(keyword: string): ResponseFormat {
  for (const [pattern, format] of KEYWORDS) if (pattern.test(keyword)) return format
  return 'auto'
}

export type FormatDirective = {
  format: ResponseFormat
  /** Mensaje sin la frase de formato; vacío si la directiva era el mensaje completo. */
  rest: string
}

/** Verbos que sólo introducían la directiva («responde en…», «cambia a…») y quedan sueltos al quitarla. */
const LEAD_VERBS =
  /(?:^|\s)(?:por favor\s+)?(?:respond\w*|contest\w*|muestr\w*|dame\w*|hazlo|ponlo|pon|usa\w*|cambia\w*|pasa\w*|activa\w*|quiero)(?:\s+(?:a|al|en|el|la|con|de))*(?=[\s.!?,;:]*$)/i

function tidy(text: string): string {
  return text
    .replace(LEAD_VERBS, '')
    .replace(/\s+([?.!,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/(?:\s+(?:y|e|pero|por favor|porfa))+\s*([?.!]*)$/i, '$1')
    .replace(/^[\s,.;:¡!-]+/, '')
    .replace(/[\s,;:-]+$/, '')
    .trim()
}

export function parseFormatDirective(utterance: string): FormatDirective | null {
  const { norm, map } = normalizeWithMap(utterance)
  const whole = norm.trim().match(WHOLE_MESSAGE)
  if (whole) return { format: keywordToFormat(whole[1]!), rest: '' }

  for (const pattern of DIRECTIVES) {
    const m = pattern.exec(norm)
    if (!m) continue
    const start = map[m.index]!
    const lastNormIndex = m.index + m[0].length - 1
    const end = (map[lastNormIndex] ?? utterance.length - 1) + 1
    const rest = tidy(`${utterance.slice(0, start)} ${utterance.slice(end)}`)
    return { format: keywordToFormat(m[m.length - 1]!), rest: /[\p{L}\p{N}]/u.test(rest) ? rest : '' }
  }
  return null
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

  if (CAUSAL.test(text)) return done('analysis')
  if (intent === 'analyze_risk') return done(REPORT.test(text) ? 'report' : 'analysis')
  if (intent === 'aggregate_execution') return done('report')
  if (intent === 'query_okrs') return done(POINT.test(text) && !REPORT.test(text) ? 'direct' : 'report')
  if (REPORT.test(text)) return done('report')
  if (RISK.test(text)) return done('analysis')
  if (intent === 'who_most_urgent' || intent === 'unsupported_metric' || intent === 'write_request' || intent === 'clarify') {
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
