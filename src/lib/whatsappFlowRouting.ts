/**
 * Política de enrutamiento WhatsApp: Ops (tareas/bidireccional) vs Agent (chatbot).
 * Debe mantenerse alineada con `supabase/functions/whatsapp-webhook/index.ts`.
 */

export type WhatsAppFlow = 'ops' | 'agent'

export type WhatsAppInboundRoute =
  | { kind: 'ops_button'; buttonId: string }
  | { kind: 'agent_aiop'; opId: string; action: 'confirm' | 'cancel' }
  | { kind: 'mas_info' }
  | { kind: 'agent_consult' }
  | { kind: 'agent_channel'; channel: 'text' | 'voice' }
  | { kind: 'ops_keyword'; action: 'done' | 'progress' | 'support'; text: string }
  | { kind: 'agent_free_text'; text: string }
  | { kind: 'ops_help'; text?: string }
  | { kind: 'ignore' }

const AIOP_RE = /^aiop:([0-9a-fA-F-]{36}):(ok|no)$/i
const OPS_BUTTON_RE = /^(act|chk|tchk):/i

export function parseAiOpButtonId(raw: string | null | undefined): {
  opId: string
  action: 'confirm' | 'cancel'
} | null {
  const match = AIOP_RE.exec((raw ?? '').trim())
  if (!match) return null
  return {
    opId: match[1],
    action: match[2].toLowerCase() === 'ok' ? 'confirm' : 'cancel',
  }
}

export function isOpsStructuredButton(raw: string | null | undefined): boolean {
  return OPS_BUTTON_RE.test((raw ?? '').trim())
}

export function isMasInfoButton(
  rawId: string | null | undefined,
  title: string | null | undefined
): boolean {
  const fold = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[_-]+/g, ' ')
  const id = fold(rawId ?? '')
  const label = fold(title ?? '')
  const haystack = `${id} ${label}`
  if (
    id === 'ver actividades' ||
    id === '/actividades' ||
    id === 'actividades' ||
    id.includes('ver_actividades') ||
    id.includes('mas informacion') ||
    id === 'more info'
  ) {
    return true
  }
  return (
    /ver actividades/.test(haystack) ||
    /mas informacion/.test(haystack) ||
    /(^|\s)\/?actividades\b/.test(haystack)
  )
}

export function inferOpsTextAction(text: string): 'done' | 'progress' | 'support' | null {
  const t = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!t) return null
  if (/\b(realizada|realizado|hecho|done|completad[oa]|lista|listo)\b/.test(t)) return 'done'
  if (/\b(en progreso|en proceso|proceso|avance|avanzando|progress|trabajando)\b/.test(t)) {
    return 'progress'
  }
  if (/\b(requiero apoyo|necesito apoyo|necesito ayuda|ayuda|support|bloquead[oa]|apoyo)\b/.test(t)) {
    return 'support'
  }
  return null
}

function foldWaText(text: string | null | undefined) {
  return (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
}

/** Ice breaker / comando: «Consulta al Bot», «Iniciar bot», `/consulta`. */
export function isConsultaAlBotText(text: string | null | undefined): boolean {
  const t = foldWaText(text)
  if (!t) return false
  if (
    t === 'consulta al bot' ||
    t === 'consulta' ||
    t === '/consulta' ||
    t === 'iniciar bot' ||
    t === 'iniciar asistente' ||
    t === 'hablar con el bot'
  ) {
    return true
  }
  return (
    /^\/consulta\b/.test(t) ||
    /\bconsulta al bot\b/.test(t) ||
    /\biniciar bot\b/.test(t) ||
    /\biniciar asistente\b/.test(t) ||
    /\bhablar con el bot\b/.test(t)
  )
}

export function parseAiChannelButtonId(
  raw: string | null | undefined
): 'text' | 'voice' | null {
  const id = (raw ?? '').trim().toLowerCase()
  if (id === 'aich:text' || id === 'aich_text') return 'text'
  if (id === 'aich:voice' || id === 'aich_voice') return 'voice'
  return null
}

/** Cambio de canal: «quiero hablar por voz» / «prefiero escribir». */
export function inferAiChannelText(
  text: string | null | undefined
): 'text' | 'voice' | null {
  const t = foldWaText(text)
  if (!t) return null
  if (
    /\b(por voz|hablar por voz|quiero hablar por voz|prefiero voz|llamada de voz)\b/.test(t)
  ) {
    return 'voice'
  }
  if (
    /\b(por mensaje|prefiero escribir|quiero escribir|hablar por mensaje|seguir por texto)\b/.test(
      t
    )
  ) {
    return 'text'
  }
  return null
}

/**
 * Decide la ruta tras evidencia pendiente (evidencia se resuelve antes).
 * - Botones act/chk/tchk → ops (todos)
 * - aiop → agent (interacción de propuestas)
 * - Más información / Ver actividades → mas_info (solo ops; no abre Gemini)
 * - Consulta al Bot / Iniciar bot → agent_consult (selector mensaje/voz)
 * - aich:text|voice o keywords de canal → agent_channel
 * - Keywords ops (Realizada / En proceso / apoyo) → siempre ops, también OKRS
 * - Texto libre agent solo si canUseAi y hay sesión agent activa
 */
export function resolveWhatsAppInboundRoute(input: {
  canUseAi: boolean
  /**
   * @deprecated Las keywords ops siempre aplican; se ignora.
   * Conservado por compat de callers antiguos.
   */
  opsKeywordsForAiUsers?: boolean
  /** True si hubo outbound/agent reciente (p. ej. tras «Consulta al Bot»). */
  agentSessionActive?: boolean
  buttonId?: string | null
  buttonTitle?: string | null
  textBody?: string | null
  messageType?: string | null
}): WhatsAppInboundRoute {
  const buttonId = input.buttonId?.trim() || null
  const buttonTitle = input.buttonTitle?.trim() || null
  const textBody = input.textBody?.trim() || null
  const messageType = input.messageType ?? ''
  const agentSessionActive = input.agentSessionActive === true

  const aiOp = parseAiOpButtonId(buttonId)
  if (aiOp) {
    return { kind: 'agent_aiop', opId: aiOp.opId, action: aiOp.action }
  }

  const channelButton = parseAiChannelButtonId(buttonId)
  if (channelButton) {
    return { kind: 'agent_channel', channel: channelButton }
  }

  if (isMasInfoButton(buttonId, buttonTitle)) {
    return { kind: 'mas_info' }
  }

  if (buttonId && isOpsStructuredButton(buttonId)) {
    return { kind: 'ops_button', buttonId }
  }

  if (
    messageType === 'image' ||
    messageType === 'document' ||
    messageType === 'audio' ||
    messageType === 'video'
  ) {
    return { kind: 'ignore' }
  }

  const freeText =
    textBody ||
    (messageType === 'button' || messageType === 'interactive' ? buttonTitle : null) ||
    null

  if (!freeText) return { kind: 'ignore' }

  if (isConsultaAlBotText(freeText)) {
    return { kind: 'agent_consult' }
  }

  const channelText = inferAiChannelText(freeText)
  if (channelText) {
    return { kind: 'agent_channel', channel: channelText }
  }

  // Ice breaker / texto «Ver actividades» → mismo gate ops que el botón.
  if (isMasInfoButton(null, freeText)) {
    return { kind: 'mas_info' }
  }

  const action = inferOpsTextAction(freeText)
  if (action) return { kind: 'ops_keyword', action, text: freeText }

  if (input.canUseAi && agentSessionActive) {
    return { kind: 'agent_free_text', text: freeText }
  }

  return { kind: 'ops_help', text: freeText }
}

export function flowForRoute(route: WhatsAppInboundRoute): WhatsAppFlow | null {
  switch (route.kind) {
    case 'ops_button':
    case 'ops_keyword':
    case 'ops_help':
      return 'ops'
    case 'agent_aiop':
    case 'agent_free_text':
    case 'agent_consult':
    case 'agent_channel':
      return 'agent'
    case 'mas_info':
      return null // mixed gate
    default:
      return null
  }
}
