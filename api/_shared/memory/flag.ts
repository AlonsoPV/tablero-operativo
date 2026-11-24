/**
 * AGENT_MEMORY_R3: sólo el valor exacto '1' enciende la POC.
 * Ausente, true, 0, vacío u otro → apagado (R3-AT-18).
 */
export function isAgentMemoryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGENT_MEMORY_R3 === '1'
}
