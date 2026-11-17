/** Detectores de alcance para respuestas factuales del asistente. */

function normalize(text: string) {
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

const STOP_PERSON = new Set([
  'mi',
  'mis',
  'yo',
  'me',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'uno',
  'tablero',
  'equipo',
  'organizacion',
  'verificacion',
  'prioridad',
  'okr',
  'okrs',
  'hoy',
  'todas',
  'todos',
  'acciones',
  'accion',
  'abiertas',
  'pendientes',
  'total',
])

export function isListRequest(message: string) {
  const t = normalize(message)
  if (/^(cuantas?|cuantos?)\b/.test(t)) return false
  return (
    /\b(muestra|muestrame|lista|listame|enlista|enlistar|enlistalas|listalas|cuales|cual|todas|todos|detalle|detalla)\b/.test(
      t
    ) ||
    (/\b(vencidas?|bloqueadas?|abiertas?|pendientes?|rojas?|\ben rojo\b)\b/.test(t) &&
      /\b(cuales|muestra|lista|enlista|estan|son|dime)\b/.test(t))
  )
}

export function isBriefCountRequest(message: string) {
  const t = normalize(message)
  return (
    /^(cuantas?|cuantos?)\b/.test(t) ||
    (/^(que tengo|mis pendientes|resumen)\b/.test(t) && !isListRequest(message) && t.length < 48)
  )
}

/** Acciones que YO registré / pedí (created_by). */
export function isCreatedByMeRequest(message: string) {
  const t = normalize(message)
  return (
    /\b(cree|cre[eé]|creado|creada|creados|creadas|solicite|solicit[eé]|pedi|ped[ií])\b/.test(t) ||
    /\b(que yo (he )?(cree|cre[eé]|creado|pedi|ped[ií]|solicite)|cread[ao]s? por mi|yo (las )?cree|yo solicite|he creado)\b/.test(
      t
    ) ||
    /\b(creador|created_by_me)\b/.test(t)
  )
}

/**
 * «Asigné / he asignado» = creador (no hay columna asignador distinta).
 * No confundir con «asignadas a mí».
 */
export function isAssignedByMeRequest(message: string) {
  const t = normalize(message)
  return (
    /\b(asigne|asign[eé]|he asignado|has asignado|yo (le |les )?asign|asign[eé] yo)\b/.test(t) ||
    /\b(cuales? (yo )?he asignado|las (cuales|que) (yo )?he asignado|yo que he asignado|que he asignado)\b/.test(
      t
    ) ||
    /\b(asignadas? por mi|yo asigne|yo asigne a)\b/.test(t)
  )
}

/** Responsable = yo. */
export function isAssignedToMeRequest(message: string) {
  const t = normalize(message)
  // Evitar que «he asignado» caiga aquí (antes: asignad[ao]s? matcheaba «asignado»).
  if (isAssignedByMeRequest(message)) return false
  return /\b(asignad[ao]s? a mi|me asignaron|a mi cargo|soy (el )?responsable|responsable soy yo)\b/.test(
    t
  )
}

/** Conteos/listas del tablero completo (no solo mías). */
export function isBoardScopeRequest(message: string) {
  const t = normalize(message)
  return (
    /\b(tablero( completo)?|organizacion|org|en total|totales?)\b/.test(t) ||
    /\bcuantas? (acciones? )?(hay|existen|abiertas hay)\b/.test(t) ||
    /\b(todas las acciones|acciones del tablero|abiertas del tablero|en el kanban)\b/.test(t)
  )
}

/** Solo «enlistalas / cuales / muestra» sin sujeto — candidata a follow-up. */
export function isBareListFollowUp(message: string) {
  const t = normalize(message)
  return /^(enlista(las|los)?|listalas?|muestra(las|los|me)?|cuales|cuales son|todas|detalla)$/.test(
    t
  )
}

export function extractPersonNameQuery(message: string): string | null {
  const t = normalize(message)
  const patterns = [
    /\b(?:cuales?|que|cuantas?)?\s*(?:acciones?\s+)?(?:tiene|tienen)\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\bacciones?\s+de\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\bpendientes?\s+de\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\bresponsable\s+([a-z][a-z0-9._-]{1,40})\b/,
  ]
  for (const re of patterns) {
    const match = t.match(re)
    const name = match?.[1]?.trim()
    if (name && !STOP_PERSON.has(name)) return name
  }
  return null
}

export type FollowUpScope = 'board' | 'created' | 'mine' | 'person'

export function resolveFollowUpScope(
  message: string,
  priorUserMessages: string[] | undefined
): { scope: FollowUpScope; person?: string } | null {
  if (!isBareListFollowUp(message)) return null
  const prior = [...(priorUserMessages ?? [])].reverse()
  for (const prev of prior) {
    const person = extractPersonNameQuery(prev)
    if (person) return { scope: 'person', person }
    if (isBoardScopeRequest(prev)) return { scope: 'board' }
    if (isAssignedByMeRequest(prev) || isCreatedByMeRequest(prev)) return { scope: 'created' }
    if (isAssignedToMeRequest(prev) || /\b(tengo|mis acciones|abiertas)\b/.test(normalize(prev))) {
      return { scope: 'mine' }
    }
  }
  return null
}
