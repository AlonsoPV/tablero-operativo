/* global process, console */
// Guardas compartidas de los scripts QA R1/R2. Nunca operan contra DEV ni PROD.
export const BLOCKED_PROJECT_REFS = ['tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb']

export function refFromUrl(url) {
  return /^https:\/\/([a-z0-9]+)\.supabase\.(co|in)\b/i.exec(url || '')?.[1]?.toLowerCase() ?? null
}

function fail(message) {
  console.error(`QA GUARD: ${message}`)
  process.exit(2)
}

/**
 * Resuelve el proyecto QA (A o B) desde variables QA_<T>_*. Rechaza DEV/PROD, referencias fuera de
 * R2_QA_PROJECT_REFS y una allowlist contaminada. Las claves nunca se imprimen.
 */
export function requireQaTarget(target, env = process.env, { needService = false } = {}) {
  if (!['A', 'B'].includes(target)) fail(`destino desconocido: ${target}`)
  const url = env[`QA_${target}_SUPABASE_URL`]
  const ref = refFromUrl(url)
  if (!ref) fail(`QA_${target}_SUPABASE_URL no es una URL de proyecto Supabase`)
  if (BLOCKED_PROJECT_REFS.includes(ref)) fail(`QA_${target} apunta a DEV o PROD (${ref}); abortado`)
  const allowed = (env.R2_QA_PROJECT_REFS || '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
  if (allowed.some((r) => BLOCKED_PROJECT_REFS.includes(r))) fail('R2_QA_PROJECT_REFS incluye DEV o PROD; abortado')
  if (!allowed.includes(ref)) fail(`${ref} no está en R2_QA_PROJECT_REFS`)
  const anonKey = env[`QA_${target}_ANON_KEY`]
  if (!anonKey) fail(`falta QA_${target}_ANON_KEY`)
  const serviceKey = env[`QA_${target}_SERVICE_ROLE_KEY`]
  if (needService && !serviceKey) fail(`falta QA_${target}_SERVICE_ROLE_KEY`)
  return { target, url, ref, anonKey, serviceKey }
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
  const args = { apply: argv.includes('--apply'), target: 'all' }
  const t = argv.find((a) => a.startsWith('--target='))
  if (t) args.target = t.split('=')[1].toUpperCase()
  return args
}
