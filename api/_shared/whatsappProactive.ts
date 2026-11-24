/**
 * Motor local (dry-run) de seguimientos proactivos por WhatsApp.
 *
 * Categorías cubiertas:
 * - due_reminder: recordatorios de vencimientos
 * - pending_verification: acciones pendientes de verificación
 * - stale_commitment: compromisos sin seguimiento
 * - daily_summary: resúmenes diarios
 * - agreement_followup: seguimiento de acuerdos
 *
 * Salvaguardas obligatorias:
 * - Usuario activo + consentimiento explícito + categoría habilitada.
 * - Ventana de horario y días permitidos en la zona horaria IANA del usuario.
 * - Deduplicación determinística (`category:usuarioId:entityId:dateBucket`).
 * - Límite de frecuencia diario e intervalo mínimo entre envíos.
 * - Regla de ventana de conversación de 24h de WhatsApp:
 *   - Dentro de 24h: mensaje libre/interactivo.
 *   - Fuera de 24h: sólo plantilla Meta aprobada; si no hay plantilla aprobada, se bloquea.
 * - Estricto modo simulación/dry-run: nunca envía mensajes reales ni activa cron.
 */

export const PROACTIVE_CATEGORIES = [
  'daily_summary',
  'due_reminder',
  'overdue_alert',
  'stale_blocker',
  'stale_commitment',
  'pending_verification',
  'agreement_followup',
  'weekly_executive_summary',
  'okr_risk_alert',
] as const

export type ProactiveCategory = (typeof PROACTIVE_CATEGORIES)[number]

/** Prioridad empresarial para evitar saturación: bloqueos críticos y vencidas primero. */
export const PROACTIVE_CATEGORY_PRIORITY: Record<ProactiveCategory, number> = {
  stale_blocker: 1,
  overdue_alert: 2,
  okr_risk_alert: 3,
  pending_verification: 4,
  due_reminder: 5,
  stale_commitment: 6,
  agreement_followup: 7,
  daily_summary: 8,
  weekly_executive_summary: 9,
}

export type ProactiveCostControl = {
  /** Si es true, bloquea plantillas fuera de ventana de 24h para garantizar $0 USD. */
  zeroCostOnly?: boolean
  maxTemplateMessagesPerDay?: number
  templatesSentToday?: number
  estimatedTemplateCostUsd?: number
  maxEstimatedCostUsd?: number
}

export type ProactiveUserPreferences = {
  usuarioId: string
  waId: string
  active: boolean
  consent: boolean
  timezone: string
  windowStartHour: number // 0-23 inclusive
  windowEndHour: number // 1-24 exclusive
  allowedWeekdays: number[] // 0=Sun..6=Sat
  enabledCategories: ReadonlySet<ProactiveCategory>
  maxPerDay: number
  minIntervalMinutes: number
}

export type ProactiveCandidate = {
  category: ProactiveCategory
  usuarioId: string
  entityId: string
  title: string
  detail: string
  dateBucket: string // YYYY-MM-DD
  href?: string | null
  suggestedAction?: string | null
}

export type ApprovedTemplateSpec = {
  name: string
  language: string
}

export type ProactivePolicyContext = {
  nowIso: string
  lastInboundAt?: string | null
  sentTodayCount: number
  lastProactiveSentAt?: string | null
  sentDedupeKeys: ReadonlySet<string>
  approvedTemplates?: Partial<Record<ProactiveCategory, ApprovedTemplateSpec>>
  costControl?: ProactiveCostControl
}

export type ProactiveBlockReason =
  | 'user_inactive'
  | 'missing_consent'
  | 'category_disabled'
  | 'outside_schedule_window'
  | 'duplicate_suppressed'
  | 'daily_cap_reached'
  | 'cooldown_active'
  | 'template_required_outside_24h'
  | 'cost_cap_exceeded'

export type ProactiveDecision =
  | {
      allowed: true
      dryRun: true
      dedupeKey: string
      transport: 'session_text' | 'approved_template'
      template?: ApprovedTemplateSpec
      bodyText: string
      templateParams?: string[]
    }
  | {
      allowed: false
      dryRun: true
      dedupeKey: string
      reason: ProactiveBlockReason
    }

const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000
const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function buildProactiveDedupeKey(candidate: Pick<ProactiveCandidate, 'category' | 'usuarioId' | 'entityId' | 'dateBucket'>): string {
  return `${candidate.category}:${candidate.usuarioId}:${candidate.entityId}:${candidate.dateBucket}`
}

export function isWithin24hWhatsAppWindow(lastInboundAt: string | null | undefined, nowMs: number): boolean {
  if (!lastInboundAt) return false
  const parsed = Date.parse(lastInboundAt)
  if (!Number.isFinite(parsed)) return false
  return nowMs - parsed >= 0 && nowMs - parsed < WHATSAPP_SESSION_WINDOW_MS
}

export function isWithinUserScheduleWindow(
  nowIso: string,
  prefs: Pick<ProactiveUserPreferences, 'timezone' | 'windowStartHour' | 'windowEndHour' | 'allowedWeekdays'>
): boolean {
  const date = new Date(nowIso)
  const tz = prefs.timezone || 'America/Mexico_City'
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(date)
  } catch {
    return false
  }
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? ''
  const weekday = WEEKDAY_MAP[weekdayStr]
  const hour = Number(hourStr === '24' ? '0' : hourStr)
  if (weekday === undefined || !Number.isFinite(hour)) return false
  if (!prefs.allowedWeekdays.includes(weekday)) return false
  return hour >= prefs.windowStartHour && hour < prefs.windowEndHour
}

const CATEGORY_PREFIX: Record<ProactiveCategory, string> = {
  daily_summary: 'Resumen diario',
  due_reminder: 'Recordatorio de vencimiento',
  overdue_alert: 'Acción vencida',
  stale_blocker: 'Bloqueo sin seguimiento',
  stale_commitment: 'Compromiso sin seguimiento',
  pending_verification: 'Pendiente de verificación',
  agreement_followup: 'Seguimiento de acuerdo',
  weekly_executive_summary: 'Resumen ejecutivo semanal',
  okr_risk_alert: 'Objetivo en riesgo',
}

const DEFAULT_SUGGESTED_ACTION: Record<ProactiveCategory, string> = {
  daily_summary: 'Responde "detalle 1" para abrir tu prioridad principal o "bloqueos" para destrabar al equipo.',
  due_reminder: 'Responde con avance o pide reprogramar fecha antes del cierre.',
  overdue_alert: 'Actualiza estatus, registra bloqueo o define nueva fecha compromiso hoy.',
  stale_blocker: 'Pide un seguimiento al responsable o escala el bloqueo.',
  stale_commitment: 'Confirma si el compromiso sigue vigente o reagenda fecha.',
  pending_verification: 'Revisa evidencia y confirma si procede verificar o devolver a proceso.',
  agreement_followup: 'Responde "ver acuerdos" o pide convertir el pendiente en acción.',
  weekly_executive_summary: 'Responde "qué decisiones debería tomar" para revisar riesgos clave.',
  okr_risk_alert: 'Responde "qué acciones impulsan este objetivo" para definir plan de recuperación.',
}

function formatProactiveBody(candidate: ProactiveCandidate): string {
  const header = CATEGORY_PREFIX[candidate.category]
  const suggested = (candidate.suggestedAction ?? '').trim() || DEFAULT_SUGGESTED_ACTION[candidate.category]
  const parts = [
    `${header}: ${candidate.title}`,
    candidate.detail,
    `Acción sugerida: ${suggested}`,
  ]
  if (candidate.href) parts.push(`Ver en Scrumban: ${candidate.href}`)
  return parts.filter(Boolean).join('\n').slice(0, 900)
}

export function evaluateProactiveFollowup(
  candidate: ProactiveCandidate,
  prefs: ProactiveUserPreferences,
  ctx: ProactivePolicyContext
): ProactiveDecision {
  const dedupeKey = buildProactiveDedupeKey(candidate)
  const nowMs = Date.parse(ctx.nowIso)

  if (!prefs.active) {
    return { allowed: false, dryRun: true, dedupeKey, reason: 'user_inactive' }
  }
  if (!prefs.consent) {
    return { allowed: false, dryRun: true, dedupeKey, reason: 'missing_consent' }
  }
  if (!prefs.enabledCategories.has(candidate.category)) {
    return { allowed: false, dryRun: true, dedupeKey, reason: 'category_disabled' }
  }
  if (!isWithinUserScheduleWindow(ctx.nowIso, prefs)) {
    return { allowed: false, dryRun: true, dedupeKey, reason: 'outside_schedule_window' }
  }
  if (ctx.sentDedupeKeys.has(dedupeKey)) {
    return { allowed: false, dryRun: true, dedupeKey, reason: 'duplicate_suppressed' }
  }
  if (ctx.sentTodayCount >= prefs.maxPerDay) {
    return { allowed: false, dryRun: true, dedupeKey, reason: 'daily_cap_reached' }
  }
  if (ctx.lastProactiveSentAt && prefs.minIntervalMinutes > 0) {
    const lastMs = Date.parse(ctx.lastProactiveSentAt)
    if (Number.isFinite(lastMs) && nowMs - lastMs < prefs.minIntervalMinutes * 60_000) {
      return { allowed: false, dryRun: true, dedupeKey, reason: 'cooldown_active' }
    }
  }

  const bodyText = formatProactiveBody(candidate)
  if (isWithin24hWhatsAppWindow(ctx.lastInboundAt, nowMs)) {
    return {
      allowed: true,
      dryRun: true,
      dedupeKey,
      transport: 'session_text',
      bodyText,
    }
  }

  const template = ctx.approvedTemplates?.[candidate.category]
  if (!template) {
    return {
      allowed: false,
      dryRun: true,
      dedupeKey,
      reason: 'template_required_outside_24h',
    }
  }

  // Control de costos para mensajes fuera de ventana gratuita de 24h de Meta
  const cost = ctx.costControl
  if (cost) {
    if (cost.zeroCostOnly) {
      return { allowed: false, dryRun: true, dedupeKey, reason: 'cost_cap_exceeded' }
    }
    const templatesSent = cost.templatesSentToday ?? 0
    if (
      typeof cost.maxTemplateMessagesPerDay === 'number' &&
      templatesSent >= cost.maxTemplateMessagesPerDay
    ) {
      return { allowed: false, dryRun: true, dedupeKey, reason: 'cost_cap_exceeded' }
    }
    if (
      typeof cost.maxEstimatedCostUsd === 'number' &&
      typeof cost.estimatedTemplateCostUsd === 'number' &&
      (templatesSent + 1) * cost.estimatedTemplateCostUsd > cost.maxEstimatedCostUsd
    ) {
      return { allowed: false, dryRun: true, dedupeKey, reason: 'cost_cap_exceeded' }
    }
  }

  return {
    allowed: true,
    dryRun: true,
    dedupeKey,
    transport: 'approved_template',
    template,
    bodyText,
    templateParams: [candidate.title.slice(0, 200), candidate.detail.slice(0, 400)],
  }
}

export type GroupedProactiveDigest = {
  dryRun: true
  allowed: boolean
  usuarioId: string
  transport: 'session_text' | 'approved_template' | null
  includedCount: number
  suppressedCount: number
  dedupeKeys: string[]
  bodyText: string | null
  suppressedReasons: ProactiveBlockReason[]
}

/**
 * Agrupa múltiples alertas elegibles de un mismo usuario en un único digest conciso (<= 900 chars)
 * para reducir ruido operativo y controlar costos de mensajería. Siempre opera en dry-run.
 */
export function planGroupedProactiveDigest(
  candidates: readonly ProactiveCandidate[],
  prefs: ProactiveUserPreferences,
  ctx: ProactivePolicyContext,
  maxItemsInDigest = 4
): GroupedProactiveDigest {
  const seen = new Set(ctx.sentDedupeKeys)
  const eligible: Array<{ candidate: ProactiveCandidate; decision: Extract<ProactiveDecision, { allowed: true }> }> = []
  const suppressedReasons: ProactiveBlockReason[] = []

  for (const candidate of candidates) {
    const decision = evaluateProactiveFollowup(candidate, prefs, {
      ...ctx,
      // Evaluar elegibilidad individual para consolidar en 1 solo envío agrupado
      sentDedupeKeys: seen,
      lastProactiveSentAt: eligible.length === 0 ? ctx.lastProactiveSentAt : null,
    })
    if (decision.allowed) {
      seen.add(decision.dedupeKey)
      eligible.push({ candidate, decision })
    } else {
      suppressedReasons.push(decision.reason)
    }
  }

  if (eligible.length === 0) {
    return {
      dryRun: true,
      allowed: false,
      usuarioId: prefs.usuarioId,
      transport: null,
      includedCount: 0,
      suppressedCount: suppressedReasons.length,
      dedupeKeys: [],
      bodyText: null,
      suppressedReasons,
    }
  }

  // Priorizar relevancia empresarial antes de truncar para evitar saturación con avisos secundarios
  eligible.sort(
    (a, b) => PROACTIVE_CATEGORY_PRIORITY[a.candidate.category] - PROACTIVE_CATEGORY_PRIORITY[b.candidate.category]
  )
  const kept = eligible.slice(0, Math.max(1, maxItemsInDigest))
  const lines = [
    `Seguimiento SCRUMBAN (${kept.length} aviso${kept.length === 1 ? '' : 's'} clave):`,
    ...kept.map(({ candidate }, i) => {
      const prefix = CATEGORY_PREFIX[candidate.category]
      const suggested =
        (candidate.suggestedAction ?? '').trim() || DEFAULT_SUGGESTED_ACTION[candidate.category]
      return `${i + 1}. [${prefix}] ${candidate.title} — ${candidate.detail} (${suggested})`
    }),
  ]
  if (eligible.length > kept.length) {
    lines.push(`Y ${eligible.length - kept.length} aviso(s) adicional(es). Responde "ver más" para revisar el resto.`)
  }
  const bodyText = lines.join('\n').slice(0, 900)
  const transport = kept.some((k) => k.decision.transport === 'approved_template')
    ? 'approved_template'
    : 'session_text'

  return {
    dryRun: true,
    allowed: true,
    usuarioId: prefs.usuarioId,
    transport,
    includedCount: kept.length,
    suppressedCount: suppressedReasons.length + Math.max(0, eligible.length - kept.length),
    dedupeKeys: kept.map((k) => k.decision.dedupeKey),
    bodyText,
    suppressedReasons,
  }
}

/**
 * Evalúa un lote de candidatos en modo dry-run respetando deduplicación y tope diario acumulado.
 */
export function planProactiveBatch(
  candidates: readonly ProactiveCandidate[],
  prefs: ProactiveUserPreferences,
  ctx: ProactivePolicyContext
): Array<{ candidate: ProactiveCandidate; decision: ProactiveDecision }> {
  const seen = new Set(ctx.sentDedupeKeys)
  let sentToday = ctx.sentTodayCount
  let lastSentAt = ctx.lastProactiveSentAt ?? null
  const results: Array<{ candidate: ProactiveCandidate; decision: ProactiveDecision }> = []

  for (const candidate of candidates) {
    const decision = evaluateProactiveFollowup(candidate, prefs, {
      ...ctx,
      sentTodayCount: sentToday,
      lastProactiveSentAt: lastSentAt,
      sentDedupeKeys: seen,
    })
    results.push({ candidate, decision })
    if (decision.allowed) {
      seen.add(decision.dedupeKey)
      sentToday += 1
      lastSentAt = ctx.nowIso
    }
  }

  return results
}
