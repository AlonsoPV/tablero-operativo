/**
 * Acto de habla del turno, antes de extraer entidades o elegir herramienta.
 * Los marcos son pocos y gramaticales: no es un diccionario de frases ni de temas.
 */

export type SpeechAct = 'conceptual' | 'data' | 'advisory' | 'action' | 'hybrid'

export function normalizeSpeech(text: string) {
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

/** Tema de plazo y cierre. Una familia, no una frase. */
export function isOnTimeTheme(text: string) {
  const t = normalizeSpeech(text)
  return /\b(cierre|a tiempo|en tiempo|plazo|cumplimiento|puntual\w*|venc\w*|atras\w*|retras\w*|fechas?)\b/.test(t)
}

/**
 * Pregunta de método: cómo hacerlo, qué haría, de qué manera.
 * Un imperativo de alta («crea…», «cierra…») sigue siendo una acción.
 */
export function isMethodQuestion(text: string) {
  const t = normalizeSpeech(text)
  if (!t) return false
  if (/^(crea|crear|creame|genera|generame|agrega|agregame|registra|anota|actualiza|marca|marcar|cierra|cerrar|reprograma|agenda)\b/.test(t)) {
    return false
  }
  if (/\bque (harias|hariamos|recomendarias|sugieres|sugeririas)\b/.test(t)) return true
  if (/\b(de que manera|de que forma)\b/.test(t)) return true
  if (/\bque hago\b/.test(t)) return true
  if (/\bque recomiendas\b/.test(t) && isOnTimeTheme(t)) return true
  if (
    /^como\b/.test(t) &&
    /\b(hago|hacer|puedo|podemos|podria|podriamos|deberia|deberiamos|logro|consigo|se puede|mejor\w*|logr\w*)\b/.test(t)
  ) {
    return true
  }
  if (/\bcomo (mejor\w*|lograr|conseguir|hago|puedo)\b/.test(t)) return true
  if (/\bque (puedo|podemos|podria|podriamos) hacer\b/.test(t) && isOnTimeTheme(t)) return true
  return false
}

/** Quién concentra atrasos. No es un nombre propio. */
export function isWhoLags(text: string) {
  const t = normalizeSpeech(text)
  if (!/\bqui[eé]nes?\b/.test(t)) return false
  if (/\b(que es|que significa|como funciona)\b/.test(t)) return false
  return /\b(atras\w*|retras\w*|vencid\w*|demor\w*)\b/.test(t)
}

/**
 * El turno pide identificar a una persona.
 * «Para + infinitivo» y «tienen más atrasos» no cuentan.
 */
export function isPersonSeeking(text: string) {
  const t = normalizeSpeech(text)
  if (!t || isMethodQuestion(t) || isWhoLags(t)) return false
  if (/\b(a cargo de|acciones de|pendientes de|tareas de|asigne a|asignad[oa]s? a)\b/.test(t)) return true
  if (/\b(tiene|tienen)\s+[a-z]/.test(t) && !/\b(tiene|tienen)\s+(mas|menos|mucho|retraso|atraso|vencid)/.test(t)) {
    return true
  }
  if (/\bqui[eé]n\b/.test(t) && /\b(es|se llama|responsable)\b/.test(t)) return true
  return false
}

export const ON_TIME_PRACTICE =
  'Empezaría por tres ajustes: definir fechas realistas, revisar diariamente las acciones próximas a vencer y exigir evidencia de cierre antes de marcarlas como verificadas. También podemos identificar qué responsables o tipos de acciones concentran más retrasos para atacar la causa principal. No cambié ninguna acción.'

const GENERAL_PRACTICE =
  'Empezaría por un solo cambio esta semana: el cuello de botella que más se repite, sea el plazo, el seguimiento o la evidencia de cierre. Dime cuál pesa más y lo aterrizo con los datos que puedes ver. No cambié ninguna acción.'

/** Recomendación de método. No consulta personas ni ejecuta cambios. */
export function practiceReply(message: string, priorUserMessages: string[] = []) {
  const t = normalizeSpeech(message)
  const priors = priorUserMessages.map(normalizeSpeech)
  const themed = isOnTimeTheme(t) || priors.some((prior) => isOnTimeTheme(prior) || isWhoLags(prior))
  if (/\bque (harias|hariamos)\b/.test(t) && !themed) return GENERAL_PRACTICE
  return themed ? ON_TIME_PRACTICE : GENERAL_PRACTICE
}
