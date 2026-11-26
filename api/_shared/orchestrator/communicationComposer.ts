/**
 * Inteligencia contextual y composición de herramientas para comunicaciones (Web, WhatsApp, Voz).
 *
 * Separa los atributos semánticos de una solicitud de comunicación (intención, canal, destinatario,
 * propósito, información requerida, alcance, periodo, contenido explícito, consultas, tono y operación)
 * y reutiliza exclusivamente las herramientas de lectura R1 autorizadas (queryActions, queryOkrs,
 * authorizeQuery) para redactar mensajes reales, breves y contextualizados sin copiar nunca la
 * instrucción original del usuario como cuerpo del mensaje.
 */
import { createHash } from 'node:crypto'
import { isWhatsAppCommunicationAllowed } from '../../../supabase/functions/_shared/whatsappCommunicationGate.js'
import type { CopilotProposal } from '../../../src/features/ai-support/copilot/types.js'
import type { ActionItem, ActionsQueryRequest, OkrItem, OkrsQueryRequest, QueryResult } from '../query/contracts.js'
import { authorizeQuery } from '../query/authorizeQuery.js'
import type { AgentActor } from '../query/resolveActor.js'
import { extractResponsablePatch, type EntityCatalogUser, type EntityResolutionCatalog } from './structuredActionDraft.js'
import type { ReferencedAction, SessionContext } from './sessionContext.js'
import { normalizeColloquialTypos } from './multiIntent.js'

export type CommunicationChannel = 'whatsapp' | 'email'
export type CommunicationRecipientMode = 'single' | 'group_responsables' | 'direction' | 'contextual'
export type CommunicationContentMode = 'explicit' | 'delegated' | 'contextual' | 'analytical' | 'mixed'
export type CommunicationTone = 'direct' | 'consultative' | 'executive' | 'followup'
export type CommunicationScope = 'recipient_personal' | 'team_authorized' | 'group_per_responsable'
export type CommunicationPeriod = 'today' | 'this_week' | 'all_open' | 'contextual'

export type CommunicationPurpose =
  | 'daily_brief'
  | 'pending_actions'
  | 'overdue_reminder'
  | 'blockers'
  | 'status_check'
  | 'okr_progress'
  | 'executive_team_update'
  | 'weekly_summary'
  | 'action_completed'
  | 'action_assigned'
  | 'explicit_message'
  | 'mixed'
  | 'general_followup'

export type RequiredCommunicationQuery =
  | 'recipient_open_actions'
  | 'recipient_verification_actions'
  | 'team_open_actions'
  | 'okrs'
  | 'group_open_actions'

export type CommunicationFinalOperation =
  | 'propose_send'
  | 'prepare_copy'
  | 'propose_group_send'
  | 'inform_empty'

export type CommunicationIntentSpec = {
  intent: 'send_communication' | 'draft_communication'
  channel: CommunicationChannel
  recipientMode: CommunicationRecipientMode
  recipientHint: string | null
  purpose: CommunicationPurpose
  requiredQueries: RequiredCommunicationQuery[]
  scope: CommunicationScope
  period: CommunicationPeriod
  explicitContent: string | null
  literalContent?: boolean
  contentMode: CommunicationContentMode
  tone: CommunicationTone
  finalOperation: CommunicationFinalOperation
}

export type PendingCommunicationRecipientDraft = {
  recipientId: string | null
  recipientName: string
  channel: CommunicationChannel
  canSendDirect: boolean
  channelLimitation: string | null
  subject: string | null
  messageBody: string
  itemCount: number
}

export type PendingCommunicationProposal = {
  proposalId: string
  idempotencyKey: string
  version: number
  status: 'pending' | 'confirmed' | 'cancelled'
  channel: CommunicationChannel
  recipientMode: CommunicationRecipientMode
  purpose: CommunicationPurpose
  recipients: PendingCommunicationRecipientDraft[]
  canSendDirect: boolean
  channelLimitation: string | null
  createdAt: string
  confirmedAt?: string | null
  execution?: {version: number; proposal: CopilotProposal}
  /** Structured purpose survives recipient/channel edits; never store raw instructions as a body. */
  spec?: CommunicationIntentSpec
}

export type CommunicationDispatchFns = {
  queryActions: (
    copilot: AgentActor['copilot'],
    req: ActionsQueryRequest
  ) => Promise<QueryResult<ActionItem>>
  queryOkrs: (
    copilot: AgentActor['copilot'],
    req: OkrsQueryRequest
  ) => Promise<QueryResult<OkrItem>>
}

export type ComposeCommunicationOutcome =
  | {
      kind: 'proposal'
      spec: CommunicationIntentSpec
      proposal: PendingCommunicationProposal
      formattedText: string
      canSendDirect: boolean
    }
  | {
      kind: 'empty'
      spec: CommunicationIntentSpec
      message: string
    }
  | {
      kind: 'clarification'
      spec: CommunicationIntentSpec
      question: string
    }
  | {
      kind: 'forbidden'
      spec: CommunicationIntentSpec
      reason: string
    }
  | {
      kind: 'error'
      spec: CommunicationIntentSpec
      message: string
    }

const WHATSAPP_TARGET_MAX_CHARS = 900
const MAX_HIGHLIGHT_ITEMS = 3

function norm(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sentenceCase(value: string): string {
  const s = cleanSpaces(value)
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function firstName(fullName: string | null | undefined): string {
  const cleaned = cleanSpaces(fullName ?? '')
  if (!cleaned) return ''
  if (/^direcci[oó]n$/i.test(cleaned)) return 'equipo de Dirección'
  return cleaned.split(/\s+/)[0] ?? cleaned
}

function isBlockedStatus(estado: string | null | undefined): boolean {
  return /\bbloquead[oa]?\b/i.test(norm(estado ?? ''))
}

function isDoneStatus(estado: string | null | undefined): boolean {
  const e = norm(estado ?? '')
  return e === 'hecho' || e === 'verificado' || e === 'cerrado' || e === 'completado'
}

function isOverdue(action: ActionItem, today: string): boolean {
  if (!action.fecha || isDoneStatus(action.estado)) return false
  return action.fecha.slice(0, 10) < today
}

function isDueToday(action: ActionItem, today: string): boolean {
  if (!action.fecha || isDoneStatus(action.estado)) return false
  return action.fecha.slice(0, 10) === today
}

function priorityRank(prioridad: string | null | undefined): number {
  const p = norm(prioridad ?? '')
  if (p.includes('p1') || p.includes('alta') || p.includes('crit')) return 0
  if (p.includes('p2') || p.includes('media')) return 1
  if (p.includes('p3') || p.includes('baja')) return 2
  return 3
}

function sortActionable(actions: ActionItem[], today: string): ActionItem[] {
  return [...actions].sort((a, b) => {
    const aBlocked = isBlockedStatus(a.estado) ? 0 : 1
    const bBlocked = isBlockedStatus(b.estado) ? 0 : 1
    if (aBlocked !== bBlocked) return aBlocked - bBlocked
    const aOver = isOverdue(a, today) ? 0 : 1
    const bOver = isOverdue(b, today) ? 0 : 1
    if (aOver !== bOver) return aOver - bOver
    const aToday = isDueToday(a, today) ? 0 : 1
    const bToday = isDueToday(b, today) ? 0 : 1
    if (aToday !== bToday) return aToday - bToday
    const pDiff = priorityRank(a.prioridad) - priorityRank(b.prioridad)
    if (pDiff !== 0) return pDiff
    return (a.fecha ?? '9999-99-99').localeCompare(b.fecha ?? '9999-99-99')
  })
}

function formatShortDate(fecha: string | null | undefined, today: string): string {
  if (!fecha) return 'sin fecha'
  const day = fecha.slice(0, 10)
  if (day === today) return 'hoy'
  return day
}

/**
 * Extrae el contenido explícito real (si existe) sin copiar nunca el verbo de comando ni el destinatario.
 * Ej: "Dile a Gerardo que necesito el reporte mañana" -> "Necesito el reporte mañana."
 * Ej: "Mándale sus pendientes y dile que priorice los vencidos" -> "Prioriza los vencidos."
 */
function extractExplicitClause(cleanedUtterance: string): string | null {
  const patterns = [
    /\by\s+(?:dile|av[ií]sale|com[eé]ntale|p[ií]dele|recu[eé]rdale)\s+que\s+(.+)$/i,
    /\b(?:dile|av[ií]sale|com[eé]ntale|p[ií]dele|inf[oó]rmale)\s+(?:a\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?\s+)?que\s+(.+)$/i,
    /\bque\s+(necesito\s+.+|la\s+reuni[oó]n\s+.+|ya\s+qued[oó].*|ya\s+le\s+asign[eé].+|priorice\s+.+|cierre\s+.+)$/i,
  ]
  for (const re of patterns) {
    const match = cleanedUtterance.match(re)
    if (match?.[1]) {
      const clause = cleanSpaces(match[1]).replace(/[.?!]+$/, '').trim()
      // Evitar capturar frases vacías o puramente delegadas ("que tiene pendiente")
      if (clause.length >= 3 && !/^(tiene|lleva|vence|hay)\b/i.test(norm(clause))) {
        return sentenceCase(clause)
      }
    }
  }
  return null
}

function extractRecipientHint(cleanedUtterance: string): string | null {
  const stop = new Set([
    'los', 'las', 'el', 'la', 'un', 'una', 'mi', 'mis', 'su', 'sus', 'este', 'esta',
    'eso', 'todos', 'todas', 'responsables', 'equipo', 'hoy', 'manana', 'whatsapp',
    'correo', 'mail', 'email', 'mensaje', 'resumen', 'pendientes', 'bloqueos',
  ])

  const candidates = [
    cleanedUtterance.match(/\b(?:pon|poner)\s+a\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)\s+al\s+tanto\b/i),
    cleanedUtterance.match(/\b(?:a|con|para)\s+(Direcci[oó]n|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/),
    cleanedUtterance.match(/\b(?:env[ií]ale|m[aá]ndale|dile|av[ií]sale|preg[uú]ntale|recu[eé]rdale|p[ií]dele|p[aá]sale|notif[ií]cale)\s+a\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)\b/i),
    cleanedUtterance.match(/\b(?:whatsapp|correo|mail|email)\s+a\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)\b/i),
    cleanedUtterance.match(/\b(?:pon|poner)\s+a\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\s+al\s+tanto\b/i),
  ]

  for (const m of candidates) {
    const raw = m?.[1]?.trim()
    if (!raw) continue
    // Recortar palabras de enlace que pudieran haberse pegado al nombre ("Gerardo un", "Gerardo sus")
    const tokens = raw.split(/\s+/)
    const cleanTokens: string[] = []
    for (const tok of tokens) {
      if (stop.has(norm(tok)) || /^(de|del|en|por|con|para|que|y|su|sus|un|una|al|como|sobre)$/i.test(norm(tok))) {
        break
      }
      cleanTokens.push(tok)
    }
    const cleaned = cleanTokens.join(' ').trim()
    if (cleaned && !stop.has(norm(cleaned))) {
      return cleaned
    }
  }
  return extractResponsablePatch(cleanedUtterance).hint
}

/**
 * Analiza una instrucción de comunicación y separa sus atributos semánticos.
 */
export function parseCommunicationIntent(
  utterance: string,
  session?: SessionContext | null
): CommunicationIntentSpec {
  // Classify only the instruction envelope; dictated text must not alter scope or intent.
  const literalMatch = utterance.match(/\bque\s+diga\s*:\s*([\s\S]+)$/i)
  const literalBody = literalMatch?.[1]?.trim()
  const cleaned = normalizeColloquialTypos(literalMatch ? utterance.slice(0, literalMatch.index) : utterance)
  const text = norm(cleaned)

  const isDraftOnly =
    /\b(redacta|redactar|prepara|preparar|arma|armar)\b/.test(text) &&
    !/\b(envia|enviale|enviales|manda|mandale|mandales|comparte|dile|avisale|recuerdale|preguntale|pasale|pon\s+a)\b/.test(text)

  const isEmail = /\b(correo|mail|email|resumen semanal)\b/.test(text)
  const isWhatsApp = /\bwhatsapp\b/.test(text)
  const channel: CommunicationChannel = isWhatsApp ? 'whatsapp' : isEmail ? 'email' : 'whatsapp'

  const isGroup =
    /\b(mandales|enviales|avisales|recuerdales|notificales)\b/.test(text) ||
    /\b(a todos(?: los responsables)?|a los responsables|cada responsable|compromisos individuales)\b/.test(text)

  const isDirection = /\b(direccion|directivos?|gerencia)\b/.test(text)
  const recipientHint = isGroup ? null : isDirection ? 'Dirección' : extractRecipientHint(cleaned)

  const recipientMode: CommunicationRecipientMode = isGroup
    ? 'group_responsables'
    : isDirection
      ? 'direction'
      : recipientHint
        ? 'single'
        : 'contextual'

  const explicitContent = literalBody || extractExplicitClause(cleaned)

  // Detección de propósito semántico (sin depender de una sola frase fija)
  const asksDaily =
    /\b(su dia|dia de hoy|jornada|al tanto de su dia|agenda de hoy|su agenda|como esta su dia)\b/.test(text)
  const asksOverdue =
    /\b(vencimientos?|vencid[oa]s?|atrasad[oa]s?|retraso|lleva atrasad[oa]|lo que vence)\b/.test(text)
  const asksBlockers = /\b(bloqueos?|bloquead[oa]s?|trabad[oa]s?|impedimentos?)\b/.test(text)
  const asksPending =
    /\b(pendientes?|compromisos?|prioridades?|que necesita resolver|ponga al corriente|lo que tiene)\b/.test(text)
  const asksOkr = /\b(indicadores?|okrs?|objetivos?|krs?|metas?)\b/.test(text)
  const asksWeekly = /\b(resumen semanal|corte semanal|avance semanal|esta semana)\b/.test(text)
  const asksStatusCheck =
    /\b(como va|estatus|estado de sus|avance de sus|preguntale como va|dile como va)\b/.test(text)
  const asksTeamUpdate =
    isDirection || /\b(avance de su equipo|como va su equipo|avance del equipo|reporte ejecutivo)\b/.test(text)
  const asksCompleted = /\b(ya quedo|ya esta list[oa]|ya se cerro|ya termin[eo])\b/.test(text)
  const asksAssigned = /\b(ya le asigne|le asigne|nueva accion|lo del inventario|lo de )\b/.test(text)
  const asksRecentContext = /\b(lo que acabamos de revisar|de los cambios|esto que vimos|ese resumen)\b/.test(text)

  const hasDelegatedDataNeed =
    asksDaily || asksOverdue || asksBlockers || asksPending || asksOkr || asksWeekly || asksStatusCheck || asksTeamUpdate

  let purpose: CommunicationPurpose = 'general_followup'
  if (literalBody) {
    purpose = 'explicit_message'
  } else if (explicitContent && hasDelegatedDataNeed) {
    purpose = 'mixed'
  } else if (asksTeamUpdate) {
    purpose = 'executive_team_update'
  } else if (asksWeekly) {
    purpose = 'weekly_summary'
  } else if (asksDaily) {
    purpose = 'daily_brief'
  } else if (asksBlockers) {
    purpose = 'blockers'
  } else if (asksOverdue) {
    purpose = 'overdue_reminder'
  } else if (asksOkr) {
    purpose = 'okr_progress'
  } else if (asksPending) {
    purpose = 'pending_actions'
  } else if (asksStatusCheck) {
    purpose = 'status_check'
  } else if (asksCompleted) {
    purpose = 'action_completed'
  } else if (asksAssigned) {
    purpose = 'action_assigned'
  } else if (explicitContent) {
    purpose = 'explicit_message'
  } else if (asksRecentContext && (session?.lastEntity || (session?.lastActions?.length ?? 0) > 0)) {
    purpose = 'general_followup'
  }

  let contentMode: CommunicationContentMode = 'delegated'
  if (purpose === 'mixed') {
    contentMode = 'mixed'
  } else if (purpose === 'explicit_message') {
    contentMode = 'explicit'
  } else if (purpose === 'action_completed' || purpose === 'action_assigned' || asksRecentContext) {
    contentMode = 'contextual'
  } else if (
    purpose === 'executive_team_update' ||
    purpose === 'weekly_summary' ||
    purpose === 'status_check' ||
    purpose === 'okr_progress'
  ) {
    contentMode = 'analytical'
  }

  const scope: CommunicationScope =
    recipientMode === 'group_responsables'
      ? 'group_per_responsable'
      : purpose === 'executive_team_update' || recipientMode === 'direction'
        ? 'team_authorized'
        : 'recipient_personal'

  const period: CommunicationPeriod =
    /\b(hoy|dia de hoy|su dia|vence hoy)\b/.test(text)
      ? 'today'
      : asksWeekly
        ? 'this_week'
        : contentMode === 'contextual'
          ? 'contextual'
          : 'all_open'

  const requiredQueries: RequiredCommunicationQuery[] = []
  if (contentMode === 'explicit') {
    // Sin consultas innecesarias cuando el usuario dictó el mensaje explícito
  } else if (scope === 'group_per_responsable') {
    requiredQueries.push('group_open_actions')
  } else if (scope === 'team_authorized') {
    requiredQueries.push('team_open_actions', 'okrs')
  } else if (
    purpose === 'daily_brief' ||
    purpose === 'weekly_summary' ||
    purpose === 'status_check'
  ) {
    requiredQueries.push('recipient_open_actions', 'recipient_verification_actions')
    if (purpose === 'weekly_summary') requiredQueries.push('okrs')
  } else if (purpose === 'okr_progress') {
    requiredQueries.push('recipient_open_actions', 'okrs')
  } else if (
    purpose === 'pending_actions' ||
    purpose === 'overdue_reminder' ||
    purpose === 'blockers' ||
    purpose === 'mixed'
  ) {
    requiredQueries.push('recipient_open_actions')
  }

  const tone: CommunicationTone =
    recipientMode === 'direction' || purpose === 'executive_team_update' || channel === 'email'
      ? 'executive'
      : purpose === 'status_check' || purpose === 'overdue_reminder'
        ? 'followup'
        : purpose === 'daily_brief'
          ? 'consultative'
          : 'direct'

  const finalOperation: CommunicationFinalOperation =
    recipientMode === 'group_responsables'
      ? 'propose_group_send'
      : isDraftOnly || channel === 'email'
        ? 'prepare_copy'
        : 'propose_send'

  return {
    intent: isDraftOnly ? 'draft_communication' : 'send_communication',
    channel,
    recipientMode,
    recipientHint,
    purpose,
    requiredQueries,
    scope,
    period,
    explicitContent,
    ...(literalBody ? {literalContent:true} : {}),
    contentMode,
    tone,
    finalOperation,
  }
}

function resolveSingleRecipient(
  hint: string | null,
  catalog: EntityResolutionCatalog,
  session?: SessionContext | null
):
  | { ok: true; user: EntityCatalogUser | null; displayName: string }
  | { ok: false; kind: 'clarification'; question: string }
  | { ok: false; kind: 'forbidden'; reason: string } {
  if (!hint) {
    const previous = session?.pendingCommunication?.recipients
    if (previous?.length === 1 && previous[0]?.recipientId) {
      const found = catalog.users.find(u => u.id === previous[0]!.recipientId && u.activo !== false)
      if (found) return { ok: true, user: found, displayName: found.nombre }
    }
    if (session?.lastEntity?.kind === 'person') {
      const found = catalog.users.find((u) => u.id === session.lastEntity?.id && u.activo !== false)
      if (found) return { ok: true, user: found, displayName: found.nombre }
    }
    const singleAction = session?.lastActions?.length === 1 ? session.lastActions[0] : null
    if (singleAction?.responsableId) {
      const found = catalog.users.find((u) => u.id === singleAction.responsableId && u.activo !== false)
      if (found) return { ok: true, user: found, displayName: found.nombre }
      if (singleAction.responsableNombre) {
        return { ok: true, user: null, displayName: singleAction.responsableNombre }
      }
    }
    return { ok: false, kind: 'clarification', question: '¿A quién deseas enviar este mensaje?' }
  }

  const needle = norm(hint)
  if (/^(direccion|directivos?|gerencia)$/.test(needle)) {
    const dirUsers = catalog.users.filter((u) => u.activo !== false && /direcci/i.test(norm(u.nombre)))
    if (dirUsers.length === 1) {
      return { ok: true, user: dirUsers[0]!, displayName: dirUsers[0]!.nombre }
    }
    return { ok: true, user: null, displayName: 'Dirección' }
  }

  const active = catalog.users.filter((u) => u.activo !== false)
  const exact = active.filter((u) => norm(u.nombre) === needle)
  const firstNameMatches = active.filter((u) => norm(u.nombre).split(/\s+/)[0] === needle)
  const partialMatches = active.filter((u) => norm(u.nombre).includes(needle))
  const matches = exact.length ? exact : firstNameMatches.length ? firstNameMatches : partialMatches

  if (matches.length === 1) {
    return { ok: true, user: matches[0]!, displayName: matches[0]!.nombre }
  }
  if (matches.length > 1) {
    const names = matches.slice(0, 4).map((u) => u.nombre).join(' o ')
    return { ok: false, kind: 'clarification', question: `¿A quién te refieres: ${names}?` }
  }
  return {
    ok: false,
    kind: 'forbidden',
    reason: `No encontré un destinatario activo y autorizado llamado «${hint}». No se inventan destinatarios ni teléfonos.`,
  }
}

function checkDirectDeliveryCapability(
  channel: CommunicationChannel,
  user: EntityCatalogUser | null,
  isDraftOnly: boolean,
  actor?: AgentActor
): { canSendDirect: boolean; limitation: string | null } {
  const approvedPilot = actor?.channel === 'whatsapp' && Boolean(actor.copilot.whatsappId) && Boolean(user) &&
    isWhatsAppCommunicationAllowed(process.env, actor.usuarioId, user!.id, channel)
  // In the explicitly allowlisted pilot, preparation may create an approval, never a send.
  if (isDraftOnly && !approvedPilot) {
    return {
      canSendDirect: false,
      limitation: 'Modo borrador: puedes revisar o copiar este mensaje antes de enviarlo.',
    }
  }
  if (channel === 'email') {
    if (actor?.channel === 'whatsapp' && actor.copilot.whatsappId && user && isWhatsAppCommunicationAllowed(process.env,actor.usuarioId,user.id,'email')) return {canSendDirect:true,limitation:null}
    return {
      canSendDirect: false,
      limitation: 'El envío directo de correo electrónico no está habilitado; puedes copiar este mensaje y enviarlo desde tu cliente de correo.',
    }
  }
  if (user && user.hasWhatsApp === false) {
    return {
      canSendDirect: false,
      limitation: `${user.nombre} no tiene un canal de WhatsApp verificado y disponible; puedes copiar el mensaje para compartirlo manualmente.`,
    }
  }
  return { canSendDirect: true, limitation: null }
}

function clampWhatsApp(text: string): string {
  if (text.length <= WHATSAPP_TARGET_MAX_CHARS) return text
  return `${text.slice(0, WHATSAPP_TARGET_MAX_CHARS - 1).trim()}…`
}

function formatActionBullet(a: ActionItem, today: string): string {
  const tags: string[] = []
  if (isBlockedStatus(a.estado)) tags.push('bloqueada')
  else if (isOverdue(a, today)) tags.push(`vencida ${a.fecha?.slice(0, 10) ?? ''}`.trim())
  else if (isDueToday(a, today)) tags.push('vence hoy')
  else if (a.fecha) tags.push(`para ${formatShortDate(a.fecha, today)}`)
  const suffix = tags.length ? ` (${tags.join(', ')})` : ''
  return `- ${a.title}${suffix}`
}

function buildPersonalMessage(params: {
  spec: CommunicationIntentSpec
  recipientName: string
  actions: ActionItem[]
  verificationActions: ActionItem[]
  okrs: OkrItem[]
  today: string
  referencedAction?: ReferencedAction | null
}): { emptyReason: string | null; subject: string | null; body: string } {
  const { spec, recipientName, actions, verificationActions, okrs, today, referencedAction } = params
  const name = firstName(recipientName) || recipientName

  const dueToday = actions.filter((a) => isDueToday(a, today))
  const overdue = actions.filter((a) => isOverdue(a, today))
  const blocked = actions.filter((a) => isBlockedStatus(a.estado))
  const sorted = sortActionable(actions, today)

  // A. Contenido explícito puro (sin consultar DB innecesariamente)
  if (spec.purpose === 'explicit_message' && spec.explicitContent) {
    if (spec.literalContent) return {emptyReason:null,subject:spec.channel === 'email' ? `Mensaje para ${name}` : null,body:spec.explicitContent}

    const cleanMsg = spec.explicitContent.endsWith('.') || spec.explicitContent.endsWith('?')
      ? spec.explicitContent
      : `${spec.explicitContent}.`
    const subject = spec.channel === 'email' ? `Mensaje para ${name}` : null
    const body = `Hola ${name}, ${cleanMsg.charAt(0).toLowerCase()}${cleanMsg.slice(1)}`
    return { emptyReason: null, subject, body: spec.channel === 'whatsapp' ? clampWhatsApp(body) : body }
  }

  // C. Contenido contextual: acción terminada / asignada
  if (spec.purpose === 'action_completed') {
    const refTitle = referencedAction?.title
    const subject = spec.channel === 'email' ? `Actualización: ${refTitle ?? 'acción completada'}` : null
    const body = refTitle
      ? `Hola ${name}, te aviso que «${refTitle}» ya quedó lista.`
      : `Hola ${name}, te aviso que el pendiente que revisamos ya quedó listo.`
    return { emptyReason: null, subject, body }
  }

  if (spec.purpose === 'action_assigned') {
    const refTitle = referencedAction?.title
    const refDate = referencedAction?.fecha ? ` para el ${referencedAction.fecha.slice(0, 10)}` : ''
    const subject = spec.channel === 'email' ? `Nueva asignación: ${refTitle ?? 'acción pendiente'}` : null
    const body = refTitle
      ? `Hola ${name}, ya te asigné «${refTitle}»${refDate}. ¿Me confirmas si tienes todo para arrancarla?`
      : `Hola ${name}, ya te dejé asignada la acción pendiente. ¿Me confirmas recepción?`
    return { emptyReason: null, subject, body }
  }

  // Estados vacíos honestos (Sección 8)
  if (spec.purpose === 'daily_brief') {
    if (dueToday.length === 0 && overdue.length === 0 && blocked.length === 0 && sorted.length === 0 && verificationActions.length === 0) {
      return {
        emptyReason: `${name} no tiene acciones asignadas para hoy ni compromisos vencidos registrados.`,
        subject: null,
        body: '',
      }
    }
    const highlights = [...dueToday, ...sorted.filter((a) => !dueToday.includes(a))].slice(0, MAX_HIGHLIGHT_ITEMS)
    const lines: string[] = []
    if (dueToday.length > 0) {
      lines.push(`Hola ${name}, este es tu resumen de hoy:`)
    } else if (overdue.length > 0 || blocked.length > 0) {
      lines.push(`Hola ${name}, no tienes vencimientos nuevos hoy, pero sí compromisos que requieren atención:`)
    } else {
      lines.push(`Hola ${name}, te comparto tus prioridades activas de hoy:`)
    }
    for (const item of highlights) {
      lines.push(formatActionBullet(item, today))
    }
    const summaryBits: string[] = []
    if (overdue.length > 0) summaryBits.push(`${overdue.length} vencida${overdue.length === 1 ? '' : 's'}`)
    if (blocked.length > 0) summaryBits.push(`${blocked.length} bloqueada${blocked.length === 1 ? '' : 's'}`)
    if (verificationActions.length > 0) {
      summaryBits.push(`${verificationActions.length} pendiente${verificationActions.length === 1 ? '' : 's'} de verificación`)
    }
    if (summaryBits.length > 0) {
      lines.push(`En foco: ${summaryBits.join(', ')}.`)
    }
    lines.push('¿Hay algo que necesites destrabar hoy?')
    const body = lines.join('\n')
    return {
      emptyReason: null,
      subject: spec.channel === 'email' ? `Resumen de tu día (${today})` : null,
      body: spec.channel === 'whatsapp' ? clampWhatsApp(body) : body,
    }
  }

  if (spec.purpose === 'blockers') {
    if (blocked.length === 0) {
      return {
        emptyReason: `${name} no tiene bloqueos activos registrados en sus acciones.`,
        subject: null,
        body: '',
      }
    }
    const lines = [
      `Hola ${name}, tienes ${blocked.length} acción${blocked.length === 1 ? '' : 'es'} bloqueada${blocked.length === 1 ? '' : 's'}:`,
      ...blocked.slice(0, MAX_HIGHLIGHT_ITEMS).map((a) => formatActionBullet(a, today)),
      '¿Qué necesitas para destrabarlas?',
    ]
    return {
      emptyReason: null,
      subject: spec.channel === 'email' ? `Bloqueos activos por resolver` : null,
      body: spec.channel === 'whatsapp' ? clampWhatsApp(lines.join('\n')) : lines.join('\n'),
    }
  }

  if (spec.purpose === 'overdue_reminder') {
    const focus = overdue.length > 0 ? overdue : dueToday
    if (focus.length === 0) {
      return {
        emptyReason: `${name} no tiene compromisos vencidos ni con vencimiento hoy.`,
        subject: null,
        body: '',
      }
    }
    const intro =
      overdue.length > 0
        ? `Hola ${name}, te recuerdo tus vencimientos pendientes (${overdue.length}):`
        : `Hola ${name}, te recuerdo lo que vence hoy (${dueToday.length}):`
    const lines = [
      intro,
      ...focus.slice(0, MAX_HIGHLIGHT_ITEMS).map((a) => formatActionBullet(a, today)),
      '¿Me confirmas estatus o nueva fecha compromiso?',
    ]
    return {
      emptyReason: null,
      subject: spec.channel === 'email' ? `Recordatorio de vencimientos` : null,
      body: spec.channel === 'whatsapp' ? clampWhatsApp(lines.join('\n')) : lines.join('\n'),
    }
  }

  if (spec.purpose === 'pending_actions' || spec.purpose === 'mixed') {
    if (sorted.length === 0) {
      return {
        emptyReason: `${name} no tiene acciones pendientes asignadas en este momento.`,
        subject: null,
        body: '',
      }
    }
    const lines = [
      `Hola ${name}, te comparto tus pendientes prioritarios (${sorted.length} abierta${sorted.length === 1 ? '' : 's'}):`,
      ...sorted.slice(0, MAX_HIGHLIGHT_ITEMS).map((a) => formatActionBullet(a, today)),
    ]
    if (spec.explicitContent) {
      const note = spec.explicitContent.endsWith('.') ? spec.explicitContent : `${spec.explicitContent}.`
      lines.push(note)
    } else {
      lines.push('¿Me compartes estatus de avance?')
    }
    return {
      emptyReason: null,
      subject: spec.channel === 'email' ? `Pendientes prioritarios (${sorted.length})` : null,
      body: spec.channel === 'whatsapp' ? clampWhatsApp(lines.join('\n')) : lines.join('\n'),
    }
  }

  if (spec.purpose === 'status_check') {
    if (sorted.length === 0) {
      return {
        emptyReason: `${name} no tiene acciones abiertas asignadas para dar seguimiento.`,
        subject: null,
        body: '',
      }
    }
    const summaryParts = [`${sorted.length} abierta${sorted.length === 1 ? '' : 's'}`]
    if (overdue.length > 0) summaryParts.push(`${overdue.length} vencida${overdue.length === 1 ? '' : 's'}`)
    if (blocked.length > 0) summaryParts.push(`${blocked.length} bloqueada${blocked.length === 1 ? '' : 's'}`)
    const lines = [
      `Hola ${name}, ¿cómo vas con tus acciones? Actualmente registras ${summaryParts.join(', ')}:`,
      ...sorted.slice(0, MAX_HIGHLIGHT_ITEMS).map((a) => formatActionBullet(a, today)),
      '¿Me compartes cómo avanzan o si hay algún bloqueo?',
    ]
    return {
      emptyReason: null,
      subject: spec.channel === 'email' ? `Seguimiento de avance de acciones` : null,
      body: spec.channel === 'whatsapp' ? clampWhatsApp(lines.join('\n')) : lines.join('\n'),
    }
  }

  if (spec.purpose === 'okr_progress') {
    if (okrs.length === 0 && sorted.length === 0) {
      return {
        emptyReason: `No hay indicadores ni objetivos activos con datos suficientes para compartir con ${name}.`,
        subject: null,
        body: '',
      }
    }
    const lines = [`Hola ${name}, te comparto el corte de indicadores y prioridades:`]
    for (const o of okrs.slice(0, 3)) {
      const pct = o.progress == null ? 'sin datos suficientes' : `${Math.round(o.progress)}%`
      lines.push(`- ${o.name}: ${pct}`)
    }
    if (sorted.length > 0) {
      lines.push(`Acciones activas: ${sorted.length} (${overdue.length} vencidas, ${blocked.length} bloqueadas).`)
    }
    lines.push('¿Revisamos juntos los ajustes necesarios?')
    return {
      emptyReason: null,
      subject: spec.channel === 'email' ? `Corte de indicadores y avance` : null,
      body: spec.channel === 'whatsapp' ? clampWhatsApp(lines.join('\n')) : lines.join('\n'),
    }
  }

  if (spec.purpose === 'weekly_summary') {
    if (sorted.length === 0 && okrs.length === 0) {
      return {
        emptyReason: `No hay acciones ni objetivos activos suficientes para armar el resumen semanal para ${name}.`,
        subject: null,
        body: '',
      }
    }
    const lines = [
      `Hola ${name},`,
      '',
      `Te comparto el resumen semanal al ${today}:`,
      `- Acciones abiertas: ${sorted.length} (${overdue.length} vencidas, ${blocked.length} bloqueadas).`,
    ]
    if (verificationActions.length > 0) {
      lines.push(`- Pendientes de verificación: ${verificationActions.length}.`)
    }
    if (okrs.length > 0) {
      const measured = okrs.filter((o) => o.progress != null)
      if (measured.length > 0) {
        const avg = Math.round(measured.reduce((s, o) => s + (o.progress ?? 0), 0) / measured.length)
        lines.push(`- Avance promedio en objetivos activos: ${avg}% (${measured.length} medibles).`)
      }
    }
    if (sorted.length > 0) {
      lines.push('', 'Prioridades principales:')
      for (const item of sorted.slice(0, MAX_HIGHLIGHT_ITEMS)) {
        lines.push(formatActionBullet(item, today))
      }
    }
    lines.push('', 'Por favor confírmame prioridades y fechas compromiso para la siguiente semana.')
    const body = lines.join('\n')
    return {
      emptyReason: null,
      subject: `Resumen semanal operativo (${today})`,
      body: spec.channel === 'whatsapp' ? clampWhatsApp(body) : body,
    }
  }

  // Fallback contextual seguro (nunca repite la instrucción del usuario)
  if (referencedAction) {
    const body = `Hola ${name}, te escribo para dar seguimiento a «${referencedAction.title}». ¿Me compartes estatus o fecha compromiso?`
    return {
      emptyReason: null,
      subject: spec.channel === 'email' ? `Seguimiento: ${referencedAction.title}` : null,
      body,
    }
  }
  const body = `Hola ${name}, ¿me compartes una actualización breve de tus prioridades actuales?`
  return {
    emptyReason: null,
    subject: spec.channel === 'email' ? `Seguimiento operativo` : null,
    body,
  }
}

function buildExecutiveTeamMessage(params: {
  recipientName: string
  channel: CommunicationChannel
  actions: ActionItem[]
  okrs: OkrItem[]
  today: string
}): { emptyReason: string | null; subject: string | null; body: string } {
  const { recipientName, channel, actions, okrs, today } = params
  if (actions.length === 0 && okrs.length === 0) {
    return {
      emptyReason: 'No hay acciones ni objetivos activos en el alcance del equipo para compartir con Dirección.',
      subject: null,
      body: '',
    }
  }
  const overdue = actions.filter((a) => isOverdue(a, today))
  const blocked = actions.filter((a) => isBlockedStatus(a.estado))
  const top = sortActionable(actions, today).slice(0, MAX_HIGHLIGHT_ITEMS)
  const greeting = /^direcci[oó]n$/i.test(recipientName) ? 'Hola equipo de Dirección,' : `Hola ${firstName(recipientName)},`
  const lines = [
    greeting,
    `Te comparto el corte de avance del equipo al ${today}: ${actions.length} ${actions.length === 1 ? 'acción abierta' : 'acciones abiertas'} (${overdue.length} vencida${overdue.length === 1 ? '' : 's'}, ${blocked.length} bloqueada${blocked.length === 1 ? '' : 's'}).`,
  ]
  if (okrs.length > 0) {
    const measured = okrs.filter((o) => o.progress != null)
    if (measured.length > 0) {
      const avg = Math.round(measured.reduce((s, o) => s + (o.progress ?? 0), 0) / measured.length)
      lines.push(`Objetivos activos: ${okrs.length} (${avg}% de avance promedio en ${measured.length} medibles).`)
    }
  }
  if (top.length > 0) {
    lines.push('Focos principales:')
    for (const item of top) {
      const owner = item.responsableNombre ? ` — ${firstName(item.responsableNombre)}` : ''
      lines.push(`${formatActionBullet(item, today)}${owner}`)
    }
  }
  lines.push('¿Deseas profundizar en alguno de estos frentes?')
  const body = lines.join('\n')
  return {
    emptyReason: null,
    subject: channel === 'email' ? `Corte de avance del equipo (${today})` : null,
    body: channel === 'whatsapp' ? clampWhatsApp(body) : body,
  }
}

/**
 * Formatea la propuesta con UX orientada a la operación (Sección 12):
 * sin encabezados genéricos "Datos" / "Limitaciones" y sin mensajes contradictorios.
 */
export function formatCommunicationProposalText(proposal: PendingCommunicationProposal): string {
  const channelLabel = proposal.channel === 'whatsapp' ? 'WhatsApp' : 'Correo electrónico'

  if (proposal.recipientMode === 'group_responsables' && proposal.recipients.length > 1) {
    const lines: string[] = [
      `Propuesta grupal de ${channelLabel} (${proposal.recipients.length} destinatarios)`,
      '',
    ]
    for (const rec of proposal.recipients) {
      lines.push(`• ${rec.recipientName} (${rec.itemCount} pendiente${rec.itemCount === 1 ? '' : 's'})`)
      if (rec.subject) lines.push(`  Asunto: ${rec.subject}`)
      lines.push(`  ${rec.messageBody.replace(/\n/g, '\n  ')}`)
      lines.push('')
    }
    if (proposal.canSendDirect) {
      lines.push('Confirmar envío grupal | Editar | Cancelar')
    } else {
      lines.push('Copiar mensajes')
      if (proposal.channelLimitation) lines.push(proposal.channelLimitation)
    }
    return lines.join('\n').trim()
  }

  const single = proposal.recipients[0]
  if (!single) return 'No hay destinatarios preparados para esta comunicación.'

  const lines: string[] = []
  if (single.canSendDirect) {
    lines.push(`${channelLabel} para ${single.recipientName}`)
    if (single.subject) lines.push(`Asunto: ${single.subject}`)
    lines.push('', single.messageBody, '', 'Confirmar envío | Editar | Cancelar')
  } else {
    lines.push(`Mensaje preparado para ${single.recipientName}`)
    if (single.subject) lines.push(`Asunto: ${single.subject}`)
    lines.push('', single.messageBody, '', 'Copiar mensaje')
    if (single.channelLimitation) lines.push(single.channelLimitation)
  }
  return lines.join('\n')
}

function makeProposalId(seed: string): string {
  return `comm_${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`
}

/**
 * Genera un mensaje contextualizado cuando se asigna una acción en una instrucción compuesta
 * ("Asígnale a Gerardo revisar inventario para el viernes y mándale un WhatsApp").
 */
export function draftActionAssignedMessage(params: {
  recipientName: string | null
  titulo: string | null
  fecha: string | null
  channel: CommunicationChannel
}): { subject: string | null; body: string } {
  const name = firstName(params.recipientName) || 'equipo'
  const titulo = params.titulo?.trim() || 'la nueva acción asignada'
  const fechaClause = params.fecha ? ` con fecha compromiso ${params.fecha}` : ''
  const subject = params.channel === 'email' ? `Nueva acción asignada: ${titulo}` : null
  const body = `Hola ${name}, te asigné la acción «${titulo}»${fechaClause}. ¿Me confirmas si tienes todo para arrancarla?`
  return { subject, body }
}

/**
 * Edita una propuesta de comunicación pendiente antes de confirmar, incrementando su versión.
 */
export function applyCommunicationEdit(
  proposal: PendingCommunicationProposal,
  utterance: string
): { updated: PendingCommunicationProposal; formattedText: string } {
  const cleaned = cleanSpaces(utterance)
  const appendMatch = cleaned.match(/\b(?:agr[eé]gale|a[ñn][aá]dele|s[uú]male|ponle)\s+(?:que\s+)?(.+)$/i)
  const replaceMatch = cleaned.match(/\b(?:cambia(?:r)?|edita(?:r)?|ajusta(?:r)?)\s+(?:el\s+mensaje\s+)?(?:a|por|:)\s*(.+)$/i)

  const nextRecipients = proposal.recipients.map((rec) => {
    let nextBody = rec.messageBody
    if (appendMatch?.[1]) {
      const addition = sentenceCase(appendMatch[1].replace(/[.]+$/, ''))
      nextBody = `${rec.messageBody}\n${addition}.`
    } else if (replaceMatch?.[1]) {
      nextBody = sentenceCase(replaceMatch[1])
    } else {
      nextBody = sentenceCase(cleaned)
    }
    return {
      ...rec,
      messageBody: rec.channel === 'whatsapp' ? clampWhatsApp(nextBody) : nextBody,
    }
  })

  const updated: PendingCommunicationProposal = {
    ...proposal,
    version: proposal.version + 1,
    recipients: nextRecipients,
  }
  return { updated, formattedText: formatCommunicationProposalText(updated) }
}

/**
 * Orquestador completo: Interpretar → Resolver entidades → Consultar → Analizar → Redactar → Propuesta.
 */
export async function composeContextualCommunication(input: {
  utterance: string
  actor: AgentActor
  catalog: EntityResolutionCatalog
  today: string
  session?: SessionContext | null
  dispatch?: CommunicationDispatchFns
  specOverride?: CommunicationIntentSpec
}): Promise<ComposeCommunicationOutcome> {
  const { utterance, actor, catalog, today, session } = input
  const runActionsQuery = input.dispatch?.queryActions
  const runOkrsQuery = input.dispatch?.queryOkrs
  if (!runActionsQuery || !runOkrsQuery) {
    return {
      kind: 'error',
      spec: parseCommunicationIntent(utterance, session),
      message: 'No hay herramientas de consulta disponibles para preparar esta comunicación.',
    }
  }

  const spec = input.specOverride ?? parseCommunicationIntent(utterance, session)
  const nowIso = new Date().toISOString()

  // 1. Caso grupal: "Mándales a todos los responsables sus pendientes de hoy"
  if (spec.recipientMode === 'group_responsables') {
    const groupReq: ActionsQueryRequest = {
      entity: 'actions',
      scope: 'board_authorized',
      statusGroup: 'open',
      visual: 'none',
      limit: 80,
    }
    const auth = authorizeQuery(actor, groupReq)
    if (!auth.allowed) {
      return { kind: 'forbidden', spec, reason: auth.reason }
    }
    const res = await runActionsQuery(actor.copilot, groupReq)
    if (res.status === 'forbidden') {
      return { kind: 'forbidden', spec, reason: res.error?.message ?? 'No tienes permiso para consultar acciones de otros responsables.' }
    }
    if (res.status === 'error') {
      return { kind: 'error', spec, message: 'No pude consultar los pendientes del equipo en este momento. No se prepararon mensajes sin datos reales.' }
    }

    const byOwner = new Map<string, { id: string; name: string; items: ActionItem[] }>()
    for (const item of res.items) {
      if (!item.responsableId) continue
      const existing = byOwner.get(item.responsableId)
      if (existing) {
        existing.items.push(item)
      } else {
        const catUser = catalog.users.find((u) => u.id === item.responsableId)
        byOwner.set(item.responsableId, {
          id: item.responsableId,
          name: catUser?.nombre ?? item.responsableNombre ?? 'Responsable',
          items: [item],
        })
      }
    }

    if (byOwner.size === 0) {
      return {
        kind: 'empty',
        spec,
        message: 'No hay responsables con acciones pendientes asignadas dentro de tu alcance.',
      }
    }

    const recipientDrafts: PendingCommunicationRecipientDraft[] = []
    for (const group of byOwner.values()) {
      const catUser = catalog.users.find((u) => u.id === group.id) ?? null
      const cap = checkDirectDeliveryCapability(spec.channel, catUser, spec.intent === 'draft_communication', actor)
      const drafted = buildPersonalMessage({
        spec: { ...spec, purpose: spec.period === 'today' ? 'daily_brief' : 'pending_actions' },
        recipientName: group.name,
        actions: group.items,
        verificationActions: [],
        okrs: [],
        today,
      })
      if (drafted.emptyReason) continue
      recipientDrafts.push({
        recipientId: group.id,
        recipientName: group.name,
        channel: spec.channel,
        canSendDirect: cap.canSendDirect,
        channelLimitation: cap.limitation,
        subject: drafted.subject,
        messageBody: drafted.body,
        itemCount: group.items.length,
      })
    }

    if (recipientDrafts.length === 0) {
      return {
        kind: 'empty',
        spec,
        message: 'Ningún responsable tiene acciones aplicables para notificar en este corte.',
      }
    }

    const anyDirect = recipientDrafts.some((r) => r.canSendDirect)
    const idempotencyKey = `comm:${actor.usuarioId}:group:${spec.channel}:${today}:${spec.purpose}`
    const proposal: PendingCommunicationProposal = {
    spec,
      proposalId: makeProposalId(`${idempotencyKey}:${nowIso}`),
      idempotencyKey,
      version: 1,
      status: 'pending',
      channel: spec.channel,
      recipientMode: 'group_responsables',
      purpose: spec.purpose,
      recipients: recipientDrafts,
      canSendDirect: anyDirect,
      channelLimitation: anyDirect
        ? null
        : 'El envío directo masivo no está habilitado para este canal; puedes revisar y copiar cada mensaje individual.',
      createdAt: nowIso,
    }
    return {
      kind: 'proposal',
      spec,
      proposal,
      formattedText: formatCommunicationProposalText(proposal),
      canSendDirect: anyDirect,
    }
  }

  // 2. Resolver destinatario único (o Dirección / contextual)
  const resolved = resolveSingleRecipient(spec.recipientHint, catalog, session)
  if (!resolved.ok) {
    if (resolved.kind === 'clarification') {
      return { kind: 'clarification', spec, question: resolved.question }
    }
    return { kind: 'forbidden', spec, reason: resolved.reason }
  }

  const targetUser = resolved.user
  const recipientName = resolved.displayName
  const cap = checkDirectDeliveryCapability(spec.channel, targetUser, spec.intent === 'draft_communication', actor)

  // 3. Caso reporte ejecutivo de equipo para Dirección
  if (spec.scope === 'team_authorized') {
    const teamReq: ActionsQueryRequest = {
      entity: 'actions',
      scope: 'board_authorized',
      statusGroup: 'open',
      visual: 'none',
      limit: 50,
    }
    const authTeam = authorizeQuery(actor, teamReq)
    if (!authTeam.allowed) {
      return { kind: 'forbidden', spec, reason: authTeam.reason }
    }
    const okrReq: OkrsQueryRequest = { entity: 'okrs', period: 'all_active' }
    const canOkrs = authorizeQuery(actor, okrReq).allowed

    const [teamRes, okrRes] = await Promise.all([
      runActionsQuery(actor.copilot, teamReq),
      canOkrs ? runOkrsQuery(actor.copilot, okrReq) : Promise.resolve(null),
    ])

    if (teamRes.status === 'forbidden') {
      return { kind: 'forbidden', spec, reason: teamRes.error?.message ?? 'No tienes permiso para consultar el avance del equipo.' }
    }
    if (teamRes.status === 'error') {
      return { kind: 'error', spec, message: 'No pude consultar los datos del equipo en este momento. No se generó el mensaje sin datos reales.' }
    }

    const drafted = buildExecutiveTeamMessage({
      recipientName,
      channel: spec.channel,
      actions: teamRes.items,
      okrs: okrRes?.status === 'ok' ? okrRes.items : [],
      today,
    })
    if (drafted.emptyReason) {
      return { kind: 'empty', spec, message: drafted.emptyReason }
    }

    const idempotencyKey = `comm:${actor.usuarioId}:${targetUser?.id ?? 'direction'}:${spec.channel}:${today}:${spec.purpose}`
    const proposal: PendingCommunicationProposal = {
    spec,
      proposalId: makeProposalId(`${idempotencyKey}:${nowIso}`),
      idempotencyKey,
      version: 1,
      status: 'pending',
      channel: spec.channel,
      recipientMode: spec.recipientMode,
      purpose: spec.purpose,
      recipients: [
        {
          recipientId: targetUser?.id ?? null,
          recipientName,
          channel: spec.channel,
          canSendDirect: cap.canSendDirect,
          channelLimitation: cap.limitation,
          subject: drafted.subject,
          messageBody: drafted.body,
          itemCount: teamRes.items.length,
        },
      ],
      canSendDirect: cap.canSendDirect,
      channelLimitation: cap.limitation,
      createdAt: nowIso,
    }
    return {
      kind: 'proposal',
      spec,
      proposal,
      formattedText: formatCommunicationProposalText(proposal),
      canSendDirect: cap.canSendDirect,
    }
  }

  // 4. Caso destinatario personal: ejecutar SOLO las consultas necesarias en paralelo
  let recipientActions: ActionItem[] = []
  let verificationActions: ActionItem[] = []
  let okrs: OkrItem[] = []

  const needsOpen = spec.requiredQueries.includes('recipient_open_actions')
  const needsVerif = spec.requiredQueries.includes('recipient_verification_actions')
  const needsOkrs = spec.requiredQueries.includes('okrs')

  if (needsOpen || needsVerif || needsOkrs) {
    const isSelf = targetUser?.id === actor.usuarioId
    const openReq: ActionsQueryRequest | null = needsOpen
      ? {
          entity: 'actions',
          scope: isSelf ? 'assigned_to_me' : 'board_authorized',
          statusGroup: 'open',
          visual: 'none',
          limit: 30,
          ...(!isSelf && targetUser?.id ? { responsableId: targetUser.id } : {}),
        }
      : null

    if (openReq) {
      const authOpen = authorizeQuery(actor, openReq)
      if (!authOpen.allowed) {
        return { kind: 'forbidden', spec, reason: authOpen.reason }
      }
    }

    const verifReq: ActionsQueryRequest | null = needsVerif
      ? {
          entity: 'actions',
          scope: isSelf ? 'assigned_to_me' : 'board_authorized',
          statusGroup: 'verification',
          visual: 'none',
          limit: 15,
          ...(!isSelf && targetUser?.id ? { responsableId: targetUser.id } : {}),
        }
      : null

    const okrReq: OkrsQueryRequest = { entity: 'okrs', period: 'all_active' }

    const [openRes, verifRes, okrRes]: [
      QueryResult<ActionItem> | null,
      QueryResult<ActionItem> | null,
      QueryResult<OkrItem> | null,
    ] = await Promise.all([
      openReq ? runActionsQuery(actor.copilot, openReq) : Promise.resolve(null),
      verifReq && authorizeQuery(actor, verifReq).allowed
        ? runActionsQuery(actor.copilot, verifReq)
        : Promise.resolve(null),
      needsOkrs && authorizeQuery(actor, okrReq).allowed
        ? runOkrsQuery(actor.copilot, okrReq)
        : Promise.resolve(null),
    ])

    if (openRes?.status === 'forbidden') {
      return {
        kind: 'forbidden',
        spec,
        reason: openRes.error?.message ?? 'No tienes acceso para consultar las acciones de este destinatario.',
      }
    }
    if (openRes?.status === 'error') {
      return {
        kind: 'error',
        spec,
        message: 'No pude consultar las acciones del destinatario en este momento. No se redactó el mensaje para no inventar información.',
      }
    }

    // Asegurar alcance estrictamente personal del destinatario (nunca filtrar acciones ajenas)
    const rawOpen = openRes?.items ?? []
    recipientActions = targetUser?.id
      ? rawOpen.filter((a) => !a.responsableId || a.responsableId === targetUser.id)
      : rawOpen

    const rawVerif = verifRes?.status === 'ok' ? verifRes.items : []
    verificationActions = targetUser?.id
      ? rawVerif.filter((a) => !a.responsableId || a.responsableId === targetUser.id)
      : rawVerif

    okrs = okrRes?.status === 'ok' ? okrRes.items : []
  }

  const referencedAction =
    session?.lastEntity?.kind === 'action'
      ? session.lastActions.find((a) => a.id === session.lastEntity?.id) ?? session.lastActions[0] ?? null
      : session?.lastActions?.[0] ?? null

  const drafted = buildPersonalMessage({
    spec,
    recipientName,
    actions: recipientActions,
    verificationActions,
    okrs,
    today,
    referencedAction,
  })

  if (drafted.emptyReason) {
    return { kind: 'empty', spec, message: drafted.emptyReason }
  }

  const idempotencyKey = `comm:${actor.usuarioId}:${targetUser?.id ?? norm(recipientName)}:${spec.channel}:${today}:${spec.purpose}`
  const proposal: PendingCommunicationProposal = {
    spec,
    proposalId: makeProposalId(`${idempotencyKey}:${nowIso}`),
    idempotencyKey,
    version: 1,
    status: 'pending',
    channel: spec.channel,
    recipientMode: spec.recipientMode,
    purpose: spec.purpose,
    recipients: [
      {
        recipientId: targetUser?.id ?? null,
        recipientName,
        channel: spec.channel,
        canSendDirect: cap.canSendDirect,
        channelLimitation: cap.limitation,
        subject: drafted.subject,
        messageBody: drafted.body,
        itemCount: recipientActions.length,
      },
    ],
    canSendDirect: cap.canSendDirect,
    channelLimitation: cap.limitation,
    createdAt: nowIso,
  }

  return {
    kind: 'proposal',
    spec,
    proposal,
    formattedText: formatCommunicationProposalText(proposal),
    canSendDirect: cap.canSendDirect,
  }
}
