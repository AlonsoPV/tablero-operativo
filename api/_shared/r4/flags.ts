/**
 * Feature flags de R4 · Voz y ligas.
 * Estricto: solo el valor "1" enciende. Ausente / basura = apagado.
 * Independiente de AGENT_ORCHESTRATOR_R1, R1_EXECUTION_ENABLED y AGENT_MEMORY_R3.
 */

export const AGENT_VOICE_R4_FLAG = 'AGENT_VOICE_R4'

export function isAgentVoiceR4Enabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[AGENT_VOICE_R4_FLAG] === '1'
}

/** Alias semántico: ligas de voz comparten el mismo gate de release R4. */
export function isAgentLinkR4Enabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return isAgentVoiceR4Enabled(env)
}
