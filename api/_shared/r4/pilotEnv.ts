/**
 * Entorno R4 Pilot: contrato de aislamiento.
 * No provisiona Vercel, Retell ni bases remotas.
 */

export const R4_PILOT_ENV_NAME = 'r4-pilot'

export const R4_PILOT_FORBIDDEN_TARGETS = [
  'qa-ab',
  'dev',
  'prod',
  'preview-r3',
] as const

export const R4_PILOT_MAX_SESSION_MS = 15 * 60 * 1000
export const R4_PILOT_ACCESS_TOKEN_TTL_MS = 30_000
export const R4_PILOT_MAX_CONCURRENT_SESSIONS = 1

/** Secretos solo servidor. Nunca VITE_. No reutilizar claves de Guía. */
export const R4_PILOT_SERVER_SECRET_KEYS = [
  'RETELL_R4_API_KEY',
] as const

export const R4_PILOT_SERVER_PUBLIC_KEYS = [
  'AGENT_VOICE_R4',
  'AGENT_VOICE_R4_LIVE_OK',
  'AGENT_VOICE_R4_PROVIDER',
  'AGENT_VOICE_R4_RETAIN_AUDIO',
  'RETELL_R4_AGENT_ID',
] as const

export const R4_PILOT_CLIENT_KEYS = ['VITE_AGENT_VOICE_R4'] as const

export const R4_PILOT_FORBIDDEN_CLIENT_SECRET_PREFIXES = [
  'VITE_RETELL',
  'VITE_OPENAI',
] as const

export const R4_PILOT_KILL_SWITCH = [
  'AGENT_VOICE_R4',
  'AGENT_VOICE_R4_LIVE_OK',
  'VITE_AGENT_VOICE_R4',
] as const

export type R4PilotEnvSpec = {
  name: typeof R4_PILOT_ENV_NAME
  forbiddenTargets: typeof R4_PILOT_FORBIDDEN_TARGETS
  maxSessionMs: typeof R4_PILOT_MAX_SESSION_MS
  accessTokenTtlMs: typeof R4_PILOT_ACCESS_TOKEN_TTL_MS
  maxConcurrentSessions: typeof R4_PILOT_MAX_CONCURRENT_SESSIONS
  secretsServerOnly: typeof R4_PILOT_SERVER_SECRET_KEYS
  killSwitch: typeof R4_PILOT_KILL_SWITCH
  provisioned: false
  connectAuthorized: false
}

export const R4_PILOT_ENV_SPEC: R4PilotEnvSpec = {
  name: R4_PILOT_ENV_NAME,
  forbiddenTargets: R4_PILOT_FORBIDDEN_TARGETS,
  maxSessionMs: R4_PILOT_MAX_SESSION_MS,
  accessTokenTtlMs: R4_PILOT_ACCESS_TOKEN_TTL_MS,
  maxConcurrentSessions: R4_PILOT_MAX_CONCURRENT_SESSIONS,
  secretsServerOnly: R4_PILOT_SERVER_SECRET_KEYS,
  killSwitch: R4_PILOT_KILL_SWITCH,
  provisioned: false,
  connectAuthorized: false,
}

export function isForbiddenPilotTarget(target: string) {
  return (R4_PILOT_FORBIDDEN_TARGETS as readonly string[]).includes(target.toLowerCase())
}

export function findClientLeakedSecrets(
  env: Record<string, string | undefined>
): string[] {
  return Object.keys(env).filter((key) =>
    R4_PILOT_FORBIDDEN_CLIENT_SECRET_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

export function pilotBudgetExceeded(input: {
  elapsedMs: number
  maxSessionMs?: number
}) {
  const max = input.maxSessionMs ?? R4_PILOT_MAX_SESSION_MS
  return input.elapsedMs >= max
}
