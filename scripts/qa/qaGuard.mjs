/* global process, console, URL */
// Guardas compartidas de los scripts QA R1/R2. Nunca operan contra DEV ni PROD.
export const BLOCKED_PROJECT_REFS = ['tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb']

export function refFromUrl(url) {
  return /^https:\/\/([a-z0-9]+)\.supabase\.(co|in)\b/i.exec(url || '')?.[1]?.toLowerCase() ?? null
}

function fail(message) {
  console.error(`QA GUARD: ${message}`)
  process.exit(2)
}

class QaGuardError extends Error {}
const reject = (message) => {
  throw new QaGuardError(message)
}

/** Referencia sintética de una instancia Supabase Local (20 caracteres, como un ref real). */
export const LOCAL_REF_RE = /^qalocal[a-z0-9]{13}$/
const LOCAL_HOSTS = ['127.0.0.1', 'localhost']

/**
 * QA_LOCAL=1: instancia Supabase Local en esta máquina. Sólo http en loopback, con un puerto
 * declarado en QA_LOCAL_PORTS y una referencia sintética QA_<T>_LOCAL_REF.
 */
function localRef(target, url, env) {
  if (env.VERCEL || env.VERCEL_ENV || env.NODE_ENV === 'production') reject('QA_LOCAL no se usa en Vercel ni en producción')
  let parsed
  try {
    parsed = new URL(url || '')
  } catch {
    reject(`QA_${target}_SUPABASE_URL no es una URL local válida`)
  }
  if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.includes(parsed.hostname)) {
    reject(`con QA_LOCAL=1, QA_${target}_SUPABASE_URL debe ser http://127.0.0.1:<puerto>`)
  }
  const ports = (env.QA_LOCAL_PORTS || '').split(',').map((p) => p.trim()).filter(Boolean)
  if (!parsed.port || !ports.includes(parsed.port)) reject(`puerto ${parsed.port || '(vacío)'} fuera de QA_LOCAL_PORTS`)
  const ref = (env[`QA_${target}_LOCAL_REF`] || '').toLowerCase()
  if (!LOCAL_REF_RE.test(ref)) reject(`QA_${target}_LOCAL_REF debe ser qalocal + 13 caracteres [a-z0-9]`)
  return ref
}

/**
 * Resuelve el proyecto QA (A o B) desde variables QA_<T>_*. Rechaza DEV/PROD, referencias fuera de
 * R2_QA_PROJECT_REFS y una allowlist contaminada. Las claves nunca se imprimen. Lanza QaGuardError.
 */
export function resolveQaTarget(target, env = process.env, { needService = false } = {}) {
  if (!['A', 'B'].includes(target)) reject(`destino desconocido: ${target}`)
  const url = env[`QA_${target}_SUPABASE_URL`]
  const ref = env.QA_LOCAL === '1' ? localRef(target, url, env) : refFromUrl(url)
  if (!ref) reject(`QA_${target}_SUPABASE_URL no es una URL de proyecto Supabase`)
  if (BLOCKED_PROJECT_REFS.includes(ref)) reject(`QA_${target} apunta a DEV o PROD (${ref}); abortado`)
  if (BLOCKED_PROJECT_REFS.some((r) => (url || '').toLowerCase().includes(r))) reject(`QA_${target} menciona DEV o PROD; abortado`)
  const allowed = (env.R2_QA_PROJECT_REFS || '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
  if (allowed.some((r) => BLOCKED_PROJECT_REFS.includes(r))) reject('R2_QA_PROJECT_REFS incluye DEV o PROD; abortado')
  if (!allowed.includes(ref)) reject(`${ref} no está en R2_QA_PROJECT_REFS`)
  const anonKey = env[`QA_${target}_ANON_KEY`]
  if (!anonKey) reject(`falta QA_${target}_ANON_KEY`)
  const serviceKey = env[`QA_${target}_SERVICE_ROLE_KEY`]
  if (needService && !serviceKey) reject(`falta QA_${target}_SERVICE_ROLE_KEY`)
  return { target, url, ref, anonKey, serviceKey, local: env.QA_LOCAL === '1' }
}

export function requireQaTarget(target, env = process.env, options = {}) {
  try {
    return resolveQaTarget(target, env, options)
  } catch (error) {
    if (error instanceof QaGuardError) fail(error.message)
    throw error
  }
}

export function requirePassword(env = process.env) {
  const password = env.QA_ACCOUNT_PASSWORD || ''
  if (password.length < 16) fail('QA_ACCOUNT_PASSWORD debe tener al menos 16 caracteres (no se guarda en disco)')
  return password
}

/** Cuentas sintéticas (dominio reservado example.invalid): 8 en QA A y 2 en QA B. */
export const QA_ACCOUNTS = [
  { key: 'super_admin', target: 'A', nombre: 'QA Super Admin', rol: 'super_admin', area: null, activo: true, okrs: false },
  { key: 'direccion', target: 'A', nombre: 'QA Direccion', rol: 'Direccion', area: 'Comercial', activo: true, okrs: false },
  { key: 'direccion_okrs', target: 'A', nombre: 'QA Direccion OKRS', rol: 'Direccion', area: 'Comercial', activo: true, okrs: true },
  { key: 'okrs_area', target: 'A', nombre: 'QA Area OKRS', rol: 'Analista', area: 'OKRS', activo: true, okrs: true },
  { key: 'lider', target: 'A', nombre: 'QA Lider Creadora', rol: 'Lider', area: 'Operaciones', activo: true, okrs: false },
  { key: 'responsable', target: 'A', nombre: 'QA Responsable', rol: 'Operativo', area: 'Operaciones', activo: true, okrs: false },
  { key: 'analista', target: 'A', nombre: 'QA Analista', rol: 'Analista', area: 'Calidad', activo: true, okrs: false },
  { key: 'inactivo', target: 'A', nombre: 'QA Inactivo', rol: 'Operativo', area: 'Operaciones', activo: false, okrs: false },
  { key: 'admin_b', target: 'B', nombre: 'QA B Admin', rol: 'super_admin', area: null, activo: true, okrs: false },
  { key: 'analista_b', target: 'B', nombre: 'QA B Analista', rol: 'Analista', area: 'Calidad', activo: true, okrs: false },
]

export const emailFor = (account) => `qa-r2-${account.key.replace(/_/g, '-')}@example.invalid`

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { apply: argv.includes('--apply'), target: 'ALL' }
  const t = argv.find((a) => a.startsWith('--target='))
  if (t) args.target = t.split('=')[1].toUpperCase()
  return args
}
