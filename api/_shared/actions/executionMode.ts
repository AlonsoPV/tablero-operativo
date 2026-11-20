/**
 * Modo de ejecución de operaciones R2. Sólo se lee de variables del servidor, nunca del cliente.
 * disabled: valor por defecto y único posible en producción.
 * simulated: pruebas y desarrollo local, con adaptadores en memoria (sin BD real ni proveedores).
 * qa: JWT reales contra un proyecto QA autorizado (allowlist hosted o QA_LOCAL=1 en loopback), nunca DEV ni PROD; proveedores simulados.
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

const LOCAL_REF_RE = /^qalocal[a-z0-9]{13}$/
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

function allowlist(env: Env): string[] | null {
  const allowed = (env.R2_QA_PROJECT_REFS ?? '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
  if (allowed.some((r) => BLOCKED_PROJECT_REFS.includes(r))) return null
  return allowed
}

/**
 * Instancia Supabase Local en esta máquina. Nunca en Vercel ni en producción; no interpreta
 * localhost como un destino de producción. Exige QA_LOCAL=1, loopback http, puerto declarado
 * y una referencia sintética `qalocal` + 13 caracteres en la allowlist.
 */
export function localQaProjectRef(env: Env = process.env): string | null {
  if (env.QA_LOCAL !== '1') return null
  if (isProduction(env) || env.VERCEL || env.VERCEL_ENV) return null
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname)) return null
  const ports = (env.QA_LOCAL_PORTS ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  if (!parsed.port || !ports.includes(parsed.port)) return null
  const ref = (env.QA_LOCAL_REF ?? '').toLowerCase()
  if (!LOCAL_REF_RE.test(ref) || BLOCKED_PROJECT_REFS.includes(ref)) return null
  const allowed = allowlist(env)
  if (!allowed) return null
  return allowed.includes(ref) ? ref : null
}

/** Proyecto QA remoto (*.supabase.co / *.supabase.in). localhost no entra aquí. */
export function hostedQaProjectRef(env: Env = process.env): string | null {
  if (isProduction(env)) return null
  const ref = supabaseProjectRef(env)
  if (!ref || BLOCKED_PROJECT_REFS.includes(ref)) return null
  const allowed = allowlist(env)
  if (!allowed) return null
  return allowed.includes(ref) ? ref : null
}

/** Proyecto QA vigente: hosted allowlist o instancia local opt-in. Nunca DEV ni PROD. */
export function qaProjectRef(env: Env = process.env): string | null {
  return hostedQaProjectRef(env) ?? localQaProjectRef(env)
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
