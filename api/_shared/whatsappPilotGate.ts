/**
 * Compuerta selectiva por usuario para WhatsApp conversacional (Grupo A — Solo Lectura).
 *
 * Reglas fail-closed:
 * 1. Si `AGENT_ORCHESTRATOR_R1 === '1'`, el orquestador unificado está activo globalmente
 *    para todos los usuarios autorizados por `can_use_ai_whatsapp_for_usuario`.
 * 2. Mientras `AGENT_ORCHESTRATOR_R1 !== '1'`, el modo piloto por usuario SÓLO se activa si:
 *    - `WHATSAPP_CONVERSATIONAL_PILOT_ENABLED === '1'`, y
 *    - `usuarioId` o `waId` normalizado aparece explícitamente en `WHATSAPP_CONVERSATIONAL_PILOT_USERS`.
 *    Nunca acepta comodines (`*`, `all`).
 * 3. Cualquier usuario fuera de la lista conserva 100% el comportamiento legacy intacto.
 * 4. En Grupo A, el acceso conversacional por WhatsApp es estrictamente de SOLO LECTURA
 *    (`readOnlyEnforced: true`): jamás ejecuta escrituras R2 ni activa seguimientos automáticos.
 */
import { isAgentOrchestratorEnabled } from './orchestrator/channelAdapters.js'

export type WhatsAppConversationalAccess = {
  enabled: boolean
  mode: 'global_r1' | 'pilot_user_allowlist' | 'legacy'
  readOnlyEnforced: true
}

function normalizeWaDigits(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

export function parseWhatsAppPilotAllowlist(raw: string | undefined): ReadonlySet<string> {
  const entries = new Set<string>()
  if (!raw) return entries
  for (const part of raw.split(/[\s,;]+/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    // Bloquear comodines peligrosos: el piloto exige identidades explícitas
    if (trimmed === '*' || trimmed.toLowerCase() === 'all' || trimmed.toLowerCase() === 'todos') {
      continue
    }
    entries.add(trimmed.toLowerCase())
    const digits = normalizeWaDigits(trimmed)
    if (digits.length >= 10) entries.add(digits)
  }
  return entries
}

export function resolveWhatsAppConversationalAccess(input: {
  usuarioId: string
  waId: string
  env?: Record<string, string | undefined>
}): WhatsAppConversationalAccess {
  const env = input.env ?? process.env

  if (isAgentOrchestratorEnabled(env)) {
    return {
      enabled: true,
      mode: 'global_r1',
      readOnlyEnforced: true,
    }
  }

  if (env.WHATSAPP_CONVERSATIONAL_PILOT_ENABLED !== '1') {
    return {
      enabled: false,
      mode: 'legacy',
      readOnlyEnforced: true,
    }
  }

  const allowlist = parseWhatsAppPilotAllowlist(env.WHATSAPP_CONVERSATIONAL_PILOT_USERS)
  if (allowlist.size === 0) {
    return {
      enabled: false,
      mode: 'legacy',
      readOnlyEnforced: true,
    }
  }

  const userKey = input.usuarioId.trim().toLowerCase()
  const waDigits = normalizeWaDigits(input.waId)
  const matched =
    (userKey.length > 0 && allowlist.has(userKey)) ||
    (waDigits.length >= 10 && allowlist.has(waDigits))

  if (matched) {
    return {
      enabled: true,
      mode: 'pilot_user_allowlist',
      readOnlyEnforced: true,
    }
  }

  return {
    enabled: false,
    mode: 'legacy',
    readOnlyEnforced: true,
  }
}

export const WHATSAPP_GROUP_A_READ_ONLY_MESSAGE =
  'En esta etapa WhatsApp opera en modo solo lectura para consultas ejecutivas y operativas. Puedes registrar o actualizar esta acción directamente en Scrumban.'
