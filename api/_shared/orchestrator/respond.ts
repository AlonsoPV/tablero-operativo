/**
 * Respuesta del agente en cuatro bloques separados (datos, interpretación,
 * recomendación, limitaciones) y mensajes distintos por estado (CV-04).
 */
import type { QueryStatus } from '../query/contracts.js'
import type { AnswerFacts } from './answerContract.js'

export type AgentResponseBlocks = {
  data: string[]
  interpretation: string[]
  recommendation: string[]
  limitations: string[]
}

export type AgentReference = { id: string; title: string; href: string }

export type AgentResponse = {
  status: QueryStatus | 'clarification' | 'proposal'
  blocks: AgentResponseBlocks
  references: AgentReference[]
  asOf: string | null
  /**
   * Contrato tipado con los mismos datos autorizados que `blocks`. Sólo existe cuando hubo datos
   * (ok/partial); el resto de estados se presenta igual en todos los formatos.
   */
  facts?: AnswerFacts
}

export function emptyBlocks(): AgentResponseBlocks {
  return { data: [], interpretation: [], recommendation: [], limitations: [] }
}

export function formatAsOf(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

export function statusMessage(status: QueryStatus, subject: string, reason?: string): string {
  switch (status) {
    case 'empty':
      return `No encontré ${subject} con ese filtro dentro de tu alcance.`
    case 'forbidden':
      return reason || `No tienes acceso a ${subject}.`
    case 'partial':
      return `Muestro ${subject} disponibles; el resultado está incompleto.`
    case 'error':
      return `No pude consultar ${subject} en este momento. No muestro cifras para no inventarlas.`
    default:
      return ''
  }
}

/** Fallback cuando el LLM agota rondas de herramientas sin texto final. */
export const EMPTY_MODEL_TURN_MESSAGE =
  'No logré completar la respuesta con los datos consultados. Reformula la pregunta en una sola consulta (por ejemplo «mis acciones vencidas» o «avance de OKRs») o vuelve a intentar.'

export function composeText(response: AgentResponse, options: { headings: boolean }): string {
  const { blocks } = response
  const sections: Array<[string, string[]]> = [
    ['Datos', blocks.data],
    ['Interpretación', blocks.interpretation],
    ['Recomendación', blocks.recommendation],
    ['Limitaciones', blocks.limitations],
  ]
  const asOf = formatAsOf(response.asOf)
  const parts = sections
    .filter(([, lines]) => lines.length > 0)
    .map(([title, lines]) => (options.headings ? `${title}:\n${lines.join('\n')}` : lines.join('\n')))
  if (asOf && response.status !== 'clarification' && response.status !== 'proposal') {
    parts.push(options.headings ? `Corte: ${asOf} (CDMX).` : `Corte ${asOf}.`)
  }
  return parts.join('\n\n').trim()
}
