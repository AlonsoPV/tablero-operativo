/**
 * Política de enrutamiento WhatsApp: Ops (tareas) vs Agent (chatbot).
 * SSOT: copiar a Edge con `node scripts/sync-whatsapp-routing.mjs`.
 */

export type WhatsAppFlow = 'ops' | 'agent'

/** Intenciones del brief — el clasificador no ejecuta negocio. */
export type WhatsAppIntent =
  | 'QUERY'
  | 'TASK_UPDATE'
  | 'TASK_REPLY'
  | 'CLARIFICATION'
  | 'CANCEL'
  | 'UNKNOWN'

export type WhatsAppInboundRoute =
  | { kind: 'ops_button'; buttonId: string }
  | { kind: 'agent_aiop'; opId: string; action: 'confirm' | 'cancel' }
  | { kind: 'agent_r2_button'; buttonId: string }
  | { kind: 'agent_voice_note' }
  | { kind: 'audio_ambiguous' }
  | { kind: 'mas_info' }
  | { kind: 'agent_consult' }
  | { kind: 'agent_channel'; channel: 'text' | 'voice' }
  | { kind: 'ops_keyword'; action: 'done' | 'progress' | 'support'; text: string }
  | { kind: 'ops_clarify'; action: 'done' | 'progress' | 'support'; text: string; reason: 'none' | 'many' }
  | { kind: 'agent_free_text'; text: string }
  | { kind: 'ops_help'; text?: string }
  | { kind: 'ask_flow'; text: string }
  | { kind: 'cancel'; text: string }
  | { kind: 'ignore' }

const AIOP_RE = /^aiop:([0-9a-fA-F-]{36}):(ok|no)$/i
const R2_BUTTON_RE = /^(?:r2_confirm|r2_edit|r2_cancel):[A-Za-z0-9_:-]{6,180}$/
const OPS_BUTTON_RE = /^(act|chk|tchk):/i
const EXPLICIT_TASK_RE =
  /\b(marca|marcar|actualiza|actualizar|cambia|cambiar|cierra|cerrar|pon|poner)\b[\s\S]{0,40}\b(tarea|accion|acción|checkpoint)\b|\btarea\s*#?\s*\d+/i

export function isR2ProposalButtonId(raw: string | null | undefined): boolean {
  return R2_BUTTON_RE.test((raw ?? '').trim())
}

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
  if (/\b(realizada|realizado|hecho|done|completad[oa]|lista|listo|ya termine)\b/.test(t)) {
    return 'done'
  }
  if (/\b(en progreso|en proceso|proceso|avance|avanzando|progress|trabajando|reportar avance)\b/.test(t)) {
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

/** Consulta de información (no actualización). */
export function looksLikeQueryText(text: string | null | undefined): boolean {
  const t = foldWaText(text)
  if (!t) return false
  if (/[?]/.test(text ?? '')) return true
  if (
    /^(que|qué|cual|cuál|cuantas|cuántas|cuantos|cuántos|como|cómo|donde|dónde|quien|quién)\b/.test(
      t
    )
  ) {
    return true
  }
  return (
    /\b(que tareas|qué tareas|tareas vencidas|acciones vencidas|como van|cómo van|como vamos|okrs?|indicadores|resumen|prioridad|prioriz|bloqueadas|bloqueando|bloqueos|rojas|dashboard|tablero|pendiente hoy|acordamos|ultima reunion|necesita mi atencion|proyecto)\b/.test(
      t
    ) && !EXPLICIT_TASK_RE.test(text ?? '')
  )
}

export function looksLikeCancelText(text: string | null | undefined): boolean {
  const t = foldWaText(text)
  if (!t) return false
  return (
    /^(cancelar|cancelalo|cancelala|cancela|olvidalo|olvidalo|ya no|no actualices)\b/.test(t) ||
    /\bcancelar (actualizacion|actualización|avance|tarea)\b/.test(t)
  )
}

export function looksLikeExplicitTaskUpdate(text: string | null | undefined): boolean {
  return EXPLICIT_TASK_RE.test(text ?? '')
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

export const CHANNEL_SELECTOR_DEBOUNCE_MS = 60_000
export const VOICE_LINK_RESEND_COOLDOWN_MS = 120_000

export function isWithinCooldown(
  sentAtIso: string | null | undefined,
  windowMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!sentAtIso) return false
  const t = new Date(sentAtIso).getTime()
  if (!Number.isFinite(t)) return false
  return nowMs - t >= 0 && nowMs - t < windowMs
}

export function extractVoiceLinkFromPayload(
  payload: Record<string, unknown> | null | undefined
): string | null {
  if (!payload || typeof payload !== 'object') return null
  const direct = payload.link
  if (typeof direct === 'string' && /^https?:\/\//i.test(direct.trim())) {
    return direct.trim()
  }
  const nested = payload.guide_link
  if (typeof nested === 'string' && /^https?:\/\//i.test(nested.trim())) {
    return nested.trim()
  }
  return null
}

export function channelSelectorFallbackText() {
  return [
    '¡Hola! Soy tu asistente operativo de Scrumban.',
    '',
    'Puedo ayudarte a consultar actividades, revisar prioridades, resolver bloqueos y dar seguimiento a tus objetivos.',
    '',
    '¿Cómo prefieres conversar?',
    '',
    'Responde: Por mensaje  o  Por voz',
  ].join('\n')
}

export function askFlowClarificationText() {
  return '¿Quieres consultar esa información o actualizar una tarea? Responde "consultar" o usa los botones del recordatorio para actualizar.'
}

export function askWhichTaskText() {
  return 'Tienes más de una actualización pendiente. ¿Cuál tarea quieres actualizar? Usa el botón del recordatorio o indica el título.'
}

export type ResolveWhatsAppInboundInput = {
  canUseAi: boolean
  /**
   * @deprecated Conservado por compat.
   */
  opsKeywordsForAiUsers?: boolean
  /** True si hubo outbound/agent reciente (p. ej. tras «Consulta al Bot»). */
  agentSessionActive?: boolean
  /**
   * Candidatos OPS correlacionados (followups recientes).
   * undefined = callers legacy (keyword corto → ops_keyword).
   */
  correlatedTargetCount?: number
  /** Hay sesión de aclaración OPS/agent pendiente. */
  clarificationPending?: boolean
  buttonId?: string | null
  buttonTitle?: string | null
  textBody?: string | null
  messageType?: string | null
  /** Habilita el enrutamiento de notas de voz (`audio`) al asistente IA (Fase B, opt-in). */
  voiceNotesEnabled?: boolean
  /** True si el usuario tiene una solicitud de evidencia pendiente (`whatsapp_result_requests.status = 'waiting'`). */
  hasWaitingEvidence?: boolean
}

/**
 * Prioridad: interactivo firmado → comandos → aclaración → QUERY antes que keyword ops
 * → keyword ops solo con correlación inequívoca → UNKNOWN/ask.
 */
export function resolveWhatsAppInboundRoute(input: ResolveWhatsAppInboundInput): WhatsAppInboundRoute {
  const buttonId = input.buttonId?.trim() || null
  const buttonTitle = input.buttonTitle?.trim() || null
  const textBody = input.textBody?.trim() || null
  const messageType = input.messageType ?? ''
  const agentSessionActive = input.agentSessionActive === true
  const correlated =
    typeof input.correlatedTargetCount === 'number' ? input.correlatedTargetCount : undefined

  const aiOp = parseAiOpButtonId(buttonId)
  if (aiOp) {
    return { kind: 'agent_aiop', opId: aiOp.opId, action: aiOp.action }
  }

  if (buttonId && isR2ProposalButtonId(buttonId)) {
    return { kind: 'agent_r2_button', buttonId }
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

  if (messageType === 'audio') {
    if (input.canUseAi && input.voiceNotesEnabled === true) {
      if (input.hasWaitingEvidence === true && agentSessionActive) {
        return { kind: 'audio_ambiguous' }
      }
      if (input.hasWaitingEvidence !== true) {
        return { kind: 'agent_voice_note' }
      }
    }
    return { kind: 'ignore' }
  }

  if (
    messageType === 'image' ||
    messageType === 'document' ||
    messageType === 'video'
  ) {
    return { kind: 'ignore' }
  }

  const freeText =
    textBody ||
    (messageType === 'button' || messageType === 'interactive' ? buttonTitle : null) ||
    null

  if (!freeText) return { kind: 'ignore' }

  if (looksLikeCancelText(freeText)) {
    return { kind: 'cancel', text: freeText }
  }

  if (isConsultaAlBotText(freeText)) {
    return { kind: 'agent_consult' }
  }

  const channelText = inferAiChannelText(freeText)
  if (channelText) {
    return { kind: 'agent_channel', channel: channelText }
  }

  if (isMasInfoButton(null, freeText)) {
    return { kind: 'mas_info' }
  }

  if (input.clarificationPending) {
    return { kind: 'agent_free_text', text: freeText }
  }

  // QUERY antes que keywords ops genéricos (Case A / D).
  if (looksLikeQueryText(freeText) && !looksLikeExplicitTaskUpdate(freeText)) {
    if (input.canUseAi) {
      return { kind: 'agent_free_text', text: freeText }
    }
    return { kind: 'ops_help', text: freeText }
  }

  if (looksLikeExplicitTaskUpdate(freeText)) {
    const action = inferOpsTextAction(freeText) || 'done'
    if (correlated === undefined || correlated === 1) {
      return { kind: 'ops_keyword', action, text: freeText }
    }
    if (correlated === 0) return { kind: 'ops_clarify', action, text: freeText, reason: 'none' }
    return { kind: 'ops_clarify', action, text: freeText, reason: 'many' }
  }

  const action = inferOpsTextAction(freeText)
  if (action) {
    // Ice breakers cortos / confirmaciones: requieren correlación inequívoca cuando se informa.
    if (correlated === undefined) {
      return { kind: 'ops_keyword', action, text: freeText }
    }
    if (correlated === 1) {
      return { kind: 'ops_keyword', action, text: freeText }
    }
    if (correlated === 0) {
      return { kind: 'ops_clarify', action, text: freeText, reason: 'none' }
    }
    return { kind: 'ops_clarify', action, text: freeText, reason: 'many' }
  }

  if (input.canUseAi && (agentSessionActive || looksLikeQueryText(freeText))) {
    return { kind: 'agent_free_text', text: freeText }
  }

  if (input.canUseAi && freeText.length > 12) {
    // Posible consulta sin signos de pregunta claros → no forzar ops_help ciego.
    return { kind: 'ask_flow', text: freeText }
  }

  return { kind: 'ops_help', text: freeText }
}

export function intentForRoute(route: WhatsAppInboundRoute): WhatsAppIntent {
  switch (route.kind) {
    case 'ops_button':
      return 'TASK_REPLY'
    case 'ops_keyword':
      return looksLikeExplicitTaskUpdate(route.text) ? 'TASK_UPDATE' : 'TASK_REPLY'
    case 'ops_clarify':
      return 'CLARIFICATION'
    case 'agent_aiop':
      return route.action === 'cancel' ? 'CANCEL' : 'TASK_UPDATE'
    case 'agent_r2_button':
      return route.buttonId.startsWith('r2_cancel:') ? 'CANCEL' : 'TASK_UPDATE'
    case 'agent_voice_note':
      return 'QUERY'
    case 'audio_ambiguous':
      return 'UNKNOWN'
    case 'cancel':
      return 'CANCEL'
    case 'agent_free_text':
    case 'agent_consult':
    case 'agent_channel':
    case 'mas_info':
      return 'QUERY'
    case 'ask_flow':
      return 'UNKNOWN'
    case 'ops_help':
      return 'UNKNOWN'
    default:
      return 'UNKNOWN'
  }
}

/** Clasificador puro (sin I/O). */
export function classifyWhatsAppIntent(input: ResolveWhatsAppInboundInput): {
  intent: WhatsAppIntent
  route: WhatsAppInboundRoute
  rule: string
} {
  const route = resolveWhatsAppInboundRoute(input)
  const intent = intentForRoute(route)
  return { intent, route, rule: route.kind }
}

export function flowForRoute(route: WhatsAppInboundRoute): WhatsAppFlow | null {
  switch (route.kind) {
    case 'ops_button':
    case 'ops_keyword':
    case 'ops_clarify':
    case 'ops_help':
      return 'ops'
    case 'agent_aiop':
    case 'agent_r2_button':
    case 'agent_voice_note':
    case 'agent_free_text':
    case 'agent_consult':
    case 'agent_channel':
      return 'agent'
    case 'ask_flow':
    case 'cancel':
    case 'audio_ambiguous':
      return null
    case 'mas_info':
      return null
    default:
      return null
  }
}

/** Candidatos OPS desde deliveries (lógica pura para tests). */
export function pickUniqueOpsTarget<T extends { id: string }>(
  candidates: T[]
): { status: 'one'; target: T } | { status: 'none' } | { status: 'many'; targets: T[] } {
  if (candidates.length === 0) return { status: 'none' }
  if (candidates.length === 1) return { status: 'one', target: candidates[0] }
  return { status: 'many', targets: candidates }
}
