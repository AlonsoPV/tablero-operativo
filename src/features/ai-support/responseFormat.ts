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

/**
 * Extrae una directiva de formato del mensaje. Tiene precedencia sobre resolución de personas
 * u otras interpretaciones locales: «modo reporte» y «automático» nunca son un nombre.
 */
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
