import { isInCanonicalPilotAllowlist, parseUuidAllowlist } from '../pilotAllowlist.js'

/**
 * AGENT_MEMORY_R3: sólo el valor exacto '1' enciende la POC.
 * Ausente, true, 0, vacío u otro → apagado (R3-AT-18).
 * Si AGENT_MEMORY_R3_PILOT_USERS está configurado, fail-closed: sólo los UUIDs
 * explícitamente listados tienen acceso a memoria/documentos R3.
 * dbAllowlist (agent_execution_gate.allowed_usuario_ids) es segundo factor opcional.
 */
export function isAgentMemoryEnabled(
  env: Record<string, string | undefined> = process.env,
  usuarioId?: string | null,
  dbAllowlist: Set<string> | null = null
): boolean {
  if (env.AGENT_MEMORY_R3 !== '1') return false
  const rawPilot = env.AGENT_MEMORY_R3_PILOT_USERS?.trim()
  const envAllowlist = rawPilot ? parseUuidAllowlist(rawPilot) : null
  if (rawPilot && envAllowlist && envAllowlist.size === 0) return false
  if (!rawPilot && !dbAllowlist) return true
  return isInCanonicalPilotAllowlist(usuarioId, envAllowlist, dbAllowlist)
}
