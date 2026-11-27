const PILOT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePilotUsers(raw: string | undefined): Set<string> {
  const set = new Set<string>()
  for (const token of (raw ?? '').split(/[\s,;]+/)) {
    const trimmed = token.trim().toLowerCase()
    if (trimmed && PILOT_UUID_RE.test(trimmed)) set.add(trimmed)
  }
  return set
}

/**
 * AGENT_MEMORY_R3: sólo el valor exacto '1' enciende la POC.
 * Ausente, true, 0, vacío u otro → apagado (R3-AT-18).
 * Si AGENT_MEMORY_R3_PILOT_USERS está configurado, fail-closed: sólo los UUIDs
 * explícitamente listados tienen acceso a memoria/documentos R3.
 */
export function isAgentMemoryEnabled(
  env: Record<string, string | undefined> = process.env,
  usuarioId?: string | null
): boolean {
  if (env.AGENT_MEMORY_R3 !== '1') return false
  const rawPilot = env.AGENT_MEMORY_R3_PILOT_USERS?.trim()
  if (!rawPilot) return true
  const allowlist = parsePilotUsers(rawPilot)
  if (allowlist.size === 0) return false
  const uid = typeof usuarioId === 'string' ? usuarioId.trim().toLowerCase() : ''
  return Boolean(uid && allowlist.has(uid))
}
