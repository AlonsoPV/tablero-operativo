/**
 * Activación selectiva por usuario (piloto 1 número) sobre la infraestructura WhatsApp existente.
 *
 * Principios Lean:
 * - NO crea un nuevo sistema de permisos: exige previamente `can_use_ai_whatsapp_for_usuario = true`.
 * - Permite activar R1/R3/Executive MVP y notas de voz únicamente para 1 usuario piloto autorizado
 *   (`WHATSAPP_ORCHESTRATOR_PILOT_USERS`) manteniendo al resto de usuarios en el flujo legacy intacto.
 * - Rollback inmediato sin migraciones: vaciar `WHATSAPP_ORCHESTRATOR_PILOT_USERS` o apagar flags.
 */

export type WhatsAppPilotIdentity = {
  usuarioId: string
  waId?: string | null
}

function normalizePhoneDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D+/g, '')
}

function parsePilotAllowlist(raw: string | undefined): Set<string> {
  const out = new Set<string>()
  for (const token of (raw ?? '').split(/[\s,;]+/)) {
    const trimmed = token.trim()
    if (!trimmed) continue
    out.add(trimmed.toLowerCase())
    const digits = normalizePhoneDigits(trimmed)
    if (digits.length >= 10) out.add(digits)
  }
  return out
}

export function isUserInWhatsAppPilot(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): boolean {
  const allowlist = parsePilotAllowlist(env.WHATSAPP_ORCHESTRATOR_PILOT_USERS)
  if (allowlist.size === 0) return false
  if (identity.usuarioId && allowlist.has(identity.usuarioId.trim().toLowerCase())) return true
  const digits = normalizePhoneDigits(identity.waId)
  return Boolean(digits && allowlist.has(digits))
}

/**
 * Decide si el usuario entra al orquestador unificado R1/R3 en WhatsApp o permanece en legacy.
 * - Si `WHATSAPP_ORCHESTRATOR_PILOT_USERS` está definido: ONLY los usuarios en allowlist entran
 *   cuando `AGENT_ORCHESTRATOR_R1=1` o `WHATSAPP_PILOT_ENABLED=1`; el resto conserva legacy 100%.
 * - Si `WHATSAPP_ORCHESTRATOR_PILOT_USERS` está vacío: respeta `AGENT_ORCHESTRATOR_R1=1` global.
 */
export function shouldUseWhatsAppOrchestrator(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): boolean {
  const allowlist = parsePilotAllowlist(env.WHATSAPP_ORCHESTRATOR_PILOT_USERS)
  const orchestratorOrPilotOn =
    env.AGENT_ORCHESTRATOR_R1 === '1' || env.WHATSAPP_PILOT_ENABLED === '1'

  if (!orchestratorOrPilotOn) return false
  if (allowlist.size === 0) return env.AGENT_ORCHESTRATOR_R1 === '1'
  return isUserInWhatsAppPilot(identity, env)
}

/**
 * Controla la habilitación progresiva (Fase B) de notas de voz OGG/Opus en WhatsApp.
 * - Por defecto habilitado si no hay restricción de piloto y `WHATSAPP_VOICE_NOTES_ENABLED` no es '0'.
 * - Con `WHATSAPP_ORCHESTRATOR_PILOT_USERS` definido, aísla notas de voz al usuario piloto autorizado.
 */
export function isWhatsAppVoiceNotesAllowedForUser(
  identity: WhatsAppPilotIdentity,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.WHATSAPP_VOICE_NOTES_ENABLED === '0') return false
  const allowlist = parsePilotAllowlist(env.WHATSAPP_ORCHESTRATOR_PILOT_USERS)
  if (allowlist.size > 0) {
    return isUserInWhatsAppPilot(identity, env)
  }
  return true
}
