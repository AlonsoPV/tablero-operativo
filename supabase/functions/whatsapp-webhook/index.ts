/**
 * WhatsApp webhook — entry compartido (mismo WABA).
 *
 * Autocontenida para Dashboard/--use-api (solo sube este index.ts).
 * Routing/aliases van inlined abajo; SSOT en src/lib/whatsappFlowRouting.ts
 * (sincronizar con: node scripts/sync-whatsapp-routing.mjs).
 *
 * Dos flujos: OpsRouter (tareas) | AgentRouter (Gemini OKRS/Super Admin).
 * send-action / followup-dispatcher son solo Ops. Assistant vive en /api/whatsapp-assistant.
 */
// @ts-nocheck — bundler Deno exige specifier npm:
import { createClient } from 'npm:@supabase/supabase-js@2'

// ---- inlined for Dashboard/--use-api (no sibling modules) ----
// BEGIN_WHATSAPP_FLOW_ROUTING
/**
 * Política de enrutamiento WhatsApp: Ops (tareas) vs Agent (chatbot).
 * SSOT: copiar a Edge con `node scripts/sync-whatsapp-routing.mjs`.
 */

type WhatsAppFlow = 'ops' | 'agent'

/** Intenciones del brief — el clasificador no ejecuta negocio. */
type WhatsAppIntent =
  | 'QUERY'
  | 'TASK_UPDATE'
  | 'TASK_REPLY'
  | 'CLARIFICATION'
  | 'CANCEL'
  | 'UNKNOWN'

type WhatsAppInboundRoute =
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

function isR2ProposalButtonId(raw: string | null | undefined): boolean {
  return R2_BUTTON_RE.test((raw ?? '').trim())
}

function parseAiOpButtonId(raw: string | null | undefined): {
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

function isOpsStructuredButton(raw: string | null | undefined): boolean {
  return OPS_BUTTON_RE.test((raw ?? '').trim())
}

function isMasInfoButton(
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

function inferOpsTextAction(text: string): 'done' | 'progress' | 'support' | null {
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
function looksLikeQueryText(text: string | null | undefined): boolean {
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

const WRITE_REQUEST_START_RE =
  /^(crea|crear|creame|registra|registrar|agrega|agregar|anade|anadir|anota|anotar|genera|generar|programa|programar|agenda|agendar|propon|proponer|cambia|cambiar|cambiala|cambialo|actualiza|actualizar|edita|editar|reprograma|reprogramar|reasigna|reasignar|asigna|asignar|marca|marcar|marcala|pon|poner|ponla|pasa|pasar|mueve|mover|verifica|verificar|envia|enviar|enviame|enviale|manda|mandar|mandame|mandale|prepara|preparar|redacta|redactar|comenta|comentar|reporta|reportar|bloquea|bloquear)\b/
const WRITE_REQUEST_OBJECT_RE =
  /\b(accion|acciones|tarea|tareas|iniciativa|iniciativas|pendiente|pendientes|compromiso|compromisos|bloqueo|fecha|prioridad|responsable|comentario|estado|curso|proceso|ejecucion|hecho|verificado|correo|mail|email|whatsapp|mensaje|seguimiento)\b/

function looksLikeWriteRequestText(text: string | null | undefined): boolean {
  const t = foldWaText(text)
  if (!t) return false
  return WRITE_REQUEST_START_RE.test(t) && WRITE_REQUEST_OBJECT_RE.test(t)
}

function looksLikeCancelText(text: string | null | undefined): boolean {
  const t = foldWaText(text)
  if (!t) return false
  return (
    /^(cancelar|cancelalo|cancelala|cancela|olvidalo|olvidalo|ya no|no actualices)\b/.test(t) ||
    /\bcancelar (actualizacion|actualización|avance|tarea)\b/.test(t)
  )
}

function looksLikeExplicitTaskUpdate(text: string | null | undefined): boolean {
  return EXPLICIT_TASK_RE.test(text ?? '')
}

/** Ice breaker / comando: «Consulta al Bot», «Iniciar bot», `/consulta`. */
function isConsultaAlBotText(text: string | null | undefined): boolean {
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

function parseAiChannelButtonId(
  raw: string | null | undefined
): 'text' | 'voice' | null {
  const id = (raw ?? '').trim().toLowerCase()
  if (id === 'aich:text' || id === 'aich_text') return 'text'
  if (id === 'aich:voice' || id === 'aich_voice') return 'voice'
  return null
}

/** Cambio de canal: «quiero hablar por voz» / «prefiero escribir». */
function inferAiChannelText(
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

const CHANNEL_SELECTOR_DEBOUNCE_MS = 60_000
const VOICE_LINK_RESEND_COOLDOWN_MS = 120_000

function isWithinCooldown(
  sentAtIso: string | null | undefined,
  windowMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!sentAtIso) return false
  const t = new Date(sentAtIso).getTime()
  if (!Number.isFinite(t)) return false
  return nowMs - t >= 0 && nowMs - t < windowMs
}

function extractVoiceLinkFromPayload(
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

function channelSelectorFallbackText() {
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

function askFlowClarificationText() {
  return '¿Quieres consultar esa información o actualizar una tarea? Responde "consultar" o usa los botones del recordatorio para actualizar.'
}

function askWhichTaskText() {
  return 'Tienes más de una actualización pendiente. ¿Cuál tarea quieres actualizar? Usa el botón del recordatorio o indica el título.'
}

type ResolveWhatsAppInboundInput = {
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
  /** Solo true para usuario piloto autorizado; evita cambios a usuarios legacy. */
  writeGuardrailEnabled?: boolean
}

/**
 * Prioridad: interactivo firmado → comandos → aclaración → QUERY antes que keyword ops
 * → keyword ops solo con correlación inequívoca → UNKNOWN/ask.
 */
function resolveWhatsAppInboundRoute(input: ResolveWhatsAppInboundInput): WhatsAppInboundRoute {
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

  if (input.canUseAi && input.writeGuardrailEnabled === true && looksLikeWriteRequestText(freeText)) {
    return { kind: 'agent_free_text', text: freeText }
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

function intentForRoute(route: WhatsAppInboundRoute): WhatsAppIntent {
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
function classifyWhatsAppIntent(input: ResolveWhatsAppInboundInput): {
  intent: WhatsAppIntent
  route: WhatsAppInboundRoute
  rule: string
} {
  const route = resolveWhatsAppInboundRoute(input)
  const intent = intentForRoute(route)
  return { intent, route, rule: route.kind }
}

function flowForRoute(route: WhatsAppInboundRoute): WhatsAppFlow | null {
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
function pickUniqueOpsTarget<T extends { id: string }>(
  candidates: T[]
): { status: 'one'; target: T } | { status: 'none' } | { status: 'many'; targets: T[] } {
  if (candidates.length === 0) return { status: 'none' }
  if (candidates.length === 1) return { status: 'one', target: candidates[0] }
  return { status: 'many', targets: candidates }
}
// END_WHATSAPP_FLOW_ROUTING

// BEGIN_OPERATIONAL_ALIASES
/**
 * Aliases operativos para el flujo WhatsApp (Deno).
 * Mantener alineado con OPERATIONAL_DICTIONARY_VERSION = ops-dict-2026-11-17-mvp
 * en src/features/ai-support/operationalSemantics/operationalDictionary.ts
 * (Edge no importa el bundle Vite; esta es la proyección mínima del SSOT).
 */
const OPERATIONAL_DICTIONARY_VERSION = 'ops-dict-2026-11-17-mvp'

/** Aliases de acción Kanban (consulta / copy). */
const KANBAN_ACTION_ALIASES = [
  'accion',
  'acciones',
  'tarea',
  'tareas',
  'incidencia',
  'pendiente',
  'compromiso',
  'actividad',
] as const

/** «Rojo» coloquial del tablero ≠ solo vencido. */
const BOARD_RED_ALIASES = ['en rojo', 'rojas', 'rojos', 'rojo'] as const

/** Vencimiento / Retraso (CDMX). */
const OVERDUE_ALIASES = ['vencida', 'vencidas', 'vencido', 'en retraso', 'atrasada'] as const

/** Responsable = yo. */
const RESPONSABLE_ALIASES = [
  'responsable',
  'me asignaron',
  'mis acciones',
  'tengo',
] as const

function textMentionsKanbanAction(text: string): boolean {
  const t = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  return KANBAN_ACTION_ALIASES.some((a) => new RegExp(`\\b${a}\\b`).test(t))
}
// END_OPERATIONAL_ALIASES
// ---- end inlined ----

const OPS_FALLBACK_WINDOW_MS = 72 * 60 * 60 * 1000

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('missing_supabase_admin')
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function whatsappConfig() {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim() || ''
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim() || ''
  const graphVersion = Deno.env.get('WHATSAPP_GRAPH_VERSION')?.trim() || 'v20.0'
  const templateName =
    Deno.env.get('WHATSAPP_INITIAL_TEMPLATE_NAME')?.trim() ||
    'nueva_actividad_what2do'
  const templateLanguage =
    Deno.env.get('WHATSAPP_INITIAL_TEMPLATE_LANGUAGE')?.trim() || 'en'
  if (!accessToken || !phoneNumberId) {
    throw new Error('missing_whatsapp_secrets')
  }
  return {
    accessToken,
    phoneNumberId,
    graphVersion,
    templateName,
    templateLanguage,
  }
}

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return digits
}

/** Meta MX: tablero guarda 52XXXXXXXXXX; inbound llega como 521XXXXXXXXXX. */
function phoneVariants(raw: string | null | undefined): string[] {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return []
  const out = new Set<string>([digits])
  if (digits.length === 10) {
    out.add(`52${digits}`)
    out.add(`521${digits}`)
  }
  if (
    digits.length === 12 &&
    digits.startsWith('52') &&
    !digits.startsWith('521')
  ) {
    const local = digits.slice(2)
    out.add(local)
    out.add(`521${local}`)
  }
  if (digits.length === 13 && digits.startsWith('521')) {
    const local = digits.slice(3)
    out.add(local)
    out.add(`52${local}`)
  }
  return [...out]
}

function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key: string) => vars[key] ?? ''
  )
}

async function loadFollowupSettings(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from('whatsapp_followup_settings')
    .select(
      'followup_delay_minutes,followups_per_day,initial_text_template,checkpoint_followup_template,commitment_close_template'
    )
    .eq('id', 'default')
    .maybeSingle()
  return {
    followup_delay_minutes: data?.followup_delay_minutes ?? 5,
    followups_per_day: data?.followups_per_day ?? 1,
    initial_text_template:
      data?.initial_text_template ??
      'Hola {{responsable_nombre}}. Nueva actividad: {{titulo_accion}}. Compromiso: {{fecha_compromiso}}.{{checklist_bloque}}',
    checkpoint_followup_template:
      data?.checkpoint_followup_template ??
      'Seguimiento: {{titulo_accion}}. Checkpoint: {{checkpoint_texto}}. Responde con el boton correspondiente.',
    commitment_close_template:
      data?.commitment_close_template ??
      'Cierre de compromiso: {{titulo_accion}}. Fecha: {{fecha_compromiso}}. Gracias.',
  }
}

async function findWhatsAppIdentity(
  supabase: ReturnType<typeof createClient>,
  usuarioId: string
) {
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id,external_chat_id,status')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', usuarioId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}

async function graphSendMessage(supabase, body: Record<string, unknown>) {
  const context = workerContexts.get(supabase)
  if (context?.uncertain) throw new Error('provider_outcome_unknown')
  const { accessToken, phoneNumberId, graphVersion } = whatsappConfig()
  if (context?.command && !context.commandExecuted) {
    whatsappTrace('WHATSAPP_COMMAND_EXECUTED', { ...workerTrace(context), command: context.command })
    context.commandExecuted = true
  }
  const firstEffect = context && !context.effect
  await context?.mark('provider_request')
  if (context) context.uncertain = true
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`
  const providerStartedAt = performance.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const raw = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    json = { raw }
  }
  if (context) context.uncertain = response.status >= 500
  if (response.status === 429 && firstEffect) await context.releaseRejectedReply()
  if (!response.ok) throw new Error('provider_http_' + response.status)
  if (!extractMessageId(json)) {
    if (context) context.uncertain = true
    throw new Error('provider_missing_message_id')
  }
  if (context) context.sent = true
  whatsappTrace('WHATSAPP_REPLY_SENT', {
    ...workerTrace(context),
    outbound_meta_id: extractMessageId(json),
    provider_duration_ms: Math.round(performance.now() - providerStartedAt),
    accepted_at: new Date().toISOString(),
  })
  return { ok: response.ok, status: response.status, json, raw }
}

function interactiveFollowupPayload(
  to: string,
  bodyText: string,
  buttonIdPrefix: string
) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: `${buttonIdPrefix}:done`, title: 'Realizada' },
          },
          {
            type: 'reply',
            reply: { id: `${buttonIdPrefix}:progress`, title: 'En proceso' },
          },
          {
            type: 'reply',
            reply: { id: `${buttonIdPrefix}:support`, title: 'Requiero apoyo' },
          },
        ],
      },
    },
  }
}

function textPayload(to: string, text: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: false, body: text.slice(0, 4090) },
  }
}

function templatePayload(
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[]
) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: bodyParams.length
        ? [
            {
              type: 'body',
              parameters: bodyParams.map((text) => ({
                type: 'text',
                text: text.slice(0, 1024),
              })),
            },
          ]
        : [],
    },
  }
}

function extractMessageId(json: Record<string, unknown>): string | null {
  const messages = json.messages
  if (!Array.isArray(messages) || messages.length === 0) return null
  const first = messages[0] as { id?: unknown }
  return typeof first.id === 'string' ? first.id : null
}

type WaMessage = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  context?: { id?: string }
  button?: { payload?: string; text?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  image?: { id?: string; mime_type?: string; caption?: string }
  document?: {
    id?: string
    mime_type?: string
    filename?: string
    caption?: string
  }
  audio?: { id?: string; mime_type?: string }
  video?: { id?: string; mime_type?: string; caption?: string }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function parseButtonId(raw: string | null | undefined): {
  kind: 'action' | 'corporate' | 'team' | null
  accionId?: string
  checkpointId?: string
  teamActionId?: string
  checklistIndex?: number
  action: 'done' | 'progress' | 'support' | null
} {
  const value = (raw ?? '').trim()
  const act = /^act:([0-9a-fA-F-]{36}):(done|progress|support)$/i.exec(value)
  if (act) {
    return {
      kind: 'action',
      accionId: act[1],
      action: act[2].toLowerCase() as 'done' | 'progress' | 'support',
    }
  }
  const corp = /^chk:([0-9a-fA-F-]{36}):(done|progress|support)$/i.exec(value)
  if (corp) {
    return {
      kind: 'corporate',
      checkpointId: corp[1],
      action: corp[2].toLowerCase() as 'done' | 'progress' | 'support',
    }
  }
  const team = /^tchk:([0-9a-fA-F-]{36}):(\d+):(done|progress|support)$/i.exec(
    value
  )
  if (team) {
    return {
      kind: 'team',
      teamActionId: team[1],
      checklistIndex: Number(team[2]),
      action: team[3].toLowerCase() as 'done' | 'progress' | 'support',
    }
  }
  return { kind: null, action: null }
}

function inferTextAction(text: string): 'done' | 'progress' | 'support' | null {
  const t = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!t) return null
  if (/\b(realizada|realizado|hecho|done|completad[oa]|lista|listo)\b/.test(t))
    return 'done'
  if (
    /\b(en progreso|en proceso|proceso|avance|avanzando|progress|trabajando)\b/.test(
      t
    )
  ) {
    return 'progress'
  }
  if (
    /\b(requiero apoyo|necesito apoyo|necesito ayuda|ayuda|support|bloquead[oa]|apoyo)\b/.test(
      t
    )
  ) {
    return 'support'
  }
  return null
}

function isVerActividadesButton(
  rawId: string | null | undefined,
  title: string | null | undefined
) {
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
  // Plantilla Meta: botón "Más información" (quick reply) o "Ver actividades" / comando /actividades
  return (
    /ver actividades/.test(haystack) ||
    /mas informacion/.test(haystack) ||
    /(^|\s)\/?actividades\b/.test(haystack)
  )
}

function inboundPreview(message: WaMessage): string {
  const type = message.type ?? 'unknown'
  const text = message.text?.body?.trim()
  if (text) return text
  const buttonTitle =
    message.interactive?.button_reply?.title ||
    message.button?.text ||
    message.interactive?.list_reply?.title
  if (buttonTitle) return buttonTitle
  const caption =
    message.image?.caption ||
    message.document?.caption ||
    message.video?.caption ||
    message.document?.filename
  if (caption) return caption
  if (type === 'image') return '[Imagen]'
  if (type === 'document') return '[Documento]'
  if (type === 'audio') return '[Audio]'
  if (type === 'video') return '[Video]'
  if (type === 'interactive' || type === 'button') return '[Botón]'
  return `[${type}]`
}

async function upsertThreadMessage(
  supabase: ReturnType<typeof adminClient>,
  row: Record<string, unknown>
) {
  const metaId =
    typeof row.meta_message_id === 'string' ? row.meta_message_id : null
  if (metaId) {
    const { data: existing } = await supabase
      .from('whatsapp_messages')
      .select('id,payload')
      .eq('meta_message_id', metaId)
      .maybeSingle()
    if (existing?.id) {
      const incomingPayload = row.payload as Record<string, unknown> | undefined
      if (row.direction === 'inbound' && incomingPayload?.flow) {
        const { error } = await supabase
          .from('whatsapp_messages')
          .update({ payload: { ...((existing.payload as Record<string, unknown>) ?? {}), ...incomingPayload } })
          .eq('id', existing.id)
        if (error) throw error
      }
      return existing.id as string
    }
  }
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert(row)
    .select('id')
    .maybeSingle()
  if (error) {
    // Carrera por meta_message_id único
    if (metaId && String(error.message || '').includes('meta_message_id')) {
      const { data: again } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('meta_message_id', metaId)
        .maybeSingle()
      return (again?.id as string | undefined) ?? null
    }
    throw error
  }
  return (data?.id as string | undefined) ?? null
}

/** Normaliza error de status webhook Meta a JSON estable (code/title/message). */
function normalizeMetaStatusError(err: unknown): {
  errorMessage: string
  errorCode: number | null
  verdict: 'ERROR_META'
} {
  const root =
    err && typeof err === 'object' && !Array.isArray(err)
      ? (err as Record<string, unknown>)
      : null
  const codeRaw = root?.code
  const errorCode =
    typeof codeRaw === 'number'
      ? codeRaw
      : typeof codeRaw === 'string' && /^\d+$/.test(codeRaw)
        ? Number(codeRaw)
        : null
  const payload = {
    code: errorCode,
    title: typeof root?.title === 'string' ? root.title : null,
    message: typeof root?.message === 'string' ? root.message : null,
    error_data: root?.error_data ?? null,
    href: typeof root?.href === 'string' ? root.href : null,
    verdict: 'ERROR_META' as const,
    source: 'meta_status_webhook',
  }
  return {
    errorMessage: JSON.stringify(payload).slice(0, 2000),
    errorCode,
    verdict: 'ERROR_META',
  }
}

async function applyMetaStatus(
  supabase: ReturnType<typeof adminClient>,
  statusEvent: {
    id?: string
    status?: string
    timestamp?: string
    errors?: unknown[]
  }
) {
  const metaId = statusEvent.id
  const status = statusEvent.status
  if (!metaId || !status) return

  const ts = statusEvent.timestamp
    ? new Date(Number(statusEvent.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  const patch: Record<string, unknown> = {}
  let failedNorm: ReturnType<typeof normalizeMetaStatusError> | null = null
  if (status === 'sent') {
    patch.delivery_status = 'sent'
    patch.sent_at = ts
  } else if (status === 'delivered') {
    patch.delivery_status = 'delivered'
    patch.delivered_at = ts
  } else if (status === 'read') {
    patch.delivery_status = 'read'
    patch.read_at = ts
  } else if (status === 'failed') {
    patch.delivery_status = 'failed'
    patch.failed_at = ts
    const err = Array.isArray(statusEvent.errors) ? statusEvent.errors[0] : null
    failedNorm = normalizeMetaStatusError(
      err ?? { message: 'meta_status_failed' }
    )
    patch.error_message = failedNorm.errorMessage
  } else {
    return
  }

  // No degradar read → delivered, etc.
  const { data: current } = await supabase
    .from('whatsapp_messages')
    .select('id,delivery_status,payload')
    .eq('meta_message_id', metaId)
    .maybeSingle()

  if (current?.id) {
    const rank: Record<string, number> = {
      queued: 0,
      sent: 1,
      delivered: 2,
      read: 3,
      failed: 99,
    }
    const cur = rank[String(current.delivery_status)] ?? 0
    const next = rank[String(patch.delivery_status)] ?? 0
    // Solo avanzar (o marcar failed). No degradar read→delivered ni delivered→sent.
    if (next > cur || patch.delivery_status === 'failed') {
      if (failedNorm) {
        const prevPayload =
          current.payload &&
          typeof current.payload === 'object' &&
          !Array.isArray(current.payload)
            ? (current.payload as Record<string, unknown>)
            : {}
        patch.payload = {
          ...prevPayload,
          delivery_verdict: failedNorm.verdict,
          meta_error_code: failedNorm.errorCode,
          meta_status: 'failed',
        }
      } else if (status === 'delivered' || status === 'read') {
        const prevPayload =
          current.payload &&
          typeof current.payload === 'object' &&
          !Array.isArray(current.payload)
            ? (current.payload as Record<string, unknown>)
            : {}
        patch.payload = {
          ...prevPayload,
          delivery_verdict: 'OK_ENTREGADO',
          meta_status: status,
        }
      }
      await supabase
        .from('whatsapp_messages')
        .update(patch)
        .eq('id', current.id)
      whatsappTrace('WHATSAPP_DELIVERY_UPDATED', {
        job_id: (current.payload as Record<string, unknown> | null)?.correlation_id,
        outbound_meta_id: metaId,
        status,
        provider_event_at: ts,
      })
    }
  }

  if (status === 'failed') {
    await supabase
      .from('action_delivery_log')
      .update({
        delivery_status: 'failed',
        error_message: (patch.error_message as string) || 'meta_status_failed',
      })
      .eq('external_message_id', metaId)
      .eq('channel', 'whatsapp')
    console.error('whatsapp meta delivery failed', {
      wamid: metaId,
      code: failedNorm?.errorCode ?? null,
      error: patch.error_message,
    })
  }
}

async function replyText(
  supabase: ReturnType<typeof adminClient>,
  to: string,
  body: string,
  usuarioId?: string | null,
  extras?: Record<string, unknown>
) {
  try {
    const graphBody = textPayload(to, body)
    if (extras?.preview_url === true && graphBody.text) {
      graphBody.text.preview_url = true
    }
    const result = await graphSendMessage(supabase, graphBody)
    const metaId = extractMessageId(result.json)
    const flow = typeof extras?.flow === 'string' ? extras.flow : 'ops'
    await upsertThreadMessage(supabase, {
      wa_id: to,
      usuario_id: usuarioId ?? null,
      direction: 'outbound',
      source: 'automation',
      message_kind: 'text',
      body_text: body,
      meta_message_id: metaId,
      delivery_status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.raw.slice(0, 2000),
      sent_at: result.ok ? new Date().toISOString() : null,
      failed_at: result.ok ? null : new Date().toISOString(),
      payload: {
        request: graphBody,
        response: result.json,
        source: 'webhook_auto_reply',
        correlation_id: workerContexts.get(supabase)?.id,
        flow,
        ...(extras ?? {}),
      },
    })
  } catch (error) {
    throw error
  }
}

function whatsappAiEnabled() {
  const flag = (Deno.env.get('WHATSAPP_AI_ENABLED') || '').trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'no') return false
  if (flag === '1' || flag === 'true' || flag === 'yes') return true
  // Si el cerebro está configurado, encender aunque falte el flag explícito.
  const secret = Deno.env.get('WHATSAPP_ASSISTANT_SECRET')?.trim() || ''
  const base = (
    Deno.env.get('APP_URL') ||
    Deno.env.get('VITE_APP_URL') ||
    ''
  ).trim()
  return Boolean(secret && base)
}

function interactiveAiOpPayload(to: string, bodyText: string, opId: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: `aiop:${opId}:ok`, title: 'Confirmar' },
          },
          {
            type: 'reply',
            reply: { id: `aiop:${opId}:no`, title: 'Cancelar' },
          },
        ],
      },
    },
  }
}

function interactiveChannelSelectorPayload(to: string) {
  const bodyText = [
    '¡Hola! Soy tu asistente operativo de Scrumban.',
    '',
    'Puedo ayudarte a consultar actividades, revisar prioridades, resolver bloqueos y dar seguimiento a tus objetivos.',
    '',
    '¿Cómo prefieres conversar?',
  ].join('\n')
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'aich:text', title: 'Por mensaje' } },
          { type: 'reply', reply: { id: 'aich:voice', title: 'Por voz' } },
        ],
      },
    },
  }
}

function voiceLinkMessageBody(link: string) {
  return [
    'Perfecto. Puedes hablar conmigo por voz desde este enlace:',
    '',
    link,
    '',
    'Al abrirlo, podrás iniciar la conversación con tu asistente operativo.',
  ].join('\n')
}

function isWithinCooldownMs(
  sentAtIso: string | null | undefined,
  windowMs: number
) {
  if (!sentAtIso) return false
  const t = new Date(sentAtIso).getTime()
  if (!Number.isFinite(t)) return false
  const delta = Date.now() - t
  return delta >= 0 && delta < windowMs
}

async function findRecentOutboundByEvent(
  supabase: ReturnType<typeof adminClient>,
  waId: string,
  eventName: string,
  windowMs: number
): Promise<{ created_at: string; payload: Record<string, unknown> } | null> {
  const variants = phoneVariants(waId)
  const since = new Date(Date.now() - windowMs).toISOString()
  let query = supabase
    .from('whatsapp_messages')
    .select('payload,created_at')
    .eq('direction', 'outbound')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)
  if (variants.length > 0) {
    query = query.in('wa_id', variants)
  } else {
    query = query.eq('wa_id', waId)
  }
  const { data, error } = await query
  if (error) {
    console.error('whatsapp-webhook recent outbound lookup', error.message)
    return null
  }
  for (const row of data ?? []) {
    const payload =
      row.payload &&
      typeof row.payload === 'object' &&
      !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {}
    if (
      payload.event === eventName &&
      isWithinCooldownMs(String(row.created_at ?? ''), windowMs)
    ) {
      return { created_at: String(row.created_at), payload }
    }
  }
  return null
}

async function replyChannelSelector(
  supabase: ReturnType<typeof adminClient>,
  to: string,
  usuarioId: string
) {
  const recent = await findRecentOutboundByEvent(
    supabase,
    to,
    'bot_start_selector_sent',
    CHANNEL_SELECTOR_DEBOUNCE_MS
  )
  if (recent) {
    await replyText(
      supabase,
      to,
      'Usa las opciones de arriba: Por mensaje o Por voz. Si no las ves, responde con esas palabras.',
      usuarioId,
      {
        flow: 'agent',
        agent_consult: true,
        event: 'bot_start_selector_debounced',
      }
    )
    return
  }

  try {
    const graphBody = interactiveChannelSelectorPayload(to)
    const result = await graphSendMessage(supabase, graphBody)
    const metaId = extractMessageId(result.json)
    await upsertThreadMessage(supabase, {
      wa_id: to,
      usuario_id: usuarioId,
      direction: 'outbound',
      source: 'automation',
      message_kind: 'interactive',
      body_text: 'Selector de canal: Por mensaje / Por voz',
      meta_message_id: metaId,
      delivery_status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.raw.slice(0, 2000),
      sent_at: result.ok ? new Date().toISOString() : null,
      failed_at: result.ok ? null : new Date().toISOString(),
      payload: {
        request: graphBody,
        response: result.json,
        source: 'webhook_channel_selector',
        flow: 'agent',
        agent_consult: true,
        event: 'bot_start_selector_sent',
      },
    })
    if (!result.ok) {
      await replyText(supabase, to, channelSelectorFallbackText(), usuarioId, {
        flow: 'agent',
        agent_consult: true,
        event: 'bot_start_selector_text_fallback',
        interactive_failed: true,
      })
    }
  } catch (error) {
    console.error('whatsapp channel selector failed', error)
    await replyText(supabase, to, channelSelectorFallbackText(), usuarioId, {
      flow: 'agent',
      agent_consult: true,
      event: 'bot_start_selector_text_fallback',
      interactive_exception: true,
    })
  }
}

async function handleAgentChannelText(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  await replyText(
    supabase,
    params.waId,
    [
      'Perfecto. Podemos continuar por aquí.',
      '',
      'Puedes preguntarme por tus pendientes, prioridades, acciones bloqueadas u OKRs. ¿Qué necesitas revisar?',
    ].join('\n'),
    params.usuarioId,
    { flow: 'agent', agent_consult: true, event: 'channel_text_selected' }
  )
}

async function createAndSendVoiceLink(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  const recent = await findRecentOutboundByEvent(
    supabase,
    params.waId,
    'voice_link_sent',
    VOICE_LINK_RESEND_COOLDOWN_MS
  )
  const recentLink = recent ? extractVoiceLinkFromPayload(recent.payload) : null
  if (recentLink) {
    await replyText(
      supabase,
      params.waId,
      voiceLinkMessageBody(recentLink),
      params.usuarioId,
      {
        flow: 'agent',
        agent_consult: true,
        event: 'voice_link_sent',
        link: recentLink,
        preview_url: true,
        resent: true,
      }
    )
    return
  }

  const secret = Deno.env.get('WHATSAPP_ASSISTANT_SECRET')?.trim() || ''
  const base = (Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || '')
    .trim()
    .replace(/\/$/, '')
  if (!secret || !base) {
    await replyText(
      supabase,
      params.waId,
      'No pude generar la liga de voz ahora (configuración incompleta). Intenta Por mensaje o vuelve en unos minutos.',
      params.usuarioId,
      { flow: 'agent', event: 'voice_link_config_missing' }
    )
    return
  }

  try {
    const response = await fetch(`${base}/api/create-guide-user-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whatsapp-assistant-secret': secret,
      },
      body: JSON.stringify({
        usuario_id: params.usuarioId,
        expires_in_days: 7,
        source: 'whatsapp',
      }),
    })
    const json = (await response.json().catch(() => ({}))) as {
      link?: string
      error?: string
    }
    if (!response.ok || !json.link) {
      await replyText(
        supabase,
        params.waId,
        json.error?.slice(0, 180) ||
          'No pude generar la liga de voz ahora. Intenta de nuevo en unos minutos o usa Por mensaje.',
        params.usuarioId,
        { flow: 'agent', event: 'voice_link_error' }
      )
      return
    }
    await replyText(
      supabase,
      params.waId,
      voiceLinkMessageBody(json.link),
      params.usuarioId,
      {
        flow: 'agent',
        agent_consult: true,
        event: 'voice_link_sent',
        link: json.link,
        preview_url: true,
      }
    )
  } catch (error) {
    console.error('whatsapp voice link', error)
    await replyText(
      supabase,
      params.waId,
      'No pude generar la liga de voz ahora. Intenta de nuevo en unos minutos.',
      params.usuarioId,
      { flow: 'agent', event: 'voice_link_exception' }
    )
  }
}

async function replyAi(
  supabase: ReturnType<typeof adminClient>,
  to: string,
  body: string,
  usuarioId: string | null,
  proposalId?: string | null,
  interactiveButtons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>
) {
  try {
    const customButtons = Array.isArray(interactiveButtons)
      ? interactiveButtons
          .filter(
            (b) =>
              b?.type === 'reply' &&
              typeof b.reply?.id === 'string' &&
              b.reply.id.trim().length > 0 &&
              typeof b.reply?.title === 'string' &&
              b.reply.title.trim().length > 0
          )
          .slice(0, 3)
      : []
    const canCustomButtons = customButtons.length > 0 && body.length <= 1024
    const canButtons =
      canCustomButtons ||
      Boolean(body.length <= 1024 && proposalId && /^[0-9a-fA-F-]{36}$/.test(proposalId))
    const graphBody = canCustomButtons
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: body.slice(0, 1024) },
            action: {
              buttons: customButtons.map((b) => ({
                type: 'reply',
                reply: {
                  id: b.reply.id.slice(0, 256),
                  title: b.reply.title.slice(0, 20),
                },
              })),
            },
          },
        }
      : canButtons
        ? interactiveAiOpPayload(to, body, proposalId as string)
        : textPayload(to, body)
    const result = await graphSendMessage(supabase, graphBody)
    const metaId = extractMessageId(result.json)
    try {
      await upsertThreadMessage(supabase, {
        wa_id: to,
        usuario_id: usuarioId ?? null,
        direction: 'outbound',
        source: 'automation',
        message_kind: canButtons ? 'interactive' : 'text',
        body_text: body,
        meta_message_id: metaId,
        delivery_status: result.ok ? 'sent' : 'failed',
        error_message: result.ok ? null : result.raw.slice(0, 2000),
        sent_at: result.ok ? new Date().toISOString() : null,
        failed_at: result.ok ? null : new Date().toISOString(),
        payload: {
          request: graphBody,
          response: result.json,
          source: 'webhook_ai_reply',
          correlation_id: workerContexts.get(supabase)?.id,
          flow: 'agent',
        },
      })
    } catch (persistError) {
      whatsappTrace('WHATSAPP_PROCESSING_FAILED', {
        ...workerTrace(workerContexts.get(supabase)),
        stage: 'ai_reply_persist',
        code: persistError instanceof Error ? persistError.message.slice(0, 120) : 'persist_failed',
      })
    }
  } catch (error) {
    whatsappTrace('WHATSAPP_PROCESSING_FAILED', {
      ...workerTrace(workerContexts.get(supabase)),
      stage: 'ai_reply',
      code: 'ai_reply_failed',
    })
    throw error
  }
}

async function canUseAiWhatsApp(
  supabase: ReturnType<typeof adminClient>,
  usuarioId: string
): Promise<boolean> {
  if (!whatsappAiEnabled()) return false
  const { data: allowed, error } = await supabase.rpc(
    'can_use_ai_whatsapp_for_usuario',
    {
      p_usuario_id: usuarioId,
    }
  )
  if (error) {
    console.error('whatsapp-webhook AI access rpc', error.message)
    return false
  }
  return allowed === true
}

/** Sesión agent: outbound reciente con flow=agent (p. ej. tras «Consulta al Bot» o reply Gemini). */
async function hasActiveAgentSession(
  supabase: ReturnType<typeof adminClient>,
  waId: string
): Promise<boolean> {
  const variants = phoneVariants(waId)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('whatsapp_messages')
    .select('payload,created_at')
    .eq('direction', 'outbound')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(25)
  if (variants.length > 0) {
    query = query.in('wa_id', variants)
  } else {
    query = query.eq('wa_id', waId)
  }
  const { data, error } = await query
  if (error) {
    console.error('whatsapp-webhook agent session lookup', error.message)
    return false
  }
  return (data ?? []).some((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    return payload.flow === 'agent' || payload.agent_consult === true
  })
}

type InboundRoute = WhatsAppInboundRoute

/** Etiqueta de hilo; mas_info / ask_flow / cancel → ops por defecto en bandeja. */
function inboundFlowForRoute(route: InboundRoute): 'ops' | 'agent' {
  const flow = flowForRoute(route)
  if (flow) return flow
  return 'ops'
}

function parseAiOpButton(raw: string | null | undefined) {
  return parseAiOpButtonId(raw)
}

const EDGE_PILOT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseEdgePilotAllowlist(raw: string | undefined): {
  uuids: Set<string>
  phones: Set<string>
  size: number
} {
  const uuids = new Set<string>()
  const phones = new Set<string>()
  for (const token of (raw ?? '').split(/[\s,;]+/)) {
    const trimmed = token.trim()
    if (!trimmed) continue
    if (EDGE_PILOT_UUID_RE.test(trimmed)) {
      uuids.add(trimmed.toLowerCase())
      continue
    }
    const digits = trimmed.replace(/\D+/g, '')
    if (digits.length >= 10 && digits.length <= 15 && /^[+\d().\-\s]+$/.test(trimmed)) {
      phones.add(digits)
    }
  }
  return { uuids, phones, size: uuids.size + phones.size }
}

/**
 * Aislamiento fail-closed en Edge idéntico al gate de Vercel (`whatsappPilotGate.ts`):
 * garantiza que notas de voz conversacionales y botones R2 nunca afecten usuarios fuera del piloto.
 */
function isEdgeWhatsAppPilotAllowed(input: {
  usuarioId: string
  waId: string
  active: boolean
  aiAuthorized: boolean
  dbAllowlist?: Set<string> | null
}): boolean {
  if (!EDGE_PILOT_UUID_RE.test(input.usuarioId.trim())) return false
  if (input.active !== true || input.aiAuthorized !== true) return false

  const pilotEnabled = Deno.env.get('WHATSAPP_PILOT_ENABLED') === '1'
  const allowlist = parseEdgePilotAllowlist(
    Deno.env.get('WHATSAPP_ORCHESTRATOR_PILOT_USERS')
  )

  if (pilotEnabled) {
    if (allowlist.size === 0) return false
    const inEnv =
      allowlist.uuids.has(input.usuarioId.trim().toLowerCase()) ||
      Boolean(
        input.waId.replace(/\D+/g, '').length >= 10 &&
          input.waId.replace(/\D+/g, '').length <= 15 &&
          allowlist.phones.has(input.waId.replace(/\D+/g, ''))
      )
    if (!inEnv) return false
    if (input.dbAllowlist) {
      if (input.dbAllowlist.size === 0) return false
      if (!input.dbAllowlist.has(input.usuarioId.trim().toLowerCase())) return false
    }
    return true
  }

  const globalEnabled =
    Deno.env.get('WHATSAPP_GLOBAL_ORCHESTRATOR_ENABLED') === '1' &&
    Deno.env.get('AGENT_ORCHESTRATOR_R1') === '1'
  return globalEnabled && allowlist.size === 0
}

/** Homologado con api/_shared/whatsappPilotGate.ts: env ∩ DB; global OFF salvo flags explícitos. */
async function loadEdgeDbAllowlist(
  supabase: ReturnType<typeof adminClient>
): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase
      .from('agent_execution_gate')
      .select('allowed_usuario_ids')
      .eq('id', true)
      .maybeSingle()
    if (error || !data) return null
    const raw = Array.isArray(data.allowed_usuario_ids) ? data.allowed_usuario_ids : []
    return new Set(
      raw
        .map((id) => String(id).trim().toLowerCase())
        .filter((id) => EDGE_PILOT_UUID_RE.test(id))
    )
  } catch {
    return null
  }
}

async function isActiveUsuarioEdge(
  supabase: ReturnType<typeof adminClient>,
  usuarioId: string
): Promise<boolean> {
  if (!EDGE_PILOT_UUID_RE.test(usuarioId.trim())) return false
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,activo')
    .eq('id', usuarioId)
    .maybeSingle()
  if (error || !data?.id) return false
  return data.activo === true
}

/** Botones / media que no requieren RPC can_use_ai. null = hay que resolver texto libre. */
function resolveStructuredInboundRoute(input: {
  buttonId?: string | null
  buttonTitle?: string | null
  messageType?: string | null
}): InboundRoute | null {
  const buttonId = input.buttonId?.trim() || null
  const buttonTitle = input.buttonTitle?.trim() || null
  const messageType = input.messageType ?? ''

  const aiOp = parseAiOpButton(buttonId)
  if (aiOp) return { kind: 'agent_aiop', opId: aiOp.opId, action: aiOp.action }
  if (buttonId && isR2ProposalButtonId(buttonId)) {
    return { kind: 'agent_r2_button', buttonId }
  }

  const early = resolveWhatsAppInboundRoute({
    canUseAi: false,
    buttonId,
    buttonTitle,
    messageType,
    textBody: null,
  })
  if (early.kind === 'agent_channel') return early
  if (early.kind === 'mas_info') return early
  if (early.kind === 'ops_button') return early
  const voiceNotesFlag = Deno.env.get('WHATSAPP_VOICE_NOTES_ENABLED') === '1'
  if (
    early.kind === 'ignore' &&
    (messageType === 'image' ||
      messageType === 'document' ||
      (messageType === 'audio' && !voiceNotesFlag) ||
      messageType === 'video')
  ) {
    return early
  }
  return null
}

/**
 * Compuerta Grupo B para notas de voz en Supabase Edge:
 * exige WHATSAPP_VOICE_NOTES_ENABLED=1 y, si existe WHATSAPP_VOICE_NOTES_PILOT_USERS,
 * restringe estrictamente a las identidades (usuario_id / wa_id) listadas (sin comodines).
 */
function isVoiceNotesAllowedForUser(input: {
  usuarioId: string
  waId: string
  active: boolean
  aiAuthorized: boolean
  dbAllowlist?: Set<string> | null
}): boolean {
  if (Deno.env.get('WHATSAPP_VOICE_NOTES_ENABLED') !== '1') return false
  if (!isEdgeWhatsAppPilotAllowed(input)) return false
  const voiceScopedRaw = (Deno.env.get('WHATSAPP_VOICE_NOTES_PILOT_USERS') || '').trim()
  if (!voiceScopedRaw) return true
  const scoped = parseEdgePilotAllowlist(voiceScopedRaw)
  if (scoped.size === 0) return false
  const userKey = input.usuarioId.trim().toLowerCase()
  const waDigits = input.waId.replace(/\D+/g, '')
  return (
    scoped.uuids.has(userKey) ||
    Boolean(waDigits.length >= 10 && waDigits.length <= 15 && scoped.phones.has(waDigits))
  )
}

async function hasWaitingEvidenceRequest(
  supabase: ReturnType<typeof adminClient>,
  waId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString()
  const variants = phoneVariants(waId)
  const { data } = await supabase
    .from('whatsapp_result_requests')
    .select('id')
    .in('wa_id', variants.length ? variants : [waId])
    .eq('status', 'waiting')
    .gt('expires_at', nowIso)
    .limit(1)
    .maybeSingle()
  return Boolean(data?.id)
}

async function callWhatsAppAssistant(input: {
  action: 'chat' | 'confirm' | 'cancel' | 'voice_note'
  waId: string
  usuarioId: string
  text?: string
  opId?: string
  buttonId?: string
  mediaId?: string
  mimeType?: string | null
}): Promise<{
  text: string
  proposals?: Array<{ id?: string; title?: string; summary?: string }>
  interactiveButtons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>
  handoff?: string | null
  suppressReply?: boolean
} | null> {
  const secret = Deno.env.get('WHATSAPP_ASSISTANT_SECRET')?.trim() || ''
  const base = (Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || '')
    .trim()
    .replace(/\/$/, '')
  if (!secret || !base) {
    console.error(
      'whatsapp-webhook AI missing APP_URL or WHATSAPP_ASSISTANT_SECRET'
    )
    return null
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${base}/api/whatsapp-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whatsapp-assistant-secret': secret,
      },
      signal: controller.signal,
      body: JSON.stringify({
        action: input.action,
        wa_id: input.waId,
        usuario_id: input.usuarioId,
        text: input.text ?? '',
        op_id: input.opId ?? '',
        ...(input.buttonId ? { button_id: input.buttonId } : {}),
        ...(input.mediaId ? { media_id: input.mediaId } : {}),
        ...(input.mimeType ? { mime_type: input.mimeType } : {}),
      }),
    })
    const json = (await response.json()) as {
      text?: unknown
      proposals?: Array<{ id?: string; title?: string; summary?: string }>
      interactiveButtons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>
      handoff?: unknown
      error?: unknown
    }
    const text = typeof json.text === 'string' ? json.text.trim() : ''
    const handoff = typeof json.handoff === 'string' ? json.handoff : null
    if (!text)
      return {
        text: 'No pude consultar el tablero ahora.',
        proposals: [],
        interactiveButtons: [],
        handoff,
      }
    return {
      text,
      proposals: Array.isArray(json.proposals) ? json.proposals : [],
      interactiveButtons: Array.isArray(json.interactiveButtons)
        ? json.interactiveButtons
        : [],
      handoff,
    }
  } catch (error) {
    console.error('whatsapp-webhook AI call failed', error)
    return {
      text: 'No pude consultar el tablero ahora.',
      proposals: [],
      interactiveButtons: [],
      handoff: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function maybeHandleWhatsAppAi(
  supabase: ReturnType<typeof adminClient>,
  input: {
    waId: string
    usuarioId: string
    action: 'chat' | 'confirm' | 'cancel' | 'voice_note'
    text?: string
    opId?: string
    buttonId?: string
    mediaId?: string
    mimeType?: string | null
    /** Si ya se llamó a can_use_ai_whatsapp_for_usuario, evitar RPC duplicado. */
    aiAllowed?: boolean
  }
): Promise<boolean> {
  if (!whatsappAiEnabled()) return false
  let allowed = input.aiAllowed
  if (allowed === undefined) {
    const { data: rpcAllowed, error } = await supabase.rpc(
      'can_use_ai_whatsapp_for_usuario',
      {
        p_usuario_id: input.usuarioId,
      }
    )
    if (error) {
      console.error('whatsapp-webhook AI access rpc', error.message)
      return false
    }
    allowed = rpcAllowed === true
  }
  if (!allowed) return false
  const result = await callWhatsAppAssistant({
    action: input.action,
    waId: input.waId,
    usuarioId: input.usuarioId,
    text: input.text,
    opId: input.opId,
    buttonId: input.buttonId,
    mediaId: input.mediaId,
    mimeType: input.mimeType,
  })
  if (result?.suppressReply === true) {
    return true
  }
  const text = result?.text || 'No pude consultar el tablero ahora.'
  const proposalId = result?.proposals?.[0]?.id
  await replyAi(
    supabase,
    input.waId,
    text,
    input.usuarioId,
    proposalId,
    result?.interactiveButtons
  )
  if (result?.handoff === 'task_update') {
    await upsertFlowSession(supabase, {
      phone: normalizePhone(input.waId) || input.waId,
      usuarioId: input.usuarioId,
      flowType: 'task_update',
      status: 'awaiting_clarification',
      intent: 'TASK_UPDATE',
      meta: { source: 'agent_handoff' },
    })
  }
  return true
}

async function downloadWhatsAppMedia(mediaId: string): Promise<{
  bytes: Uint8Array
  mimeType: string
  fileName: string
}> {
  const { accessToken, graphVersion } = whatsappConfig()
  const metaRes = await fetch(
    `https://graph.facebook.com/${graphVersion}/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
  if (!metaRes.ok || !meta.url) throw new Error('media_meta_failed')
  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!binRes.ok) throw new Error('media_download_failed')
  const mimeType =
    meta.mime_type ||
    binRes.headers.get('content-type') ||
    'application/octet-stream'
  const bytes = new Uint8Array(await binRes.arrayBuffer())
  const ext = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('jpeg') || mimeType.includes('jpg')
      ? 'jpg'
      : mimeType.includes('pdf')
        ? 'pdf'
        : mimeType.includes('csv')
          ? 'csv'
          : mimeType.includes('sheet') || mimeType.includes('excel')
            ? 'xlsx'
            : 'bin'
  return { bytes, mimeType, fileName: `${mediaId}.${ext}` }
}

async function findUsuarioByWa(
  supabase: ReturnType<typeof adminClient>,
  waId: string
) {
  const variants = phoneVariants(waId)
  if (variants.length === 0) return null
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id')
    .eq('channel', 'whatsapp')
    .eq('status', 'active')
    .or(
      `external_user_id.in.(${variants.join(',')}),external_chat_id.in.(${variants.join(',')})`
    )
    .limit(2)
  if (data?.length !== 1) return null
  const { data: user } = await supabase
    .from('usuarios')
    .select('id,activo')
    .eq('id', data[0].usuario_id)
    .eq('activo', true)
    .maybeSingle()
  return user ? data[0] : null
}

async function applyActionResponse(supabase, params) {
  const { data } = await supabase.rpc('whatsapp_apply_action', {
    p_event: workerContexts.get(supabase).id,
    p_usuario: params.usuarioId,
    p_accion: params.accionId,
    p_action: params.action,
    p_wa: params.waId,
    p_reason: params.reason ?? null,
    p_checkpoint: params.checkpointId ?? null,
  })
  return data
}
async function handleCorporateAction(supabase, params) {
  const { data: checkpoint } = await supabase
    .from('accion_checkpoints')
    .select('accion_id')
    .eq('id', params.checkpointId)
    .maybeSingle()
  if (!checkpoint) return { ok: false }
  return applyActionResponse(supabase, {
    ...params,
    accionId: checkpoint.accion_id,
  })
}

async function applyTeamMutation(supabase, params) {
  const { data } = await supabase.rpc('whatsapp_apply_team', {
    p_event: workerContexts.get(supabase).id,
    p_usuario: params.usuarioId,
    p_team: params.teamActionId,
    p_index: params.checklistIndex,
    p_action: params.action,
    p_wa: params.waId,
    p_reason: params.reason ?? null,
  })
  return data
}
const handleTeamAction = applyTeamMutation

async function requestResultComment(
  supabase: ReturnType<typeof adminClient>,
  params: {
    waId: string
    usuarioId: string
    label: 'Realizada' | 'En proceso'
    accionId?: string | null
  }
) {
  const lines: string[] = [
    `*${params.label}*`,
    '',
    'Responde con el numero de actividad y tu avance.',
    '',
    '*Actividades*',
  ]
  if (params.accionId) {
    const { data: action } = await supabase
      .from('acciones_diarias')
      .select('titulo_accion')
      .eq('id', params.accionId)
      .eq('responsable', params.usuarioId)
      .maybeSingle()
    lines.push(`1. ${action?.titulo_accion ?? 'Actividad'}`)
  } else {
    const { data: openActions } = await supabase
      .from('acciones_diarias')
      .select('titulo_accion,estado')
      .eq('responsable', params.usuarioId)
      .not('estado', 'in', '(Hecho,Verificado)')
      .order('updated_at', { ascending: false })
      .limit(8)
    if (openActions && openActions.length > 0) {
      openActions.forEach((row, i) => {
        lines.push(`${i + 1}. ${row.titulo_accion ?? 'Actividad'}`)
      })
    } else {
      lines.push('1. (sin actividades abiertas)')
    }
  }
  lines.push('', 'Puedes enviar texto, foto, PDF o Excel.')
  await replyText(supabase, params.waId, lines.join('\n'), params.usuarioId)
}

async function sendSupportContactPrompt(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string; titulo?: string }
) {
  const title = params.titulo ? ` (${params.titulo})` : ''
  await replyText(
    supabase,
    params.waId,
    [
      `Registramos que requieres apoyo${title}. La actividad quedó en Retraso.`,
      '',
      'Escribe a tu lider o responde aqui con el bloqueo concreto para dar seguimiento.',
    ].join('\n'),
    params.usuarioId,
    { support_contact_sent: true }
  )
}

function fitInteractiveBody(text: string) {
  const clean = text.trim()
  if (clean.length <= 1024) return clean
  return `${clean.slice(0, 1000).trim()}…`
}

async function sendLatestActionFollowupButtons(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  const variants = phoneVariants(params.waId)
  const { data: deliveries } = await supabase
    .from('action_delivery_log')
    .select('accion_id,payload,created_at,external_chat_id')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', params.usuarioId)
    .eq('delivery_status', 'sent')
    .order('created_at', { ascending: false })
    .limit(15)

  const latestInitial = (deliveries ?? []).find((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const phoneOk =
      variants.length === 0 ||
      variants.includes(String(row.external_chat_id ?? '')) ||
      variants.includes(String(payload.wa_id ?? ''))
    return phoneOk && payload.message_type === 'initial' && row.accion_id
  })

  let accionId = latestInitial?.accion_id as string | undefined
  if (!accionId) {
    const { data: openAction } = await supabase
      .from('acciones_diarias')
      .select('id')
      .eq('responsable', params.usuarioId)
      .not('estado', 'in', '(Hecho,Verificado)')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()
    accionId = openAction?.id
  }
  if (!accionId) return false

  const { data: action } = await supabase
    .from('acciones_diarias')
    .select('id,titulo_accion,estado')
    .eq('id', accionId)
    .eq('responsable', params.usuarioId)
    .maybeSingle()
  if (!action || action.estado === 'Hecho' || action.estado === 'Verificado')
    return false

  const { data: pendingCheckpoints } = await supabase
    .from('accion_checkpoints')
    .select('texto,completado,activo,orden')
    .eq('accion_id', action.id)
    .eq('activo', true)
    .eq('completado', false)
    .order('orden', { ascending: true })

  const pendingLines = (pendingCheckpoints ?? []).map((c) =>
    typeof c.texto === 'string' && c.texto.trim()
      ? c.texto.trim()
      : 'Checkpoint'
  )
  const list =
    pendingLines.length > 0
      ? pendingLines.map((line, i) => `${i + 1}. ${line}`).join('\n')
      : '1. (sin checkpoints pendientes)'
  const bodyText = fitInteractiveBody(
    [
      `Seguimiento: ${action.titulo_accion ?? 'Actividad'}`,
      '',
      'Pendientes:',
      list,
      '',
      'Responde con el boton: Realizada, En proceso o Requiero apoyo.',
    ].join('\n')
  )
  const graphBody = interactiveFollowupPayload(
    params.waId,
    bodyText,
    `act:${action.id}`
  )
  const result = await graphSendMessage(supabase, graphBody)
  const metaId = extractMessageId(result.json)
  await upsertThreadMessage(supabase, {
    wa_id: params.waId,
    usuario_id: params.usuarioId,
    direction: 'outbound',
    source: 'automation',
    message_kind: 'interactive',
    body_text: bodyText,
    meta_message_id: metaId,
    delivery_status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.raw.slice(0, 2000),
    sent_at: result.ok ? new Date().toISOString() : null,
    failed_at: result.ok ? null : new Date().toISOString(),
    payload: {
      request: graphBody,
      response: result.json,
      source: 'template_button_followup',
      message_type: 'checkpoint_followup',
      target_type: 'action',
      flow: 'ops',
    },
  })
  await supabase.from('action_delivery_log').insert({
    accion_id: action.id,
    usuario_id: params.usuarioId,
    channel: 'whatsapp',
    external_chat_id: params.waId,
    external_message_id: metaId,
    delivery_status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.raw.slice(0, 2000),
    sent_at: result.ok ? new Date().toISOString() : null,
    payload: {
      message_type: 'checkpoint_followup',
      checkpoint_id: null,
      wa_id: params.waId,
      source: 'template_button',
      target_type: 'action',
      flow: 'ops',
      request: graphBody,
      response: result.json,
    },
  })
  if (result.ok) {
    await supabase
      .from('whatsapp_followup_jobs')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: 'sent_on_template_button',
      })
      .eq('accion_id', action.id)
      .eq('usuario_id', params.usuarioId)
      .eq('status', 'pending')
  }
  return result.ok
}

async function handleVerActividades(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  const { data: openActions } = await supabase
    .from('acciones_diarias')
    .select('titulo_accion,estado,fecha')
    .eq('responsable', params.usuarioId)
    .not('estado', 'in', '(Hecho,Verificado)')
    .order('fecha', { ascending: true })
    .limit(12)

  if (!openActions || openActions.length === 0) {
    await replyText(
      supabase,
      params.waId,
      'No tienes actividades abiertas en el tablero.',
      params.usuarioId,
      { flow: 'ops' }
    )
    return
  }

  const lines = ['*Tus actividades abiertas*', '']
  openActions.forEach((row, i) => {
    lines.push(
      `${i + 1}. ${row.titulo_accion ?? 'Actividad'} — ${row.estado ?? '?'} (compromiso: ${row.fecha ?? 's/f'})`
    )
  })
  lines.push(
    '',
    'Usa los botones del recordatorio (Realizada / En proceso / Requiero apoyo) para reportar avance.',
    'Para el asistente, usa el disparador Consulta al Bot.'
  )
  await replyText(supabase, params.waId, lines.join('\n'), params.usuarioId, {
    flow: 'ops',
  })
}

/**
 * Botón / disparador "Más información" / "Ver actividades":
 * - Solo Ops (listado o botones follow-up)
 * - No abre Gemini; el asistente entra por «Consulta al Bot»
 */
async function handleMasInformacion(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string; canUseAi: boolean }
) {
  void params.canUseAi
  const sentButtons = await sendLatestActionFollowupButtons(supabase, params)
  if (!sentButtons) {
    await handleVerActividades(supabase, {
      waId: params.waId,
      usuarioId: params.usuarioId,
    })
  }
}

async function handleEvidence(
  supabase: ReturnType<typeof adminClient>,
  params: {
    waId: string
    usuarioId: string
    message: WaMessage
  }
) {
  const nowIso = new Date().toISOString()
  const variants = phoneVariants(params.waId)
  const { data: waiting } = await supabase
    .from('whatsapp_result_requests')
    .select(
      'id,scope,accion_id,team_action_id,checkpoint_id,checklist_index,expires_at'
    )
    .in('wa_id', variants.length ? variants : [params.waId])
    .eq('status', 'waiting')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!waiting) return false
  const team = waiting.scope === 'team'
  const { data: authorized } = await supabase
    .from(team ? 'acciones_equipo' : 'acciones_diarias')
    .select('id')
    .eq('id', team ? waiting.team_action_id : waiting.accion_id)
    .eq(team ? 'asignado_a' : 'responsable', params.usuarioId)
    .maybeSingle()
  if (!authorized) throw new Error('not_authorized')

  const textBody =
    params.message.text?.body?.trim() ||
    params.message.image?.caption?.trim() ||
    params.message.document?.caption?.trim() ||
    ''

  const adjuntos: Array<Record<string, unknown>> = []
  const mediaId =
    params.message.image?.id ||
    params.message.document?.id ||
    params.message.video?.id ||
    params.message.audio?.id ||
    null

  if (mediaId) {
    const media = await downloadWhatsAppMedia(mediaId)
    const pathPrefix =
      waiting.scope === 'team'
        ? `equipo/${waiting.team_action_id}`
        : `acciones/${waiting.accion_id}`
    const storagePath = `${pathPrefix}/whatsapp/${Date.now()}_${media.fileName}`
    await workerContexts.get(supabase)?.mark('evidence_upload')
    const { error: uploadError } = await supabase.storage
      .from('evidencias')
      .upload(storagePath, media.bytes, {
        contentType: media.mimeType,
        upsert: false,
      })
    if (uploadError) throw uploadError
    adjuntos.push({
      path: storagePath,
      name: media.fileName,
      content_type: media.mimeType,
      source: 'whatsapp',
    })
  }

  const contenido =
    textBody ||
    (adjuntos.length > 0
      ? 'Evidencia recibida por WhatsApp.'
      : 'Respuesta WhatsApp sin contenido.')

  if (waiting.scope === 'team' && waiting.team_action_id) {
    await supabase.from('equipo_accion_comentarios').insert({
      accion_id: waiting.team_action_id,
      contenido,
      created_by: params.usuarioId,
      tipo_comentario: 'evidencia',
      adjuntos,
    })
  } else if (waiting.accion_id) {
    await supabase.from('accion_comentarios').insert({
      accion_id: waiting.accion_id,
      contenido,
      created_by: params.usuarioId,
      tipo_comentario: 'evidencia',
      adjuntos,
    })
    if (adjuntos.length > 0) {
      await supabase
        .from('acciones_diarias')
        .update({ evidencia_cargada: true })
        .eq('id', waiting.accion_id)
    }
  }

  await supabase
    .from('whatsapp_result_requests')
    .update({ status: 'received', updated_at: new Date().toISOString() })
    .eq('id', waiting.id)

  return true
}

type OpsFallbackTarget =
  | { kind: 'action'; accionId: string; deliveryId: string; title?: string }
  | {
      kind: 'corporate'
      checkpointId: string
      deliveryId: string
      title?: string
    }
  | {
      kind: 'team'
      teamActionId: string
      checklistIndex: number
      deliveryId: string
      title?: string
    }

function targetFromDelivery(delivery: {
  id: string
  accion_id?: string | null
  team_action_id?: string | null
  payload?: unknown
  created_at?: string
}): OpsFallbackTarget | null {
  const payload = (delivery.payload ?? {}) as Record<string, unknown>
  if (payload.message_type !== 'checkpoint_followup') return null
  const createdAt = delivery.created_at
    ? new Date(delivery.created_at).getTime()
    : 0
  if (createdAt && Date.now() - createdAt > OPS_FALLBACK_WINDOW_MS) return null

  const request = (payload.request ?? {}) as Record<string, unknown>
  const interactive = (request.interactive ?? {}) as Record<string, unknown>
  const actionBlock = (interactive.action ?? {}) as {
    buttons?: Array<{ reply?: { id?: string } }>
  }
  const buttonId = actionBlock.buttons?.[0]?.reply?.id ?? ''
  const fromButton = parseButtonId(buttonId)
  const title =
    typeof payload.titulo === 'string'
      ? payload.titulo
      : typeof payload.title === 'string'
        ? payload.title
        : undefined

  if (fromButton.kind === 'action' && fromButton.accionId) {
    return {
      kind: 'action',
      accionId: fromButton.accionId,
      deliveryId: delivery.id,
      title,
    }
  }
  if (fromButton.kind === 'corporate' && fromButton.checkpointId) {
    return {
      kind: 'corporate',
      checkpointId: fromButton.checkpointId,
      deliveryId: delivery.id,
      title,
    }
  }
  if (
    fromButton.kind === 'team' &&
    fromButton.teamActionId != null &&
    fromButton.checklistIndex != null
  ) {
    return {
      kind: 'team',
      teamActionId: fromButton.teamActionId,
      checklistIndex: fromButton.checklistIndex,
      deliveryId: delivery.id,
      title,
    }
  }

  if (payload.target_type === 'action' && delivery.accion_id) {
    return {
      kind: 'action',
      accionId: delivery.accion_id as string,
      deliveryId: delivery.id,
      title,
    }
  }

  const checkpointId =
    typeof payload.checkpoint_id === 'string' ? payload.checkpoint_id : null
  if (checkpointId) {
    return { kind: 'corporate', checkpointId, deliveryId: delivery.id, title }
  }
  if (
    delivery.accion_id &&
    (payload.source === 'followup_job' || payload.related_task_id)
  ) {
    return {
      kind: 'action',
      accionId: delivery.accion_id as string,
      deliveryId: delivery.id,
      title,
    }
  }

  if (delivery.team_action_id) {
    const checklistIndex =
      typeof payload.checklist_index === 'number'
        ? payload.checklist_index
        : Number(payload.checklist_index)
    if (!Number.isNaN(checklistIndex)) {
      return {
        kind: 'team',
        teamActionId: delivery.team_action_id as string,
        checklistIndex,
        deliveryId: delivery.id,
        title,
      }
    }
  }
  return null
}

function dedupeOpsTargets(targets: OpsFallbackTarget[]): OpsFallbackTarget[] {
  const seen = new Set<string>()
  const out: OpsFallbackTarget[] = []
  for (const t of targets) {
    const key =
      t.kind === 'action'
        ? `a:${t.accionId}`
        : t.kind === 'corporate'
          ? `c:${t.checkpointId}`
          : `t:${t.teamActionId}:${t.checklistIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

async function listOpsFallbackCandidates(
  supabase: ReturnType<typeof adminClient>,
  waId: string,
  usuarioId: string
): Promise<OpsFallbackTarget[]> {
  const phone = normalizePhone(waId) || waId
  const variants = phoneVariants(phone)
  const sinceIso = new Date(Date.now() - OPS_FALLBACK_WINDOW_MS).toISOString()
  const { data: byPhone } = await supabase
    .from('action_delivery_log')
    .select(
      'id,accion_id,team_action_id,payload,created_at,external_chat_id,usuario_id'
    )
    .eq('channel', 'whatsapp')
    .eq('delivery_status', 'sent')
    .gte('created_at', sinceIso)
    .in('external_chat_id', variants.length ? variants : [phone])
    .order('created_at', { ascending: false })
    .limit(20)

  let deliveries = byPhone ?? []
  if (deliveries.length === 0) {
    const { data: byUser } = await supabase
      .from('action_delivery_log')
      .select(
        'id,accion_id,team_action_id,payload,created_at,external_chat_id,usuario_id'
      )
      .eq('channel', 'whatsapp')
      .eq('delivery_status', 'sent')
      .eq('usuario_id', usuarioId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(20)
    deliveries = byUser ?? []
  }

  const targets: OpsFallbackTarget[] = []
  for (const delivery of deliveries) {
    const target = targetFromDelivery(delivery)
    if (target) targets.push(target)
  }
  return dedupeOpsTargets(targets)
}

/** Una sola candidata reciente; si 0 o N>1 no asume “última consultada”. */
async function resolveFallbackTarget(
  supabase: ReturnType<typeof adminClient>,
  waId: string,
  usuarioId: string
): Promise<
  | { status: 'one'; target: OpsFallbackTarget }
  | { status: 'none' }
  | { status: 'many'; targets: OpsFallbackTarget[] }
> {
  const candidates = await listOpsFallbackCandidates(supabase, waId, usuarioId)
  if (candidates.length === 0) return { status: 'none' }
  if (candidates.length === 1) return { status: 'one', target: candidates[0] }
  return { status: 'many', targets: candidates }
}

async function upsertFlowSession(
  supabase: ReturnType<typeof adminClient>,
  input: {
    phone: string
    usuarioId: string
    flowType: 'chatbot_query' | 'task_update'
    status?: string
    currentEntityId?: string | null
    correlationId?: string | null
    relatedTaskId?: string | null
    intent?: string | null
    meta?: Record<string, unknown>
  }
) {
  try {
    await supabase
      .from('whatsapp_flow_sessions')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('phone', input.phone)
      .eq('flow_type', input.flowType)
      .in('status', ['active', 'awaiting_clarification'])

    await supabase.from('whatsapp_flow_sessions').insert({
      phone: input.phone,
      usuario_id: input.usuarioId,
      flow_type: input.flowType,
      status: input.status ?? 'active',
      current_entity_id: input.currentEntityId ?? null,
      correlation_id: input.correlationId ?? null,
      related_task_id: input.relatedTaskId ?? null,
      intent: input.intent ?? null,
      meta: input.meta ?? {},
      expires_at: new Date(Date.now() + OPS_FALLBACK_WINDOW_MS).toISOString(),
    })
  } catch (error) {
    console.error('whatsapp-webhook flow session', error)
  }
}

async function hasClarificationSession(
  supabase: ReturnType<typeof adminClient>,
  waId: string,
  usuarioId: string
): Promise<boolean> {
  try {
    const phone = normalizePhone(waId) || waId
    const { data } = await supabase
      .from('whatsapp_flow_sessions')
      .select('id')
      .eq('usuario_id', usuarioId)
      .eq('status', 'awaiting_clarification')
      .gt('expires_at', new Date().toISOString())
      .or(`phone.eq.${phone}`)
      .limit(1)
    return Boolean(data?.[0]?.id)
  } catch {
    return false
  }
}

async function processWhatsAppPayload(payload, supabase) {
  try {
    const entry = Array.isArray(payload.entry) ? payload.entry : []
    for (const ent of entry) {
      const changes = Array.isArray((ent as { changes?: unknown }).changes)
        ? (ent as { changes: unknown[] }).changes
        : []
      for (const change of changes) {
        const value =
          (change as { value?: Record<string, unknown> }).value ?? {}

        const statuses = Array.isArray(value.statuses)
          ? (value.statuses as Array<{
              id?: string
              status?: string
              timestamp?: string
              errors?: unknown[]
            }>)
          : []
        for (const statusEvent of statuses) {
          await applyMetaStatus(supabase, statusEvent)
        }

        const messages = Array.isArray(value.messages)
          ? (value.messages as WaMessage[])
          : []
        for (const message of messages) {
          const waId = normalizePhone(message.from)
          if (!waId) continue

          const identity = await findUsuarioByWa(supabase, waId)
          const context = workerContexts.get(supabase)
          whatsappTrace('WHATSAPP_USER_RESOLVED', {
            ...workerTrace(context),
            linked: Boolean(identity?.usuario_id),
          })
          await upsertThreadMessage(supabase, {
            wa_id: waId,
            usuario_id: identity?.usuario_id ?? null,
            direction: 'inbound',
            source: 'contact',
            message_kind: message.type ?? 'unknown',
            body_text: inboundPreview(message),
            meta_message_id: message.id ?? null,
            delivery_status: 'delivered',
            delivered_at: new Date().toISOString(),
            payload: { message, value, source: 'webhook_inbound', correlation_id: context?.id },
          })
          const { error: inboundError } = await supabase
            .from('external_inbound_messages')
            .insert({
              channel: 'whatsapp',
              external_user_id: waId,
              external_chat_id: waId,
              external_message_id: message.id ?? null,
              external_update_id: message.id ?? null,
              usuario_id: identity?.usuario_id ?? null,
              message_type: message.type ?? 'unknown',
              payload: { message, value, worker_job_id: context?.id },
            })
          if (inboundError?.code === '23505') {
            const { data: previous } = await supabase
              .from('external_inbound_messages')
              .select('payload')
              .eq('channel', 'whatsapp')
              .eq('external_update_id', message.id)
              .maybeSingle()
            // The inbox row records receipt. Only the owning queue job can resume it.
            if (!context || previous?.payload?.worker_job_id !== context.id) {
              whatsappTrace('WHATSAPP_DUPLICATE_SKIPPED', workerTrace(context))
              continue
            }
          } else if (inboundError) {
            throw inboundError
          }

          if (!identity?.usuario_id) {
            await upsertThreadMessage(supabase, {
              wa_id: waId,
              usuario_id: null,
              direction: 'inbound',
              source: 'contact',
              message_kind: message.type ?? 'unknown',
              body_text: inboundPreview(message),
              meta_message_id: message.id ?? null,
              delivery_status: 'delivered',
              sent_at: new Date().toISOString(),
              delivered_at: new Date().toISOString(),
              payload: {
                message,
                value,
                source: 'webhook_inbound',
                flow: 'ops',
                route_kind: 'unlinked_user',
              },
            })
            await replyText(
              supabase,
              waId,
              'No pude identificar tu cuenta de Scrumban. Necesitas vincular este número.',
              null,
              { flow: 'ops' }
            )
            continue
          }

          await supabase
            .from('user_channel_identities')
            .update({
              last_seen_at: new Date().toISOString(),
              external_chat_id: waId,
            })
            .eq('id', identity.id)

          let buttonRaw =
            message.interactive?.button_reply?.id ||
            message.button?.payload ||
            message.interactive?.list_reply?.id ||
            null
          const buttonTitle =
            message.interactive?.button_reply?.title ||
            message.button?.text ||
            message.interactive?.list_reply?.title ||
            null

          // A quoted reply to an assistant communication belongs to its thread,
          // even when the contact also has an open action or chatbot session.
          if (message.context?.id && !buttonRaw) {
            const { data: repliedTo, error: replyLookupError } = await supabase
              .from('whatsapp_messages')
              .select('meta_message_id')
              .eq('meta_message_id', message.context.id)
              .eq('usuario_id', identity.usuario_id)
              .eq('direction', 'outbound')
              .eq('payload->>kind', 'guide_communication')
              .maybeSingle()
            if (replyLookupError || repliedTo) {
              await upsertThreadMessage(supabase, {
                wa_id: waId,
                usuario_id: identity.usuario_id,
                direction: 'inbound',
                source: 'contact',
                message_kind: message.type ?? 'unknown',
                body_text: inboundPreview(message),
                meta_message_id: message.id ?? null,
                delivery_status: 'delivered',
                delivered_at: new Date().toISOString(),
                payload: {
                  message,
                  source: 'webhook_inbound',
                  flow: 'communication',
                  route_kind: replyLookupError
                    ? 'quoted_reply_unresolved'
                    : 'communication_reply',
                  in_reply_to: message.context.id,
                },
              })
              continue
            }
          }

          if (
            await handleInboundCommand(
              supabase,
              message,
              identity.usuario_id,
              waId
            )
          )
            continue
          if (
            message.context?.id &&
            !buttonRaw &&
            inferOpsTextAction(message.text?.body || '')
          ) {
            const { data: delivery } = await supabase
              .from('action_delivery_log')
              .select('id,accion_id,team_action_id,payload,created_at')
              .eq('channel', 'whatsapp')
              .eq('external_message_id', message.context.id)
              .eq('usuario_id', identity.usuario_id)
              .gte(
                'created_at',
                new Date(Date.now() - OPS_FALLBACK_WINDOW_MS).toISOString()
              )
              .maybeSingle()
            const target = delivery ? targetFromDelivery(delivery) : null
            if (!target) {
              await replyText(
                supabase,
                waId,
                'Ese seguimiento ya no está disponible. Escribe Actualizar acciones.',
                identity.usuario_id
              )
              continue
            }
            const action = inferOpsTextAction(message.text.body)
            message.interactive = {
              button_reply: {
                id:
                  target.kind === 'action'
                    ? 'act:' + target.accionId + ':' + action
                    : target.kind === 'corporate'
                      ? 'chk:' + target.checkpointId + ':' + action
                      : 'tchk:' +
                        target.teamActionId +
                        ':' +
                        target.checklistIndex +
                        ':' +
                        action,
              },
            }
            buttonRaw = message.interactive.button_reply.id
            // Re-enter the canonical command handler for blocked replies.
            if (
              await handleInboundCommand(
                supabase,
                message,
                identity.usuario_id,
                waId
              )
            )
              continue
          }
          // --- Shared: separación de audio ambiguo vs evidencia pendiente (Ops) vs nota de voz asistente ---
          let prefetchedCanUseAi: boolean | null = null
          let prefetchedUserActive: boolean | null = null
          let voiceNotesForUser = false
          const dbAllowlist = await loadEdgeDbAllowlist(supabase)
          if (
            message.type === 'audio' &&
            Deno.env.get('WHATSAPP_VOICE_NOTES_ENABLED') === '1'
          ) {
            prefetchedCanUseAi = await canUseAiWhatsApp(supabase, identity.usuario_id)
            if (prefetchedCanUseAi) {
              prefetchedUserActive = await isActiveUsuarioEdge(
                supabase,
                identity.usuario_id
              )
              voiceNotesForUser = isVoiceNotesAllowedForUser({
                usuarioId: identity.usuario_id,
                waId,
                active: prefetchedUserActive,
                aiAuthorized: prefetchedCanUseAi,
                dbAllowlist,
              })
            }
          }
          let waitingEvidenceForAudio = false
          if (message.type === 'audio' && voiceNotesForUser) {
            waitingEvidenceForAudio = await hasWaitingEvidenceRequest(supabase, waId)
            if (waitingEvidenceForAudio) {
              const audioCanUseAi = prefetchedCanUseAi === true
              const audioAgentActive = audioCanUseAi
                ? await hasActiveAgentSession(supabase, waId)
                : false
              if (audioCanUseAi && audioAgentActive) {
                await upsertThreadMessage(supabase, {
                  wa_id: waId,
                  usuario_id: identity.usuario_id,
                  direction: 'inbound',
                  source: 'contact',
                  message_kind: 'audio',
                  body_text: inboundPreview(message),
                  meta_message_id: message.id ?? null,
                  delivery_status: 'delivered',
                  sent_at: new Date().toISOString(),
                  delivered_at: new Date().toISOString(),
                  payload: {
                    message,
                    value,
                    source: 'webhook_inbound',
                    flow: null,
                    route_kind: 'audio_ambiguous',
                    intent: 'UNKNOWN',
                  },
                })
                await replyText(
                  supabase,
                  waId,
                  'Recibí tu audio, pero tienes una solicitud de evidencia pendiente y una conversación activa con el asistente. Para evitar errores no lo guardé aún: si es evidencia de tu tarea, envíala por texto/foto o responde "evidencia"; si es una consulta para el asistente, responde "cancelar" para cerrar la evidencia pendiente y vuelve a enviar tu nota de voz.',
                  identity.usuario_id,
                  { flow: 'ops', event: 'audio_ambiguous_clarification' }
                )
                continue
              }
            }
          }

          if (
            message.type === 'text' ||
            message.type === 'image' ||
            message.type === 'document' ||
            message.type === 'audio' ||
            message.type === 'video'
          ) {
            const evidenceHandled = await handleEvidence(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              message,
            })
            if (evidenceHandled) {
              await upsertThreadMessage(supabase, {
                wa_id: waId,
                usuario_id: identity.usuario_id,
                direction: 'inbound',
                source: 'contact',
                message_kind: message.type ?? 'unknown',
                body_text: inboundPreview(message),
                meta_message_id: message.id ?? null,
                delivery_status: 'delivered',
                sent_at: new Date().toISOString(),
                delivered_at: new Date().toISOString(),
                payload: {
                  message,
                  value,
                  source: 'webhook_inbound',
                  flow: 'ops',
                  route_kind: 'evidence',
                },
              })
              await replyText(
                supabase,
                waId,
                'Gracias. Registramos tu evidencia en el tablero.',
                identity.usuario_id,
                { flow: 'ops' }
              )
              continue
            }
          }

          const routeInput = {
            buttonId: buttonRaw,
            buttonTitle,
            textBody:
              message.type === 'text' ? (message.text?.body ?? null) : null,
            messageType: message.type,
          }
          // Deferir RPC: botones ops / media ignore no consultan can_use_ai.
          const structured = resolveStructuredInboundRoute(routeInput)
          let canUseAi = false
          let pilotAllowed = false
          let agentSessionActive = false
          let clarificationPending = false
          let correlatedTargetCount: number | undefined
          let route: InboundRoute
          if (
            structured &&
            structured.kind !== 'agent_aiop' &&
            structured.kind !== 'agent_r2_button' &&
            structured.kind !== 'mas_info' &&
            structured.kind !== 'agent_channel'
          ) {
            route = structured
          } else {
            canUseAi =
              prefetchedCanUseAi !== null
                ? prefetchedCanUseAi
                : await canUseAiWhatsApp(supabase, identity.usuario_id)
            const needsPilotCheck =
              canUseAi &&
              (structured?.kind === 'agent_r2_button' ||
                voiceNotesForUser ||
                looksLikeWriteRequestText(routeInput.textBody))
            if (needsPilotCheck) {
              const userActive =
                prefetchedUserActive !== null
                  ? prefetchedUserActive
                  : await isActiveUsuarioEdge(supabase, identity.usuario_id)
              pilotAllowed = isEdgeWhatsAppPilotAllowed({
                usuarioId: identity.usuario_id,
                waId,
                active: userActive,
                aiAuthorized: canUseAi,
                dbAllowlist,
              })
            }
            agentSessionActive = canUseAi
              ? await hasActiveAgentSession(supabase, waId)
              : false
            clarificationPending = await hasClarificationSession(
              supabase,
              waId,
              identity.usuario_id
            )
            const candidates = await listOpsFallbackCandidates(
              supabase,
              waId,
              identity.usuario_id
            )
            correlatedTargetCount = candidates.length
            const classified = classifyWhatsAppIntent({
              canUseAi,
              agentSessionActive,
              clarificationPending,
              correlatedTargetCount,
              voiceNotesEnabled: voiceNotesForUser && pilotAllowed,
              hasWaitingEvidence: waitingEvidenceForAudio,
              writeGuardrailEnabled: pilotAllowed,
              ...routeInput,
            })
            route = structured ?? classified.route
          }
          const inboundFlow = inboundFlowForRoute(route)
          const intent = intentForRoute(route)
          traceInboundCommand(supabase, route.kind)

          await upsertThreadMessage(supabase, {
            wa_id: waId,
            usuario_id: identity.usuario_id,
            direction: 'inbound',
            source: 'contact',
            message_kind: message.type ?? 'unknown',
            body_text: inboundPreview(message),
            meta_message_id: message.id ?? null,
            delivery_status: 'delivered',
            sent_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
            payload: {
              message,
              value,
              source: 'webhook_inbound',
              flow: inboundFlow,
              route_kind: route.kind,
              intent,
              correlated_target_count: correlatedTargetCount ?? null,
            },
          })

          // --- AgentRouter: R2 interactive buttons (Confirmar / Editar / Cancelar) ---
          if (route.kind === 'agent_r2_button') {
            if (!canUseAi || !pilotAllowed) {
              await replyText(
                supabase,
                waId,
                'No tienes permiso para confirmar o editar esta propuesta.',
                identity.usuario_id,
                { flow: 'ops' }
              )
              continue
            }
            const aiHandled = await maybeHandleWhatsAppAi(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              action: 'chat',
              buttonId: route.buttonId,
              aiAllowed: canUseAi,
            })
            if (!aiHandled) {
              await replyText(
                supabase,
                waId,
                'No pude procesar el botón de la propuesta ahora. Intenta de nuevo en unos minutos.',
                identity.usuario_id,
                { flow: 'agent' }
              )
            }
            continue
          }

          // --- AgentRouter: inbound voice note (OGG/Opus -> server STT -> assistant) ---
          if (route.kind === 'agent_voice_note') {
            const mediaId = message.audio?.id?.trim() || ''
            if (!canUseAi || !pilotAllowed || !mediaId) {
              continue
            }
            await upsertFlowSession(supabase, {
              phone: normalizePhone(waId) || waId,
              usuarioId: identity.usuario_id,
              flowType: 'chatbot_query',
              status: 'active',
              intent: 'QUERY',
            })
            const aiHandled = await maybeHandleWhatsAppAi(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              action: 'voice_note',
              mediaId,
              mimeType: message.audio?.mime_type ?? 'audio/ogg',
              aiAllowed: canUseAi,
            })
            if (!aiHandled) {
              await replyText(
                supabase,
                waId,
                'No pude procesar tu nota de voz ahora. Por favor escríbeme tu consulta en texto.',
                identity.usuario_id,
                { flow: 'agent' }
              )
            }
            continue
          }

          // --- AgentRouter: aiop confirm/cancel ---
          if (route.kind === 'agent_aiop') {
            if (!canUseAi) {
              await replyText(
                supabase,
                waId,
                'Usa los botones Realizada, En proceso o Requiero apoyo del recordatorio, o abre el tablero.',
                identity.usuario_id,
                { flow: 'ops' }
              )
              continue
            }
            const aiHandled = await maybeHandleWhatsAppAi(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              action: route.action,
              opId: route.opId,
              aiAllowed: canUseAi,
            })
            if (!aiHandled) {
              await replyText(
                supabase,
                waId,
                'No pude confirmar la operacion ahora. Intenta de nuevo o abre el tablero.',
                identity.usuario_id,
                { flow: 'agent' }
              )
            }
            continue
          }

          // --- Gate Más información (ops list + agent solo si canUseAi) ---
          if (route.kind === 'mas_info') {
            await handleMasInformacion(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              canUseAi,
            })
            continue
          }

          // --- Iniciar bot / Consulta al Bot → selector mensaje|voz ---
          if (route.kind === 'agent_consult') {
            if (!canUseAi) {
              await replyText(
                supabase,
                waId,
                [
                  'El asistente solo está disponible para perfiles OKRS o Super Admin.',
                  '',
                  'Puedes usar: Ver actividades, Reportar avance o Necesito apoyo.',
                ].join('\n'),
                identity.usuario_id,
                { flow: 'ops', event: 'bot_start_denied' }
              )
              continue
            }
            await replyChannelSelector(supabase, waId, identity.usuario_id)
            continue
          }

          if (route.kind === 'agent_channel') {
            if (!canUseAi) {
              await replyText(
                supabase,
                waId,
                'El asistente solo está disponible para perfiles OKRS o Super Admin.',
                identity.usuario_id,
                { flow: 'ops', event: 'channel_denied' }
              )
              continue
            }
            if (route.channel === 'voice') {
              await createAndSendVoiceLink(supabase, {
                waId,
                usuarioId: identity.usuario_id,
              })
            } else {
              await handleAgentChannelText(supabase, {
                waId,
                usuarioId: identity.usuario_id,
              })
            }
            continue
          }

          // --- OpsRouter: botones estructurados o keywords ---
          let action: 'done' | 'progress' | 'support' | null = null
          let kind: 'action' | 'corporate' | 'team' | null = null
          let accionId: string | null = null
          let checkpointId: string | null = null
          let teamActionId: string | null = null
          let checklistIndex: number | null = null
          let operationalMiss = false

          if (route.kind === 'ops_button') {
            const parsed = parseButtonId(route.buttonId)
            action = parsed.action
            kind = parsed.kind
            accionId = parsed.accionId
            checkpointId = parsed.checkpointId
            teamActionId = parsed.teamActionId
            checklistIndex = parsed.checklistIndex
          } else if (route.kind === 'ops_keyword') {
            action = route.action
            const fallback = await resolveFallbackTarget(
              supabase,
              waId,
              identity.usuario_id
            )
            if (fallback.status === 'one') {
              const target = fallback.target
              await upsertFlowSession(supabase, {
                phone: normalizePhone(waId) || waId,
                usuarioId: identity.usuario_id,
                flowType: 'task_update',
                status: 'active',
                relatedTaskId:
                  target.kind === 'action'
                    ? target.accionId
                    : target.kind === 'corporate'
                      ? target.checkpointId
                      : String(target.teamActionId),
                correlationId: target.deliveryId,
                intent: 'TASK_REPLY',
              })
              if (target.kind === 'action') {
                kind = 'action'
                accionId = target.accionId
              } else if (target.kind === 'corporate') {
                kind = 'corporate'
                checkpointId = target.checkpointId
              } else {
                kind = 'team'
                teamActionId = target.teamActionId
                checklistIndex = target.checklistIndex
              }
            } else if (fallback.status === 'many') {
              await upsertFlowSession(supabase, {
                phone: normalizePhone(waId) || waId,
                usuarioId: identity.usuario_id,
                flowType: 'task_update',
                status: 'awaiting_clarification',
                intent: 'CLARIFICATION',
                meta: { candidates: fallback.targets.length },
              })
              await replyText(
                supabase,
                waId,
                askWhichTaskText(),
                identity.usuario_id,
                {
                  flow: 'ops',
                  event: 'ops_clarify_many',
                  intent: 'CLARIFICATION',
                }
              )
              continue
            } else {
              operationalMiss = true
            }
          } else if (route.kind === 'ops_clarify') {
            await upsertFlowSession(supabase, {
              phone: normalizePhone(waId) || waId,
              usuarioId: identity.usuario_id,
              flowType: 'task_update',
              status: 'awaiting_clarification',
              intent: 'CLARIFICATION',
              meta: { reason: route.reason, action: route.action },
            })
            await replyText(
              supabase,
              waId,
              route.reason === 'many'
                ? askWhichTaskText()
                : 'No hay un seguimiento reciente para asociar tu respuesta. Usa el botón del recordatorio o espera el siguiente seguimiento.',
              identity.usuario_id,
              { flow: 'ops', event: 'ops_clarify', intent: 'CLARIFICATION' }
            )
            continue
          } else if (route.kind === 'ask_flow') {
            await replyText(
              supabase,
              waId,
              askFlowClarificationText(),
              identity.usuario_id,
              { flow: 'ops', event: 'ask_flow', intent: 'UNKNOWN' }
            )
            continue
          } else if (route.kind === 'cancel') {
            try {
              await supabase
                .from('whatsapp_flow_sessions')
                .update({
                  status: 'cancelled',
                  updated_at: new Date().toISOString(),
                })
                .eq('usuario_id', identity.usuario_id)
                .in('status', ['active', 'awaiting_clarification'])
            } catch {
              /* optional table */
            }
            await replyText(
              supabase,
              waId,
              'Listo, cancele la actualización pendiente. Puedes consultar con "Consulta al Bot" o usar los botones del recordatorio.',
              identity.usuario_id,
              { flow: 'ops', event: 'cancel', intent: 'CANCEL' }
            )
            continue
          } else if (route.kind === 'agent_free_text') {
            await upsertFlowSession(supabase, {
              phone: normalizePhone(waId) || waId,
              usuarioId: identity.usuario_id,
              flowType: 'chatbot_query',
              status: 'active',
              intent: 'QUERY',
            })
            const aiHandled = await maybeHandleWhatsAppAi(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              action: 'chat',
              text: route.text,
              aiAllowed: canUseAi,
            })
            if (!aiHandled) {
              await replyText(
                supabase,
                waId,
                'No pude consultar el asistente ahora. Intenta de nuevo en unos minutos.',
                identity.usuario_id,
                { flow: 'agent' }
              )
            }
            continue
          } else if (route.kind === 'ops_help') {
            await replyText(
              supabase,
              waId,
              'Puedes reportar avance con los botones Realizada, En proceso o Requiero apoyo del recordatorio, o esperar el siguiente seguimiento.',
              identity.usuario_id,
              { flow: 'ops' }
            )
            continue
          } else {
            // ignore (media sin evidencia, etc.)
            continue
          }

          if (operationalMiss) {
            await replyText(
              supabase,
              waId,
              'No hay un seguimiento reciente para asociar tu respuesta. Espera el recordatorio o abre el tablero.',
              identity.usuario_id,
              { flow: 'ops' }
            )
            continue
          }

          if (!action || !kind) {
            await replyText(
              supabase,
              waId,
              'No reconocí esa respuesta. Escribe Ayuda o Actualizar acciones.',
              identity.usuario_id
            )
            continue
          }
          if (action === 'support') {
            const id =
              kind === 'action'
                ? 'act:' + accionId + ':support'
                : kind === 'corporate'
                  ? 'chk:' + checkpointId + ':support'
                  : 'tchk:' + teamActionId + ':' + checklistIndex + ':support'
            await handleInboundCommand(
              supabase,
              { ...message, interactive: { button_reply: { id } } },
              identity.usuario_id,
              waId
            )
            continue
          }

          if (kind === 'action' && accionId) {
            const result = await applyActionResponse(supabase, {
              accionId,
              action,
              usuarioId: identity.usuario_id,
              waId,
            })
            if (result.ok) {
              if (result.askSupport) {
                await sendSupportContactPrompt(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  titulo: result.titulo,
                })
              } else if (result.askResult) {
                await requestResultComment(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  label: result.resultLabel ?? 'Realizada',
                  accionId: result.accionId,
                })
              }
            }
          } else if (kind === 'corporate' && checkpointId) {
            const result = await handleCorporateAction(supabase, {
              checkpointId,
              action,
              usuarioId: identity.usuario_id,
              waId,
            })
            if (result.ok) {
              if (result.askSupport) {
                await sendSupportContactPrompt(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  titulo: result.titulo,
                })
              } else if (result.askResult) {
                await requestResultComment(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  label: result.resultLabel ?? 'Realizada',
                  accionId: result.accionId,
                })
              }
            }
          } else if (
            kind === 'team' &&
            teamActionId != null &&
            checklistIndex != null
          ) {
            const result = await handleTeamAction(supabase, {
              teamActionId,
              checklistIndex,
              action,
              usuarioId: identity.usuario_id,
              waId,
            })
            if (result.ok) {
              if (action === 'support') {
                await sendSupportContactPrompt(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                })
              } else if (result.askResult) {
                await requestResultComment(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  label: action === 'progress' ? 'En proceso' : 'Realizada',
                })
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    throw error
  }
}

// BEGIN_WHATSAPP_INGRESS
/** Shared ingress contract for Meta. No routing, AI or sends before durable ACK. */
type WhatsAppEvent = {
  key: string
  phone: string
  sender: string
  kind: 'message' | 'status'
  payload: Record<string, unknown>
}
type IngressConfig = {
  appSecret: string
  verifyToken: string
  phoneId: string
  wabaId: string
}
async function verifyWhatsAppSignature(
  raw: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature ?? '')
  if (!secret || !match) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const bytes = Uint8Array.from(match[1].match(/../g)!, (n) => parseInt(n, 16))
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(raw))
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function normalizeWhatsAppEvents(
  payload: unknown,
  config: Pick<IngressConfig, 'phoneId' | 'wabaId'>
): WhatsAppEvent[] {
  if (
    !record(payload) ||
    payload.object !== 'whatsapp_business_account' ||
    !Array.isArray(payload.entry)
  )
    throw new Error('invalid_payload')
  const events: WhatsAppEvent[] = []
  for (const entry of payload.entry) {
    if (!record(entry) || !Array.isArray(entry.changes))
      throw new Error('invalid_entry')
    if (entry.id !== config.wabaId) throw new Error('wrong_waba')
    for (const change of entry.changes) {
      if (!record(change)) throw new Error('invalid_change')
      if (change.field !== 'messages') continue
      const v = change.value
      if (
        !record(v) ||
        !record(v.metadata) ||
        v.metadata.phone_number_id !== config.phoneId
      )
        throw new Error('wrong_phone')
      for (const field of ['messages', 'statuses'] as const) {
        if (v[field] !== undefined && !Array.isArray(v[field]))
          throw new Error('invalid_events')
        for (const item of (v[field] ?? []) as unknown[]) {
          if (
            !record(item) ||
            typeof item.id !== 'string' ||
            !item.id ||
            item.id.length > 512
          )
            throw new Error('invalid_event_id')
          const kind = field === 'messages' ? 'message' : 'status'
          const sender = kind === 'message' ? item.from : item.recipient_id
          if (typeof sender !== 'string' || !/^\d{10,15}$/.test(sender))
            throw new Error('invalid_sender')
          if (kind === 'message' && typeof item.type !== 'string')
            throw new Error('invalid_message_type')
          if (
            kind === 'message' &&
            item.type === 'text' &&
            (!record(item.text) || typeof item.text.body !== 'string')
          )
            throw new Error('invalid_text')
          if (
            kind === 'status' &&
            (!['sent', 'delivered', 'read', 'failed'].includes(
              String(item.status)
            ) ||
              !/^\d+$/.test(String(item.timestamp)))
          )
            throw new Error('invalid_status')
          const key =
            kind === 'message'
              ? `message:${item.id}`
              : `status:${item.id}:${item.status}:${item.timestamp}`
          events.push({
            key,
            kind,
            phone: config.phoneId,
            sender,
            payload: {
              object: 'whatsapp_business_account',
              entry: [
                {
                  id: entry.id,
                  changes: [
                    {
                      field: 'messages',
                      value: {
                        metadata: { phone_number_id: config.phoneId },
                        [field]: [item],
                      },
                    },
                  ],
                },
              ],
            },
          })
        }
      }
    }
  }
  return events
}
function whatsappTrace(event: string, fields: Record<string, unknown>) {
  const log = event === 'WHATSAPP_PROCESSING_FAILED' ? console.error : console.info
  log(JSON.stringify({ event, ...fields }))
}

async function acceptWhatsAppWebhook(
  request: Request,
  config: IngressConfig,
  enqueue: (events: WhatsAppEvent[]) => Promise<void>
): Promise<Response> {
  const requestId = crypto.randomUUID()
  whatsappTrace('WHATSAPP_WEBHOOK_RECEIVED', { request_id: requestId, method: request.method })
  const fail = (code: string, status: number, fields: Record<string, unknown> = {}) => {
    whatsappTrace('WHATSAPP_PROCESSING_FAILED', { request_id: requestId, code, ...fields })
    return new Response(code, { status })
  }
  if (request.method === 'GET') {
    const q = new URL(request.url).searchParams
    return q.get('hub.mode') === 'subscribe' &&
      !!config.verifyToken &&
      q.get('hub.verify_token') === config.verifyToken &&
      q.has('hub.challenge')
      ? new Response(q.get('hub.challenge'), { status: 200 })
      : fail('invalid_verify_token', 403)
  }
  if (request.method !== 'POST')
    return new Response('method_not_allowed', { status: 405 })
  const missing = [
    !config.appSecret && 'WHATSAPP_APP_SECRET',
    !config.phoneId && 'WHATSAPP_PHONE_NUMBER_ID',
    !config.wabaId && 'WHATSAPP_WABA_ID',
  ].filter(Boolean)
  if (missing.length > 0) return fail('webhook_not_configured', 503, { missing })
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > 1048576)
    return fail('payload_too_large', 413)
  if (!(await verifyWhatsAppSignature(raw, request.headers.get('x-hub-signature-256'), config.appSecret))) {
    return fail('invalid_signature', 401)
  }
  whatsappTrace('WHATSAPP_SIGNATURE_VALIDATED', { request_id: requestId })
  let events: WhatsAppEvent[]
  try {
    events = normalizeWhatsAppEvents(JSON.parse(raw), config)
  } catch {
    return fail('invalid_payload', 400)
  }
  for (const event of events) {
    whatsappTrace('WHATSAPP_MESSAGE_PARSED', {
      request_id: requestId, correlation_id: event.key, kind: event.kind,
    })
  }
  try {
    await enqueue(events)
  } catch {
    return fail('temporarily_unavailable', 503, { stage: 'enqueue' })
  }
  whatsappTrace('WHATSAPP_WEBHOOK_PERSISTED', { request_id: requestId, count: events.length })
  return new Response('EVENT_RECEIVED', { status: 200 })
}

// END_WHATSAPP_INGRESS





async function handleInboundCommand(supabase, message, usuarioId, waId) {
  const text = message.text?.body?.trim() || ''
  const button =
    message.interactive?.button_reply?.id ||
    message.interactive?.list_reply?.id ||
    message.button?.payload ||
    ''
  const label =
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.title ||
    message.button?.text ||
    ''
  const command =
    whatsappCommand(button) ||
    whatsappCommand(text) ||
    (!button || !button.includes(':') ? whatsappCommand(label) : null) ||
    (looksLikeCancelText(text)
      ? 'cancel'
      : looksLikeExplicitTaskUpdate(text)
        ? 'update'
        : null)
  const correlation = workerContexts.get(supabase)?.id
  const send = (body) =>
    replyText(supabase, waId, body, usuarioId, { correlation_id: correlation })
  const now = new Date().toISOString()
  const close = async () => {
    await supabase
      .from('whatsapp_flow_sessions')
      .update({ status: 'cancelled', updated_at: now })
      .eq('usuario_id', usuarioId)
      .eq('phone', waId)
      .in('status', ['active', 'awaiting_clarification'])
    await supabase
      .from('whatsapp_result_requests')
      .update({ status: 'expired', updated_at: now })
      .eq('usuario_id', usuarioId)
      .eq('wa_id', waId)
      .eq('status', 'waiting')
  }
  const save = async (meta) => {
    await close()
    await supabase
      .from('whatsapp_flow_sessions')
      .insert({
        phone: waId,
        usuario_id: usuarioId,
        flow_type: 'task_update',
        status: 'awaiting_clarification',
        intent: 'CLARIFICATION',
        meta,
        correlation_id: message.id,
        expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      })
  }
  if (command) {
    traceInboundCommand(supabase, command)
    if (command === 'cancel') {
      await close()
      await send(
        'Cancelé el seguimiento pendiente. Puedes escribir Mis acciones o Actualizar acciones.'
      )
      return true
    }
    if (command === 'help') {
      await send(
        'Hola. Soy el asistente de Scrumban.\n\nPuedes escribir:\n• Mis acciones\n• Vencidas\n• Acciones que asigné\n• Actualizar acciones\n• Consulta al Bot\n• Cancelar'
      )
      await close()
      return true
    }
    let query = supabase
      .from('acciones_diarias')
      .select('id,titulo_accion,estado,fecha,responsable')
      .eq(command === 'assigned' ? 'created_by' : 'responsable', usuarioId)
      .not('estado', 'in', '(Hecho,Verificado)')
      .order('fecha', { ascending: true })
      .limit(10)
    if (command === 'overdue')
      query = query.lt(
        'fecha',
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Mexico_City',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())
      )
    const { data: rows } = await query
    if (!rows?.length) {
      await send(
        command === 'assigned'
          ? 'No encontré acciones pendientes creadas por ti.'
          : command === 'overdue'
            ? 'No encontré acciones vencidas asignadas a ti.'
            : 'No encontré acciones pendientes asignadas a ti.'
      )
      await close()
      return true
    }
    if (command === 'update') {
      await save({ purpose: 'select_action', ids: rows.map((r) => r.id) })
      const body = {
        messaging_product: 'whatsapp',
        to: waId,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: 'Selecciona una de tus acciones para actualizarla. También puedes responder con su número o Cancelar.',
          },
          action: {
            button: 'Elegir acción',
            sections: [
              {
                title: 'Tus acciones',
                rows: rows.map((r, i) => ({
                  id: 'wa:select:' + r.id,
                  title: `${i + 1}. ${r.titulo_accion || 'Acción'}`.slice(
                    0,
                    24
                  ),
                  description: String(r.estado).slice(0, 72),
                })),
              },
            ],
          },
        },
      }
      const result = await graphSendMessage(supabase, body)
      await upsertThreadMessage(supabase, {
        wa_id: waId,
        usuario_id: usuarioId,
        direction: 'outbound',
        source: 'automation',
        message_kind: 'interactive',
        body_text: 'Selecciona una acción',
        meta_message_id: extractMessageId(result.json),
        delivery_status: 'sent',
        payload: { correlation_id: correlation, flow: 'ops' },
      })
    } else
      await send(
        (command === 'assigned'
          ? 'Acciones que creaste'
          : command === 'overdue'
            ? 'Tus acciones vencidas'
            : 'Tus acciones pendientes') +
          ' (hasta 10):\n\n' +
          rows
            .map(
              (r, i) =>
                `${i + 1}. ${r.titulo_accion || 'Acción'} — ${r.estado} · ${r.fecha}`
            )
            .join('\n')
      )
    if (command !== 'update') await close()
    return true
  }
  const { data: session } = await supabase
    .from('whatsapp_flow_sessions')
    .select('id,meta,expires_at')
    .eq('usuario_id', usuarioId)
    .eq('phone', waId)
    .eq('flow_type', 'task_update')
    .eq('status', 'awaiting_clarification')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const selection = /^wa:select:([0-9a-f-]{36})$/i.exec(button)
  if (
    selection ||
    (session?.meta?.purpose === 'select_action' && /^\d+$/.test(text))
  ) {
    traceInboundCommand(supabase, 'select_action')
    const id = selection?.[1] || session?.meta?.ids?.[Number(text) - 1]
    if (!session || !session.meta?.ids?.includes(id)) {
      await send(
        'La selección expiró o no está disponible. Escribe Actualizar acciones.'
      )
      return true
    }
    const { data: a } = await supabase
      .from('acciones_diarias')
      .select('id,titulo_accion')
      .eq('id', id)
      .eq('responsable', usuarioId)
      .maybeSingle()
    if (!a) {
      await send('No pude encontrar una acción que puedas actualizar.')
      return true
    }
    await save({ purpose: 'selected_action', id: a.id })
    const body = interactiveFollowupPayload(
      waId,
      a.titulo_accion || 'Selecciona el avance',
      'act:' + a.id
    )
    const result = await graphSendMessage(supabase, body)
    await upsertThreadMessage(supabase, {
      wa_id: waId,
      usuario_id: usuarioId,
      direction: 'outbound',
      source: 'automation',
      message_kind: 'interactive',
      body_text: a.titulo_accion,
      meta_message_id: extractMessageId(result.json),
      delivery_status: 'sent',
      payload: { flow: 'ops', correlation_id: correlation },
    })
    return true
  }
  // An unrelated query changes intent and must never become evidence or a blocking reason.
  if (
    looksLikeQueryText(text) ||
    isConsultaAlBotText(text) ||
    inferAiChannelText(text)
  ) {
    await close()
    return false
  }
  let parsed = parseButtonId(button)
  if (!parsed.kind && session?.meta?.purpose === 'selected_action') {
    const action = inferOpsTextAction(text)
    if (action) parsed = { kind: 'action', accionId: session.meta.id, action }
  }
  if (parsed.action === 'support') {
    traceInboundCommand(supabase, 'support')
    let id = parsed.accionId
    if (parsed.kind === 'corporate') {
      const { data: cp } = await supabase
        .from('accion_checkpoints')
        .select('accion_id')
        .eq('id', parsed.checkpointId)
        .maybeSingle()
      id = cp?.accion_id
    }
    const table =
      parsed.kind === 'team' ? 'acciones_equipo' : 'acciones_diarias'
    const owner = parsed.kind === 'team' ? 'asignado_a' : 'responsable'
    id = parsed.kind === 'team' ? parsed.teamActionId : id
    const { data: a } = await supabase
      .from(table)
      .select('id')
      .eq('id', id)
      .eq(owner, usuarioId)
      .maybeSingle()
    if (!a) {
      await send('No pude encontrar una acción que puedas actualizar.')
      return true
    }
    await save({
      purpose: 'block_reason',
      id,
      kind: parsed.kind,
      checkpointId: parsed.checkpointId,
      checklistIndex: parsed.checklistIndex,
    })
    await send(
      '¿Qué impide avanzar? Escribe el motivo del bloqueo o Cancelar. Aún no he cambiado el estado.'
    )
    return true
  }
  if (session?.meta?.purpose === 'block_reason' && text) {
    traceInboundCommand(supabase, 'block_reason')
    if (text.length < 3) {
      await send('Describe el motivo del bloqueo con un poco más de detalle.')
      return true
    }
    const m = session.meta
    if (m.kind === 'team')
      await applyTeamMutation(supabase, {
        teamActionId: m.id,
        checklistIndex: m.checklistIndex,
        action: 'support',
        reason: text,
        usuarioId,
        waId,
      })
    else
      await applyActionResponse(supabase, {
        accionId: m.id,
        action: 'support',
        reason: text,
        usuarioId,
        waId,
        checkpointId: m.checkpointId,
      })
    await close()
    await send('Registré el bloqueo y su motivo en la acción.')
    return true
  }
  if (
    parsed.kind === 'action' &&
    parsed.action &&
    session?.meta?.purpose === 'selected_action' &&
    !button
  ) {
    traceInboundCommand(supabase, parsed.action)
    const result = await applyActionResponse(supabase, {
      accionId: parsed.accionId,
      action: parsed.action,
      usuarioId,
      waId,
    })
    await supabase
      .from('whatsapp_flow_sessions')
      .update({ status: 'closed' })
      .eq('id', session.id)
    if (result.ok)
      await send(
        parsed.action === 'done'
          ? 'Registré la acción como Hecho. Puedes responder con el resultado.'
          : 'Registré la acción En proceso. Puedes responder con tu avance.'
      )
    return true
  }
  return false
}

// BEGIN_WHATSAPP_COMMANDS
/** Deterministic commands are resolved before evidence capture or an LLM. */
function whatsappCommand(
  text: string | null | undefined
): 'help' | 'mine' | 'overdue' | 'assigned' | 'update' | 'cancel' | null {
  const value = (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\//, '')
    .replace(/[¿?¡!]/g, '')
    .replace(/[_-]+/g, ' ')
  if (/^(hola|ayuda|help|menu|buenos dias|buenas tardes)$/.test(value))
    return 'help'
  if (
    /^(mis acciones|pendientes|mis pendientes|consultar acciones|ver actividades|wa:mine)$/.test(
      value
    )
  )
    return 'mine'
  if (
    /^(vencidas|acciones vencidas|mis acciones vencidas|wa:overdue)$/.test(
      value
    )
  )
    return 'overdue'
  if (/^(acciones que asigne|asignadas por mi|wa:assigned)$/.test(value))
    return 'assigned'
  if (
    /^(actualizar acciones|actualizar mis acciones|reportar avance|wa:update)$/.test(
      value
    )
  )
    return 'update'
  if (/^(cancelar|cancela|cancel|salir)$/.test(value)) return 'cancel'
  return null
}

// END_WHATSAPP_COMMANDS

const workerContexts = new WeakMap()
function workerTrace(context) {
  return { job_id: context?.id, correlation_id: context?.eventKey }
}
function traceInboundCommand(supabase, command) {
  const context = workerContexts.get(supabase)
  if (!context || context.command === command) return
  context.command = command
  context.commandExecuted = false
  whatsappTrace('WHATSAPP_COMMAND_DETECTED', { ...workerTrace(context), command })
}
function checkedWorkerClient(base, job) {
  const context = {
    id: job.id,
    eventKey: job.event_key,
    command: null,
    commandExecuted: false,
    uncertain: false,
    sent: false,
    effect: false,
    mark: async (stage) => {
      const { error } = await base.rpc('whatsapp_mark_effect', {
        p_id: job.id,
        p_lease: job.lease_token,
        p_stage: stage,
      })
      if (error) throw new Error('lease_lost')
      context.effect = true
    },
    releaseRejectedReply: async () => {
      const { error } = await base.rpc('whatsapp_release_rejected_inbound_reply', {
        p_id: job.id,
        p_lease: job.lease_token,
      })
      if (error) throw new Error('lease_lost')
      context.effect = false
    },
  }
  const wrap = (builder, table, write = false) =>
    new Proxy(builder, {
      get(target, key) {
        if (key === 'then')
          return (resolve, reject) =>
            (async () => {
              if (
                write &&
                ![
                  'external_inbound_messages',
                  'whatsapp_messages',
                  'action_delivery_log',
                  'user_channel_identities',
                ].includes(table)
              )
                await context.mark('database_write:' + table)
              const result = await target
              if (
                result.error &&
                !(
                  table === 'external_inbound_messages' &&
                  result.error.code === '23505'
                )
              )
                throw new Error('database_' + (result.error.code || 'error'))
              return result
            })().then(resolve, reject)
        const member = target[key]
        if (typeof member !== 'function') return member
        return (...args) =>
          wrap(
            member.apply(target, args),
            table,
            write ||
              ['insert', 'update', 'upsert', 'delete'].includes(String(key))
          )
      },
    })
  const client = new Proxy(base, {
    get(target, key) {
      if (key === 'from') return (table) => wrap(target.from(table), table)
      if (key === 'rpc')
        return (...args) =>
          wrap(
            target.rpc(...args),
            'rpc',
            ['whatsapp_apply_action', 'whatsapp_apply_team'].includes(args[0])
          )
      const member = target[key]
      return typeof member === 'function' ? member.bind(target) : member
    },
  })
  workerContexts.set(client, context)
  return client
}
async function runInboundWorker(req) {
  const secret = Deno.env.get('WHATSAPP_DISPATCHER_SECRET') || ''
  const supplied = req.headers.get('x-dispatcher-secret') || ''
  if (!secret || !timingSafeEqualHex(secret, supplied))
    return new Response('forbidden', { status: 403 })
  const base = adminClient()
  for (let i = 0; i < 5; i++) {
    const { data, error } = await base.rpc('whatsapp_claim_inbound')
    if (error) {
      whatsappTrace('WHATSAPP_PROCESSING_FAILED', { stage: 'claim', code: safeDatabaseCode(error) })
      return new Response('queue_unavailable', { status: 503 })
    }
    const job = data?.[0]
    if (!job) break
    const claimedAt = new Date()
    const processingStartedAt = performance.now()
    const client = checkedWorkerClient(base, job)
    let ok = false,
      code = null
    try {
      console.info(
        JSON.stringify({
          event: 'whatsapp_processing',
          correlation_id: job.id,
          stage: 'claimed',
          attempt: job.attempts,
          kind: job.kind,
          claimed_at: claimedAt.toISOString(),
          queue_ms: job.created_at
            ? Math.max(0, claimedAt.getTime() - Date.parse(job.created_at))
            : null,
        })
      )
      await processWhatsAppPayload(job.payload, client)
      if (workerContexts.get(client)?.uncertain)
        throw new Error('provider_outcome_unknown')
      ok = true
    } catch (error) {
      const candidate = error instanceof Error ? error.message : ''
      code =
        /^(database_[A-Z0-9]+|provider_http_\d+|provider_outcome_unknown|provider_missing_message_id|lease_lost|missing_whatsapp_secrets)$/.test(
          candidate
        )
          ? candidate
          : workerContexts.get(client)?.uncertain ? 'provider_outcome_unknown' : 'processing_error'
      whatsappTrace('WHATSAPP_PROCESSING_FAILED', {
        ...workerTrace(workerContexts.get(client)), stage: 'worker', code,
      })
      if (
        job.kind === 'message' &&
        !workerContexts.get(client)?.sent &&
        !workerContexts.get(client)?.uncertain &&
        (job.attempts >= 4 || workerContexts.get(client)?.effect)
      ) {
        try {
          await replyText(
            client,
            job.sender,
            'No pude completar la consulta o actualización en este momento. No he podido confirmar el resultado.',
            null,
            { correlation_id: job.id }
          )
        } catch {
          /* retained for review */
        }
      }
    }
    const result = await base.rpc('whatsapp_finish_inbound', {
      p_id: job.id,
      p_lease: job.lease_token,
      p_ok: ok,
      p_error: code,
    })
    if (result.error) {
      whatsappTrace('WHATSAPP_PROCESSING_FAILED', { ...workerTrace(workerContexts.get(client)), stage: 'finish', code: safeDatabaseCode(result.error) })
      return new Response('finish_failed', { status: 503 })
    }
    console.info(
      JSON.stringify({
        event: 'whatsapp_processing',
        correlation_id: job.id,
        stage: ok ? 'completed' : 'attention_required',
        processing_ms: Math.round(performance.now() - processingStartedAt),
      })
    )
  }
  return new Response('ok')
}
function safeDatabaseCode(error) {
  return /^[A-Z0-9]{5,8}$/.test(error?.code || '') ? error.code : 'unknown'
}

Deno.serve(async (req) => {
  try {
    if (new URL(req.url).searchParams.get('worker') === '1') {
      if (req.method !== 'POST')
        return new Response('method_not_allowed', { status: 405 })
      return await runInboundWorker(req)
    }
    return await acceptWhatsAppWebhook(
      req,
      {
        appSecret: Deno.env.get('WHATSAPP_APP_SECRET') || '',
        verifyToken:
          Deno.env.get('WHATSAPP_VERIFY_TOKEN') ||
          Deno.env.get('token_de_verificacion') ||
          '',
        phoneId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '',
        wabaId:
          Deno.env.get('WHATSAPP_WABA_ID') ||
          Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') ||
          '',
      },
      async (events) => {
        if (!events.length) return
        const { error } = await adminClient().rpc('whatsapp_enqueue_inbound', {
          p_events: events,
        })
        if (error) {
          whatsappTrace('WHATSAPP_PROCESSING_FAILED', {
            stage: 'enqueue_rpc', code: safeDatabaseCode(error),
          })
          throw new Error('enqueue_failed')
        }
      }
    )
  } catch {
    console.error(
      JSON.stringify({ event: 'whatsapp_ingress', stage: 'unavailable' })
    )
    return new Response('temporarily_unavailable', { status: 503 })
  }
})
