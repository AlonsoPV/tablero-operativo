/**
 * Modo de ejecución de operaciones R2. Sólo se lee de variables del servidor, nunca del cliente.
 * disabled: valor por defecto y único posible en producción.
 * simulated: pruebas y desarrollo local, con adaptadores en memoria (sin BD real ni proveedores).
 * qa: JWT reales contra un proyecto QA autorizado (allowlist), nunca DEV ni PROD; proveedores simulados.
 */
export const R2_EXECUTION_MODES = ['disabled', 'simulated', 'qa'] as const
export type R2ExecutionMode = (typeof R2_EXECUTION_MODES)[number]

/** DEV y PROD de Scrumban: el modo qa nunca se habilita contra ellos aunque estén en la allowlist. */
export const BLOCKED_PROJECT_REFS: readonly string[] = ['tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb']

export const R2_EXECUTION_DISABLED_MESSAGE =
  'EXECUTION_DISABLED: La ejecución de operaciones no está habilitada en este canal. La propuesta no se aplicó.'

type Env = Record<string, string | undefined>

function isProduction(env: Env) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
}

export function supabaseProjectRef(env: Env = process.env): string | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.(co|in)\b/i)?.[1]?.toLowerCase() ?? null
}

/** Proyecto QA vigente: debe estar en R2_QA_PROJECT_REFS, fuera de la lista de bloqueo y fuera de producción. */
export function qaProjectRef(env: Env = process.env): string | null {
  if (isProduction(env)) return null
  const ref = supabaseProjectRef(env)
  if (!ref || BLOCKED_PROJECT_REFS.includes(ref)) return null
  const allowed = (env.R2_QA_PROJECT_REFS ?? '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
  if (allowed.some((r) => BLOCKED_PROJECT_REFS.includes(r))) return null
  return allowed.includes(ref) ? ref : null
}

export function resolveR2ExecutionMode(env: Env = process.env): R2ExecutionMode {
  if (env.R2_EXECUTION_MODE === 'qa') return qaProjectRef(env) ? 'qa' : 'disabled'
  if (env.VERCEL || env.VERCEL_ENV || isProduction(env)) return 'disabled'
  return env.R2_EXECUTION_MODE === 'simulated' ? 'simulated' : 'disabled'
}

/**
 * Copiloto web por la puerta R2. Apagado por defecto y nunca en producción:
 * con el flag apagado el copiloto conserva su flujo actual.
 */
export function isCopilotR2GateEnabled(env: Env = process.env): boolean {
  return env.COPILOT_R2_GATE === '1' && !isProduction(env)
}
