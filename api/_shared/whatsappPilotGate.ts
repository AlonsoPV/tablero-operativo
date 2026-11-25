/**
 * Activación selectiva FAIL-CLOSED por usuario sobre la infraestructura WhatsApp existente.
 *
 * Garantías de cierre SCRUMBAN 1.0:
 * - NO crea un nuevo sistema de permisos: exige previamente `can_use_ai_whatsapp_for_usuario = true`
 *   y usuario activo (`usuarios.activo === true`) con UUID válido.
 * - Distingue explícitamente el piloto de WhatsApp (`WHATSAPP_PILOT_ENABLED=1` + allowlist)
 *   de una futura activación global (`WHATSAPP_GLOBAL_ORCHESTRATOR_ENABLED=1` + `AGENT_ORCHESTRATOR_R1=1`).
 * - NUNCA falla abierto (fail-open):
 *   - Piloto activado sin usuarios autorizados válidos -> DENY (legacy).
 *   - Lista vacía -> NUNCA amplía acceso automáticamente.
 *   - Identidad inválida / usuario inactivo / sin permiso WhatsApp -> DENY.
 *   - Usuario fuera de lista -> legacy intacto.
 *   - Piloto desactivado (`WHATSAPP_PILOT_ENABLED !== '1'`) -> impide acceso al flujo piloto.
 * - Notas de voz y botones R2 exigen el mismo aislamiento estricto.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type WhatsAppPilotIdentity = {
  usuarioId: string
  waId?: string | null
  active: boolean
  aiAuthorized: boolean
}

export type WhatsAppFlowAccessDecision = {
  allowed: boolean
  mode: 'pilot' | 'global' | 'legacy' | 'denied'
  reason: string
}

export function isValidWhatsAppUsuarioId(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && UUID_RE.test(raw.trim())
}

function normalizePhoneDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D+/g, '')
  if (digits.length < 10 || digits.length > 15) return ''
  return digits
}

/**
 * Parsea la lista blanca aceptando únicamente UUIDs válidos o teléfonos de 10-15 dígitos.
 * Rechaza tokens ambiguos o comodines ("*", "all", cadenas cortas).
 */
export function parsePilotAllowlist(raw: string | undefined): {
  uuids: Set<string>
  phones: Set<string>
  size: number
} {
  const uuids = new Set<string>()
  const phones = new Set<string>()
  for (const token of (raw ?? '').split(/[\s,;]+/)) {
    const trimmed = token.trim()
    if (!trimmed) continue
    if (UUID_RE.test(trimmed)) {
      uuids.add(trimmed.toLowerCase())
      continue
    }
    const digits = normalizePhoneDigits(trimmed)
    if (digits && /^[+\d().\-\s]+$/.test(trimmed)) {
      phones.add(digits)
    }
  }
  return { uuids, phones, size: uuids.size + phones.size }
}

function isValidActiveAuthorizedIdentity(identity: WhatsAppPilotIdentity): boolean {
  if (!isValidWhatsAppUsuarioId(identity.usuarioId)) return false
  if (identity.active !== true) return false
  if (identity.aiAuthorized !== true) return false
  return true
}

export function isUserInWhatsAppPilot(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!isValidActiveAuthorizedIdentity(identity)) return false
  const allowlist = parsePilotAllowlist(env.WHATSAPP_ORCHESTRATOR_PILOT_USERS)
  if (allowlist.size === 0) return false
  if (allowlist.uuids.has(identity.usuarioId.trim().toLowerCase())) return true
  const digits = normalizePhoneDigits(identity.waId)
  return Boolean(digits && allowlist.phones.has(digits))
}

/**
 * Resuelve de forma fail-closed si el usuario entra al nuevo flujo WhatsApp (piloto o global explícito)
 * o permanece en el flujo legacy / denegado.
 */
export function resolveWhatsAppFlowAccess(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): WhatsAppFlowAccessDecision {
  if (!isValidActiveAuthorizedIdentity(identity)) {
    return {
      allowed: false,
      mode: 'denied',
      reason: 'invalid_inactive_or_unauthorized_identity',
    }
  }

  const pilotEnabled = env.WHATSAPP_PILOT_ENABLED === '1'
  const allowlist = parsePilotAllowlist(env.WHATSAPP_ORCHESTRATOR_PILOT_USERS)

  if (pilotEnabled) {
    if (allowlist.size === 0) {
      return {
        allowed: false,
        mode: 'legacy',
        reason: 'pilot_enabled_without_authorized_users',
      }
    }
    if (isUserInWhatsAppPilot(identity, env)) {
      return {
        allowed: true,
        mode: 'pilot',
        reason: 'pilot_user_authorized',
      }
    }
    return {
      allowed: false,
      mode: 'legacy',
      reason: 'user_outside_pilot_allowlist',
    }
  }

  // Activación global explícita de WhatsApp (separada del piloto y de R1 web).
  // Si existe una lista blanca configurada, nunca amplía acceso automáticamente a global.
  const globalWhatsAppEnabled =
    env.WHATSAPP_GLOBAL_ORCHESTRATOR_ENABLED === '1' &&
    env.AGENT_ORCHESTRATOR_R1 === '1'

  if (globalWhatsAppEnabled && allowlist.size === 0) {
    return {
      allowed: true,
      mode: 'global',
      reason: 'whatsapp_global_explicitly_enabled',
    }
  }

  return {
    allowed: false,
    mode: 'legacy',
    reason: 'whatsapp_pilot_disabled',
  }
}

export function shouldUseWhatsAppOrchestrator(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): boolean {
  return resolveWhatsAppFlowAccess(identity, env).allowed
}

/**
 * Control fail-closed para notas de voz conversacionales (Fase B).
 * Exige explícitamente WHATSAPP_VOICE_NOTES_ENABLED='1' Y autorización efectiva en piloto o global.
 */
export function isWhatsAppVoiceNotesAllowedForUser(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.WHATSAPP_VOICE_NOTES_ENABLED !== '1') return false
  return shouldUseWhatsAppOrchestrator(identity, env)
}

/**
 * Control fail-closed para botones interactivos R2 (Confirmar / Editar / Cancelar).
 * Exige exactamente el mismo aislamiento por usuario que el orquestador WhatsApp.
 */
export function isWhatsAppR2ButtonsAllowedForUser(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): boolean {
  return shouldUseWhatsAppOrchestrator(identity, env)
}
