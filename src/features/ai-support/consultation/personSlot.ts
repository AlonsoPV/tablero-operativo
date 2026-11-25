/**
 * Ranura de persona. Solo se llena con un complemento de persona,
 * nunca con un verbo, un adverbio o un complemento de finalidad («para mejorar»).
 */
import { isConceptualQuestion } from './classifyConsultation'
import { isMethodQuestion, isWhoLags, normalizeSpeech } from './speechAct'

const NOT_A_NAME =
  /^(mas|menos|mejor|peor|mucho|muchos|muy|tan|tanto|primero|retraso|retrasos|atraso|atrasos|tiempo|cierre|vencidas|vencidos|acciones|accion|pendientes|pendiente|el|la|los|las|un|una|mi|mis|que|como|tablero|equipo)$/

function acceptName(name: string | undefined) {
  const token = name?.trim() ?? ''
  const first = token.split(/\s+/)[0] ?? ''
  if (!token || NOT_A_NAME.test(first)) return null
  return token
}

/** Nombre pedido por el turno, o null si la frase no busca a una persona. */
export function readPersonSlot(message: string): string | null {
  const t = normalizeSpeech(message)
  if (!t || isMethodQuestion(t) || isWhoLags(t) || isConceptualQuestion(t)) return null

  const patterns = [
    /\b(?:cuales?|que|cuantas?)?\s*(?:acciones?\s+)?(?:tiene|tienen)\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\b(?:acciones?|pendientes?|tareas?)\s+de\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\ba cargo de\s+([a-z][a-z0-9._-]{1,40})\b/,
  ]
  for (const pattern of patterns) {
    const name = acceptName(t.match(pattern)?.[1])
    if (name) return name
  }

  if (
    /^[a-z][a-z0-9._-]{1,40}(?:\s+[a-z][a-z0-9._-]{1,40}){0,2}$/.test(t) &&
    !NOT_A_NAME.test(t) &&
    !/\b(muestra|muestrame|lista|listame|enlista|enlistar|enlistalas|cuales|cuantas?|cuantos?|todas|todos|vencidas?|acciones?|asignad\w*|crea\w*|dime|analiza|tablero|responsable|por mi|a mi)\b/.test(
      t
    )
  ) {
    return t
  }
  return null
}
