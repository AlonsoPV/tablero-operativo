/* global process, URL */
/**
 * R3 Integrated DEV Guard (fail-closed).
 *
 * Replaces the blanket DEV block from qaGuard.mjs ONLY for the R3 integrated
 * runner by enforcing:
 *   1. Hard-coded Production blocklist (Supabase ref, Vercel hosts, env flags).
 *   2. Explicit Supabase DEV allowlist (`R3_ALLOWED_SUPABASE_REFS`).
 *   3. Synthetic fixture prefix (`r3-int-`).
 *   4. R2/R4/R0 safety checks (no live/qa R2 mode).
 *   5. Explicit execution & rollback authorization gates.
 *   6. Protected env file loader (never reads root `.env`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

export const DEFAULT_DEV_REF = 'tgiuevzlyptzlfgxsfhj'
export const DEFAULT_PROJECT_ID = 'prj_k71rhUH9uTFEEPWofF3NyyhcKEDn'
export const DEFAULT_TEAM_ID = 'alonsopvs-projects'
export const ALLOWED_PREVIEW_TARGET = 'preview'
export const FULL_SHA_RE = /^[0-9a-f]{40}$/
export const FORBIDDEN_BRANCHES = Object.freeze(['main', 'master', 'production', 'prod'])

export const FORBIDDEN_PROD_REFS = Object.freeze(['xhpasmjzuwifmjhrsumb'])
export const FORBIDDEN_PROD_HOSTS = Object.freeze([
  'scrumbanemx.vercel.app',
  'tablero-operativo.vercel.app',
  'tablero-operativo-git-main-alonsopvs-projects.vercel.app',
])

export const REQUIRED_INTEGRATED_AUTH = 'AUTH-R3-INTEGRATED'
export const REQUIRED_ROLLBACK_AUTH = 'AUTH-R3-ROLLBACK-OFF'

/**
 * Resolve and strictly validate the externally configured authorized candidate
 * (SHA, gitBranch, Vercel project/team, and preview-only target).
 * Never falls back to a hardcoded SHA to prevent circularity or stale-SHA runs.
 */
export function resolveAuthorizedCandidate(env = process.env) {
  assertNoProductionConfig(env)

  const expectedSha = String(env.R3_EXPECTED_SHA || '').trim().toLowerCase()
  if (!expectedSha) {
    throw new R3GuardError(
      'EXPECTED_SHA_MISSING',
      'Falta R3_EXPECTED_SHA (SHA completo e inmutable de 40 caracteres hex del candidato autorizado)',
    )
  }
  if (!FULL_SHA_RE.test(expectedSha)) {
    throw new R3GuardError(
      'EXPECTED_SHA_INVALID',
      `R3_EXPECTED_SHA debe ser un SHA Git completo de 40 caracteres hexadecimales (recibido: ${expectedSha.slice(0, 16)})`,
    )
  }

  const expectedBranch = String(env.R3_EXPECTED_BRANCH || '').trim()
  if (!expectedBranch) {
    throw new R3GuardError(
      'EXPECTED_BRANCH_MISSING',
      'Falta R3_EXPECTED_BRANCH (rama Preview autorizada, ej. release/r1-r3-minimal)',
    )
  }
  if (FORBIDDEN_BRANCHES.includes(expectedBranch.toLowerCase()) || /\s/.test(expectedBranch)) {
    throw new R3GuardError(
      'FORBIDDEN_BRANCH',
      `R3_EXPECTED_BRANCH prohibida o inválida para Preview QA: ${expectedBranch}`,
    )
  }

  const projectId = String(env.R3_VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID).trim()
  if (projectId !== DEFAULT_PROJECT_ID) {
    throw new R3GuardError(
      'PROJECT_ID_MISMATCH',
      `R3_VERCEL_PROJECT_ID (${projectId}) no coincide con proyecto autorizado (${DEFAULT_PROJECT_ID})`,
    )
  }

  const teamId = String(env.R3_VERCEL_TEAM_ID || DEFAULT_TEAM_ID).trim()
  if (teamId !== DEFAULT_TEAM_ID) {
    throw new R3GuardError(
      'TEAM_ID_MISMATCH',
      `R3_VERCEL_TEAM_ID (${teamId}) no coincide con team autorizado (${DEFAULT_TEAM_ID})`,
    )
  }

  const target = String(env.R3_EXPECTED_TARGET || ALLOWED_PREVIEW_TARGET).trim().toLowerCase()
  if (target !== ALLOWED_PREVIEW_TARGET) {
    throw new R3GuardError(
      'TARGET_NOT_PREVIEW',
      `R3_EXPECTED_TARGET=${target} prohibido; únicamente target="${ALLOWED_PREVIEW_TARGET}" está permitido`,
    )
  }

  return {
    expectedSha,
    expectedBranch,
    projectId,
    teamId,
    target,
  }
}

export class R3GuardError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'R3GuardError'
    this.code = code
  }
}

export function isFlagOn(value) {
  return value === '1'
}

export function refFromSupabaseUrl(url) {
  return /^https:\/\/([a-z0-9]+)\.supabase\.(co|in)\b/i.exec(String(url || '').trim())?.[1]?.toLowerCase() ?? null
}

/**
 * Parse a KEY=VALUE env file without printing or logging values.
 * Never allows loading root `.env` (which holds PROD credentials in this repo).
 */
export function loadProtectedEnvFile(filePath, baseEnv = process.env) {
  if (!filePath) return { ...baseEnv }
  const resolved = resolve(filePath)
  const name = basename(resolved).toLowerCase()
  if (name === '.env' || name === '.env.production' || name === '.env.prodlocal') {
    throw new R3GuardError('FORBIDDEN_ENV_FILE', `Archivo prohibido para R3 QA: ${name}`)
  }
  if (!existsSync(resolved)) {
    throw new R3GuardError('ENV_FILE_MISSING', `No existe archivo de entorno R3: ${resolved}`)
  }
  const merged = { ...baseEnv }
  const raw = readFileSync(resolved, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in merged) || merged[key] === '') {
      merged[key] = val
    }
  }
  return merged
}

/**
 * Scan all R3_* env vars and runtime flags to ensure zero Production contamination.
 */
export function assertNoProductionConfig(env = process.env) {
  if (env.NODE_ENV === 'production') {
    throw new R3GuardError('PROD_NODE_ENV', 'NODE_ENV=production prohibido para runner R3 QA')
  }
  if (env.VERCEL_ENV === 'production') {
    throw new R3GuardError('PROD_VERCEL_ENV', 'VERCEL_ENV=production prohibido para runner R3 QA')
  }

  const keysToInspect = Object.keys(env).filter(
    (k) => k.startsWith('R3_') || k === 'R2_EXECUTION_MODE' || k === 'COPILOT_R2_GATE' || k === 'R1_EXECUTION_ENABLED',
  )
  for (const key of keysToInspect) {
    const val = String(env[key] || '').toLowerCase()
    for (const ref of FORBIDDEN_PROD_REFS) {
      if (val.includes(ref)) {
        throw new R3GuardError('PROD_REF_DETECTED', `Variable ${key} contiene referencia Production prohibida`)
      }
    }
    for (const host of FORBIDDEN_PROD_HOSTS) {
      if (val.includes(host)) {
        throw new R3GuardError('PROD_HOST_DETECTED', `Variable ${key} apunta a host Production prohibido`)
      }
    }
  }

  const r2Mode = String(env.R2_EXECUTION_MODE || '').trim().toLowerCase()
  if (r2Mode && r2Mode !== 'off' && r2Mode !== 'simulated') {
    throw new R3GuardError('R2_UNSAFE_MODE', `R2_EXECUTION_MODE=${r2Mode} no permitido en ventana R3`)
  }
  if (isFlagOn(env.COPILOT_R2_GATE)) {
    throw new R3GuardError('R2_GATE_ON', 'COPILOT_R2_GATE=1 prohibido en ventana R3')
  }
  if (isFlagOn(env.R1_EXECUTION_ENABLED)) {
    throw new R3GuardError('R1_EXEC_ON', 'R1_EXECUTION_ENABLED=1 prohibido en ventana R3')
  }

  return { ok: true }
}

/**
 * Resolve and validate Supabase DEV target using explicit allowlist + hard PROD blocklist.
 */
export function resolveR3DevTarget(env = process.env, { allowLoopback = false } = {}) {
  assertNoProductionConfig(env)

  const rawAllowlist = String(env.R3_ALLOWED_SUPABASE_REFS || '').trim()
  const allowedRefs = rawAllowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  if (allowedRefs.length === 0) {
    throw new R3GuardError(
      'ALLOWLIST_MISSING',
      `Falta R3_ALLOWED_SUPABASE_REFS explícita (esperado: ${DEFAULT_DEV_REF})`,
    )
  }
  if (allowedRefs.some((r) => FORBIDDEN_PROD_REFS.includes(r))) {
    throw new R3GuardError('ALLOWLIST_HAS_PROD', 'R3_ALLOWED_SUPABASE_REFS contiene ref Production; abortado')
  }

  const url = String(env.R3_DEV_SUPABASE_URL || '').trim()
  if (!url) {
    throw new R3GuardError('DEV_URL_MISSING', 'Falta R3_DEV_SUPABASE_URL')
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new R3GuardError('DEV_URL_INVALID', 'R3_DEV_SUPABASE_URL no es una URL válida')
  }

  const lowerUrl = url.toLowerCase()
  if (FORBIDDEN_PROD_REFS.some((r) => lowerUrl.includes(r))) {
    throw new R3GuardError('PROD_REF_IN_URL', 'R3_DEV_SUPABASE_URL apunta a Production; abortado')
  }

  let ref = refFromSupabaseUrl(url)
  if (!ref && allowLoopback && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')) {
    ref = String(env.R3_DEV_LOCAL_REF || 'qalocaldev0000000000').toLowerCase()
  }
  if (!ref) {
    throw new R3GuardError('DEV_REF_UNRESOLVED', 'R3_DEV_SUPABASE_URL debe ser https://<ref>.supabase.co')
  }
  if (FORBIDDEN_PROD_REFS.includes(ref)) {
    throw new R3GuardError('PROD_REF_BLOCKED', `Ref Production bloqueada (${ref}); abortado`)
  }
  if (!allowedRefs.includes(ref)) {
    throw new R3GuardError('REF_NOT_ALLOWLISTED', `Ref ${ref} fuera de R3_ALLOWED_SUPABASE_REFS`)
  }

  const anonKey = String(env.R3_DEV_SUPABASE_ANON_KEY || '').trim()
  if (!anonKey) {
    throw new R3GuardError('DEV_ANON_MISSING', 'Falta R3_DEV_SUPABASE_ANON_KEY')
  }

  const serviceRoleKey = String(env.R3_DEV_SUPABASE_SERVICE_ROLE_KEY || '').trim() || null

  return {
    url: url.replace(/\/+$/, ''),
    ref,
    allowedRefs,
    anonKey,
    serviceRoleKey,
    hasServiceRole: Boolean(serviceRoleKey),
  }
}

/**
 * Validate Preview URL and build legitimate SSO authentication config.
 * Never reduces SSO or prints tokens/cookies.
 */
export function resolvePreviewConfig(env = process.env, { allowLoopback = false } = {}) {
  const rawUrl = String(env.R3_PREVIEW_URL || '').trim()
  if (!rawUrl) {
    throw new R3GuardError('PREVIEW_URL_MISSING', 'Falta R3_PREVIEW_URL')
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new R3GuardError('PREVIEW_URL_INVALID', 'R3_PREVIEW_URL no es una URL válida')
  }

  const host = parsed.hostname.toLowerCase()
  if (FORBIDDEN_PROD_HOSTS.includes(host)) {
    throw new R3GuardError('PREVIEW_IS_PROD', `R3_PREVIEW_URL apunta a Production (${host}); abortado`)
  }
  const isLoopback = host === '127.0.0.1' || host === 'localhost'
  if (parsed.protocol !== 'https:' && !(allowLoopback && isLoopback)) {
    throw new R3GuardError('PREVIEW_NOT_HTTPS', 'R3_PREVIEW_URL debe usar https://')
  }

  const bypassSecret = String(env.R3_PREVIEW_BYPASS_SECRET || '').trim() || null
  const shareToken = String(env.R3_PREVIEW_SHARE_TOKEN || '').trim() || null
  const storageStatePath = String(env.R3_PREVIEW_STORAGE_STATE || '').trim() || null

  let authMode = 'none'
  if (bypassSecret) authMode = 'vercel_protection_bypass'
  else if (storageStatePath) authMode = 'playwright_storage_state'
  else if (shareToken) authMode = 'vercel_share_token'

  if (storageStatePath && !existsSync(resolve(storageStatePath))) {
    throw new R3GuardError('STORAGE_STATE_MISSING', `R3_PREVIEW_STORAGE_STATE no existe: ${storageStatePath}`)
  }

  const candidate = resolveAuthorizedCandidate(env)

  return {
    baseUrl: `${parsed.origin}`,
    host,
    authMode,
    bypassSecret,
    shareToken,
    storageStatePath: storageStatePath ? resolve(storageStatePath) : null,
    expectedSha: candidate.expectedSha,
    expectedBranch: candidate.expectedBranch,
    projectId: candidate.projectId,
    teamId: candidate.teamId,
    target: candidate.target,
  }
}

export function buildPreviewRequest(previewConfig, pathname = '/', extraHeaders = {}, { setBypassCookie = false } = {}) {
  const pathClean = pathname.startsWith('/') ? pathname : `/${pathname}`
  const url = new URL(pathClean, previewConfig.baseUrl)
  const headers = { ...extraHeaders }

  if (previewConfig.bypassSecret) {
    headers['x-vercel-protection-bypass'] = previewConfig.bypassSecret
    if (setBypassCookie) headers['x-vercel-set-bypass-cookie'] = 'true'
  } else if (previewConfig.shareToken) {
    url.searchParams.set('_vercel_share', previewConfig.shareToken)
  }

  return { url: url.toString(), headers }
}

export function resolveQaIdentities(env = process.env) {
  const dirEmail = String(env.R3_QA_DIRECCION_EMAIL || '').trim()
  const dirPassword = String(env.R3_QA_DIRECCION_PASSWORD || '')
  const liderEmail = String(env.R3_QA_LIDER_EMAIL || '').trim()
  const liderPassword = String(env.R3_QA_LIDER_PASSWORD || '')

  if (!dirEmail || !dirPassword) {
    throw new R3GuardError('QA_DIR_MISSING', 'Faltan R3_QA_DIRECCION_EMAIL / R3_QA_DIRECCION_PASSWORD')
  }
  if (!liderEmail || !liderPassword) {
    throw new R3GuardError('QA_LIDER_MISSING', 'Faltan R3_QA_LIDER_EMAIL / R3_QA_LIDER_PASSWORD')
  }
  if (dirEmail.toLowerCase() === liderEmail.toLowerCase()) {
    throw new R3GuardError('QA_IDENTITIES_DUPLICATE', 'Dirección y Líder deben ser identidades QA distintas')
  }

  return {
    direccion: { key: 'direccion', email: dirEmail, password: dirPassword },
    lider: { key: 'lider', email: liderEmail, password: liderPassword },
  }
}

export function resolveFixturePrefix(env = process.env) {
  const prefix = String(env.R3_FIXTURE_PREFIX || 'r3-int-').trim()
  if (!/^r3-int-[a-z0-9-]*$/i.test(prefix)) {
    throw new R3GuardError('FIXTURE_PREFIX_INVALID', 'R3_FIXTURE_PREFIX debe iniciar con "r3-int-"')
  }
  return prefix
}

export function requireIntegratedExecutionAuth(env = process.env, argv = process.argv.slice(2)) {
  const auth = String(env.R3_INTEGRATED_AUTH || '').trim()
  if (auth !== REQUIRED_INTEGRATED_AUTH) {
    throw new R3GuardError(
      'AUTH_INTEGRATED_MISSING',
      `Ejecución bloqueada: requiere R3_INTEGRATED_AUTH=${REQUIRED_INTEGRATED_AUTH}`,
    )
  }
  if (!argv.includes('--execute')) {
    throw new R3GuardError('EXECUTE_FLAG_MISSING', 'Ejecución bloqueada: agrega --execute junto con la autorización')
  }
  return { authorized: true, token: REQUIRED_INTEGRATED_AUTH }
}

export function requireRollbackExecutionAuth(env = process.env, argv = process.argv.slice(2)) {
  const auth = String(env.R3_ROLLBACK_AUTH || '').trim()
  if (auth !== REQUIRED_ROLLBACK_AUTH) {
    throw new R3GuardError(
      'AUTH_ROLLBACK_MISSING',
      `Rollback real bloqueado: requiere R3_ROLLBACK_AUTH=${REQUIRED_ROLLBACK_AUTH}`,
    )
  }
  if (!argv.includes('--apply')) {
    throw new R3GuardError('APPLY_FLAG_MISSING', 'Rollback real bloqueado: agrega --apply (sin --apply corre dry-run)')
  }
  return { authorized: true, token: REQUIRED_ROLLBACK_AUTH }
}

/**
 * Redact potential secrets before writing any JSON report or console output.
 */
export function redactSecrets(input, secretValues = []) {
  const cleanSecrets = secretValues.filter((s) => typeof s === 'string' && s.length >= 6)
  let text = typeof input === 'string' ? input : JSON.stringify(input)
  for (const secret of cleanSecrets) {
    text = text.split(secret).join('[REDACTED]')
  }
  text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
  text = text.replace(/_vercel_share=[A-Za-z0-9_-]+/gi, '_vercel_share=[REDACTED]')
  return typeof input === 'string' ? text : JSON.parse(text)
}
