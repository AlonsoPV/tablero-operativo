/**
 * Formateador conversacional específico para canal WhatsApp sobre AgentTurnResult.
 * Garantiza:
 * - Respuestas breves y naturales (<= 900 chars, sin Markdown crudo # * _).
 * - Máximo 3 prioridades/registros iniciales.
 * - Indicadores claros de estado ([Atrasada], [Bloqueada], [En riesgo], etc.).
 * - Enlaces a registros autorizados (solo los devueltos por el motor autorizado).
 * - Divulgación progresiva y pregunta contextual de seguimiento.
 */
import { guideAppBaseUrl } from './guideUserLinks.js'
import type { AnswerItem } from './orchestrator/answerContract.js'
import type { AgentIntent } from './orchestrator/intent.js'
import type { AgentTurnResult } from './orchestrator/runAgentTurn.js'
import { composeWhatsApp, renderAnswer } from './orchestrator/renderFormat.js'
import { composeText } from './orchestrator/respond.js'

export const WHATSAPP_MAX_CHARS = 900
export const WHATSAPP_MAX_INITIAL_ITEMS = 3

function stripMarkdown(text: string): string {
  return text
    .replace(/[#*_`]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function statusIndicatorFor(rawStatus: string | null | undefined): string {
  const normalized = (rawStatus ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!normalized) return ''
  if (normalized.includes('retras') || normalized.includes('atras') || normalized.includes('vencid')) {
    return '[Atrasada]'
  }
  if (normalized.includes('bloque')) return '[Bloqueada]'
  if (normalized.includes('riesgo')) return '[En riesgo]'
  if (normalized.includes('hoy')) return '[Hoy]'
  if (normalized.includes('ejecuc') || normalized.includes('proceso')) return '[En curso]'
  if (normalized.includes('pendient')) return '[Pendiente]'
  if (normalized.includes('verific')) return '[Verificada]'
  if (normalized.includes('hecho')) return '[Hecho]'
  return `[${rawStatus!.trim()}]`
}

function absoluteAuthorizedLink(href: string | null | undefined, baseUrl: string): string | null {
  if (!href || typeof href !== 'string') return null
  const trimmed = href.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (!trimmed.startsWith('/')) return null
  const cleanBase = baseUrl.replace(/\/+$/, '')
  return `${cleanBase}${trimmed}`
}

function formatAuthorizedItemLine(item: AnswerItem, index: number, baseUrl: string): string {
  if (item.kind === 'action') {
    const badge = statusIndicatorFor(item.status)
    const owner = item.owner ? ` · ${item.owner}` : ''
    const date = item.date ? ` · ${item.date}` : ''
    const link = absoluteAuthorizedLink(item.href, baseUrl)
    return `${index + 1}. ${badge ? `${badge} ` : ''}${item.title}${owner}${date}${link ? ` (${link})` : ''}`
  }
  if (item.kind === 'okr') {
    const progress = typeof item.progress === 'number' ? `${Math.round(item.progress)}%` : 'sin avance'
    const badge = typeof item.progress === 'number' && item.progress < 50 ? '[En riesgo]' : '[OKR]'
    const link = absoluteAuthorizedLink(item.href, baseUrl)
    return `${index + 1}. ${badge} ${item.title} (${progress})${link ? ` (${link})` : ''}`
  }
  if (item.kind === 'group') {
    return `${index + 1}. ${item.title}: ${item.count}`
  }
  return ''
}

export function buildWhatsAppFollowUpPrompt(
  intent: AgentIntent['kind'],
  hasMoreItems: boolean
): string {
  if (hasMoreItems) {
    return 'Responde "ver más" para el resto o dime el número (ej. "detalle 1").'
  }
  switch (intent) {
    case 'executive_brief':
    case 'executive_commitments':
    case 'executive_discipline':
      return '¿Quieres ver el detalle de la prioridad 1 o revisar bloqueos?'
    case 'query_okrs':
      return '¿Quieres revisar qué acciones impulsan el OKR con mayor riesgo?'
    case 'query_actions':
    case 'aggregate_execution':
    case 'analyze_risk':
    case 'who_most_urgent':
      return '¿Quieres ver atrasadas, bloqueadas o el detalle de alguna?'
    case 'recommend_next':
      return '¿Quieres que prepare un borrador de acción o seguimiento?'
    case 'query_knowledge':
      return '¿Quieres consultar otro documento o revisar tus prioridades?'
    default:
      return '¿Quieres profundizar en algún punto o revisar prioridades de hoy?'
  }
}

export function formatWhatsAppTurn(
  result: AgentTurnResult,
  options: {
    baseUrl?: string
    maxChars?: number
    maxPriorities?: number
  } = {}
): string {
  const maxChars = options.maxChars ?? WHATSAPP_MAX_CHARS
  const maxItems = Math.max(1, Math.min(options.maxPriorities ?? WHATSAPP_MAX_INITIAL_ITEMS, 3))
  const baseUrl = options.baseUrl ?? guideAppBaseUrl()
  const { response } = result
  const notice = result.notice ? stripMarkdown(result.notice) : ''

  // Estados sin hechos formateables (vacío, denegado, error, aclaración, propuesta).
  if (!response.facts || response.status !== 'ok') {
    const raw = stripMarkdown(composeText(response, { headings: false }))
    const combined = notice ? `${notice}\n\n${raw}` : raw
    return combined.length <= maxChars ? combined : `${combined.slice(0, maxChars - 1).trim()}…`
  }

  const facts = response.facts
  const allItems = facts.items ?? []
  const shownItems = allItems.slice(0, maxItems)
  const remainingCount = Math.max(0, allItems.length - shownItems.length)

  const lines: string[] = []
  if (notice) lines.push(notice)

  if (facts.primary?.text) {
    lines.push(stripMarkdown(facts.primary.text))
  }

  // Indicadores clave compactos (máx 3 métricas en una línea).
  if (facts.metrics.length > 0) {
    const metricLine = facts.metrics
      .slice(0, 3)
      .map((m) => `${m.label}: ${m.value}`)
      .join(' | ')
    if (metricLine) lines.push(stripMarkdown(metricLine))
  }

  if (shownItems.length > 0) {
    lines.push(
      shownItems
        .map((item, idx) => stripMarkdown(formatAuthorizedItemLine(item, idx, baseUrl)))
        .join('\n')
    )
  }

  // Recomendación breve (1 línea) y limitaciones críticas.
  const topRecommendation = facts.recommendations[0]
  if (topRecommendation) {
    lines.push(`Siguiente paso: ${stripMarkdown(topRecommendation)}`)
  }

  const topRisk = facts.findings.find((f) => f.risk)
  if (topRisk && !lines.some((line) => line.includes(topRisk.text.slice(0, 24)))) {
    lines.push(`[Riesgo] ${stripMarkdown(topRisk.text)}`)
  }

  for (const limit of facts.limitations.slice(0, 1)) {
    lines.push(stripMarkdown(limit))
  }

  if (remainingCount > 0) {
    lines.push(`+${remainingCount} adicionales en tu alcance.`)
  }

  const followUp = buildWhatsAppFollowUpPrompt(result.intent, remainingCount > 0)
  lines.push(followUp)

  // Si no se produjo cuerpo útil con facts, caer al composeWhatsApp estándar.
  const assembled = lines.filter(Boolean).join('\n\n')
  if (!assembled) {
    const rendered = renderAnswer(response, result.format, { offerDetail: result.offerDetail })
    if (rendered) return composeWhatsApp(rendered, maxChars)
    const fallback = stripMarkdown(composeText(response, { headings: false }))
    return fallback.length <= maxChars ? fallback : `${fallback.slice(0, maxChars - 1).trim()}…`
  }

  if (assembled.length <= maxChars) return assembled

  // Compactar preservando cabecera, top items y seguimiento (sin enlaces largos si excede).
  const compactWithoutLinks = assembled.replace(/\s+\(https?:\/\/[^)]+\)/g, '')
  if (compactWithoutLinks.length <= maxChars) return compactWithoutLinks

  return `${compactWithoutLinks.slice(0, maxChars - 1).trim()}…`
}
