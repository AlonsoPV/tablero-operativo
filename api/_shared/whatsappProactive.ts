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
  'due_reminder',
  'pending_verification',
  'stale_commitment',
  'daily_summary',
  'agreement_followup',
] as const

export type ProactiveCategory = (typeof PROACTIVE_CATEGORIES)[number]

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
  due_reminder: 'Recordatorio de vencimiento',
  pending_verification: 'Pendiente de verificación',
  stale_commitment: 'Compromiso sin seguimiento',
  daily_summary: 'Resumen diario',
  agreement_followup: 'Seguimiento de acuerdo',
}

function formatProactiveBody(candidate: ProactiveCandidate): string {
  const header = CATEGORY_PREFIX[candidate.category]
  const parts = [`${header}: ${candidate.title}`, candidate.detail]
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
