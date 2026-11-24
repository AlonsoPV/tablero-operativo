/* global process, URL */
/**
 * Text Complete Integrated QA Guard (fail-closed).
 *
 * Enforces strict separation from BOTH DEV (`tgiuevzlyptzlfgxsfhj`) and PROD (`xhpasmjzuwifmjhrsumb`),
 * explicit QA allowlist, candidate SHA/branch pinning, notification provider isolation,
 * SSO protection, secret redaction, and explicit execution/rollback authorization tokens.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

export const BLOCKED_SUPABASE_REFS = Object.freeze([
  'tgiuevzlyptzlfgxsfhj', // DEV
  'xhpasmjzuwifmjhrsumb', // PROD
])

export const FORBIDDEN_PROD_HOSTS = Object.freeze([
  'scrumbanemx.vercel.app',
  'tablero-operativo.vercel.app',
  'tablero-operativo-git-main-alonsopvs-projects.vercel.app',
])

export const FORBIDDEN_BRANCHES = Object.freeze(['main', 'master', 'production', 'prod'])
export const FORBIDDEN_ENV_FILES = Object.freeze(['.env', '.env.production', '.env.prodlocal', '.env.development'])
export const FORBIDDEN_PROVIDER_ENV_KEYS = Object.freeze([
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_DISPATCHER_ENABLED',
  'RETELL_API_KEY',
  'RESEND_API_KEY',
  'SMTP_PASS',
])

export const DEFAULT_PROJECT_ID = 'prj_k71rhUH9uTFEEPWofF3NyyhcKEDn'
export const DEFAULT_TEAM_ID = 'alonsopvs-projects'
export const FULL_SHA_RE = /^[0-9a-f]{40}$/
export const LOCAL_REF_RE = /^qalocal[a-z0-9]{13}$/

export const REQUIRED_QA_AUTH = 'AUTH-TEXT-COMPLETE-QA'
export const REQUIRED_LOCAL_QA_AUTH = 'AUTH-TEXT-COMPLETE-LOCAL-QA'
export const REQUIRED_ROLLBACK_AUTH = 'AUTH-TEXT-COMPLETE-ROLLBACK'

export function isLocalQaMode(env = process.env) {
  return String(env.TC_LOCAL_QA || '').trim() === '1'
}

export class TextCompleteGuardError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TextCompleteGuardError'
    this.code = code
  }
}

export function refFromSupabaseUrl(url) {
  return /^https:\/\/([a-z0-9]+)\.supabase\.(co|in)\b/i.exec(String(url || '').trim())?.[1]?.toLowerCase() ?? null
}

/**
 * Load an explicit QA env file without touching root `.env` or production files.
 */
export function loadQaEnvFile(filePath, baseEnv = process.env) {
  if (!filePath) return { ...baseEnv }
  const resolved = resolve(filePath)
  const name = basename(resolved).toLowerCase()
  if (FORBIDDEN_ENV_FILES.includes(name)) {
    throw new TextCompleteGuardError('FORBIDDEN_ENV_FILE', `Archivo prohibido para QA integrado: ${name}`)
  }
  if (!existsSync(resolved)) {
    throw new TextCompleteGuardError('ENV_FILE_MISSING', `No existe archivo de entorno QA: ${resolved}`)
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
 * Assert zero DEV/PROD contamination, zero production runtime flags, and zero live external notification providers.
 */
export function assertQaIsolation(env = process.env) {
  if (env.NODE_ENV === 'production') {
    throw new TextCompleteGuardError('PROD_NODE_ENV', 'NODE_ENV=production prohibido para QA integrado')
  }
  if (env.VERCEL_ENV === 'production') {
    throw new TextCompleteGuardError('PROD_VERCEL_ENV', 'VERCEL_ENV=production prohibido para QA integrado')
  }

  for (const key of Object.keys(env)) {
    if (!key.startsWith('TC_') && !key.startsWith('R2_') && key !== 'SUPABASE_URL') continue
    const val = String(env[key] || '').toLowerCase()
    for (const ref of BLOCKED_SUPABASE_REFS) {
      if (val.includes(ref)) {
        throw new TextCompleteGuardError('BLOCKED_REF_DETECTED', `Variable ${key} referencia DEV o PROD (${ref}); abortado`)
      }
    }
    for (const host of FORBIDDEN_PROD_HOSTS) {
      if (val.includes(host)) {
        throw new TextCompleteGuardError('PROD_HOST_DETECTED', `Variable ${key} apunta a Production (${host}); abortado`)
      }
    }
  }

  for (const providerKey of FORBIDDEN_PROVIDER_ENV_KEYS) {
    if (String(env[providerKey] || '').trim()) {
      throw new TextCompleteGuardError(
        'LIVE_PROVIDER_ENV_PRESENT',
        `Credencial o dispatcher externo presente (${providerKey}); bloquear salidas reales durante QA`,
      )
    }
  }

  if (String(env.R0_ENABLED || '').trim() === '1' || String(env.R4_ENABLED || '').trim() === '1') {
    throw new TextCompleteGuardError('OUT_OF_SCOPE_FLAG', 'R0/R4 deben permanecer desactivados en la ventana Text Complete QA')
  }

  return { ok: true }
}

export function resolveCandidate(env = process.env) {
  assertQaIsolation(env)

  const expectedSha = String(env.TC_EXPECTED_SHA || '').trim().toLowerCase()
  if (!expectedSha || !FULL_SHA_RE.test(expectedSha)) {
    throw new TextCompleteGuardError(
      'EXPECTED_SHA_INVALID',
      'Falta TC_EXPECTED_SHA válido (SHA Git completo de 40 caracteres hex)',
    )
  }

  const expectedBranch = String(env.TC_EXPECTED_BRANCH || '').trim()
  if (!expectedBranch || FORBIDDEN_BRANCHES.includes(expectedBranch.toLowerCase()) || /\s/.test(expectedBranch)) {
    throw new TextCompleteGuardError(
      'EXPECTED_BRANCH_INVALID',
      `TC_EXPECTED_BRANCH ausente o prohibida: ${expectedBranch || '(vacío)'}`,
    )
  }

  const projectId = String(env.TC_VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID).trim()
  if (projectId !== DEFAULT_PROJECT_ID) {
    throw new TextCompleteGuardError('PROJECT_ID_MISMATCH', `Proyecto Vercel no autorizado: ${projectId}`)
  }

  const teamId = String(env.TC_VERCEL_TEAM_ID || DEFAULT_TEAM_ID).trim()
  if (teamId !== DEFAULT_TEAM_ID) {
    throw new TextCompleteGuardError('TEAM_ID_MISMATCH', `Team Vercel no autorizado: ${teamId}`)
  }

  return {
    expectedSha,
    expectedBranch,
    projectId,
    teamId,
    target: 'preview',
  }
}

export function resolveQaSupabaseTarget(env = process.env, { allowLoopback = false } = {}) {
  assertQaIsolation(env)

  const rawAllow = String(env.TC_QA_PROJECT_REFS || env.R2_QA_PROJECT_REFS || '').trim()
  const allowlist = rawAllow
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  if (allowlist.length === 0) {
    throw new TextCompleteGuardError('QA_ALLOWLIST_MISSING', 'Falta TC_QA_PROJECT_REFS (allowlist del proyecto QA dedicado)')
  }
  if (allowlist.some((r) => BLOCKED_SUPABASE_REFS.includes(r))) {
    throw new TextCompleteGuardError('QA_ALLOWLIST_CONTAMINATED', 'La allowlist QA contiene DEV o PROD; abortado')
  }

  const url = String(env.TC_QA_SUPABASE_URL || '').trim()
  if (!url) {
    throw new TextCompleteGuardError('QA_URL_MISSING', 'Falta TC_QA_SUPABASE_URL del proyecto Supabase QA dedicado')
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new TextCompleteGuardError('QA_URL_INVALID', 'TC_QA_SUPABASE_URL no es una URL válida')
  }

  const isLoopbackSupa = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  if (allowLoopback && !isLoopbackSupa) {
    throw new TextCompleteGuardError('QA_LOCAL_NOT_LOOPBACK', 'En modo local QA, TC_QA_SUPABASE_URL debe ser http://127.0.0.1:<puerto> o http://localhost:<puerto>')
  }

  let ref = refFromSupabaseUrl(url)
  if (!ref && allowLoopback && isLoopbackSupa) {
    const localRef = String(env.TC_QA_LOCAL_REF || '').trim().toLowerCase()
    if (!LOCAL_REF_RE.test(localRef)) {
      throw new TextCompleteGuardError('QA_LOCAL_REF_INVALID', 'TC_QA_LOCAL_REF debe ser qalocal + 13 caracteres [a-z0-9]')
    }
    ref = localRef
  }

  if (!ref) {
    throw new TextCompleteGuardError('QA_REF_UNRESOLVED', 'TC_QA_SUPABASE_URL debe ser https://<ref>.supabase.co')
  }
  if (BLOCKED_SUPABASE_REFS.includes(ref)) {
    throw new TextCompleteGuardError('QA_REF_BLOCKED', `Ref ${ref} es DEV/PROD y está prohibida para R2 QA`)
  }
  if (!allowlist.includes(ref)) {
    throw new TextCompleteGuardError('QA_REF_NOT_ALLOWLISTED', `Ref ${ref} no está autorizada en TC_QA_PROJECT_REFS`)
  }

  const anonKey = String(env.TC_QA_SUPABASE_ANON_KEY || '').trim()
  if (!anonKey) {
    throw new TextCompleteGuardError('QA_ANON_KEY_MISSING', 'Falta TC_QA_SUPABASE_ANON_KEY')
  }

  const serviceRoleKey = String(env.TC_QA_SUPABASE_SERVICE_ROLE_KEY || '').trim() || null

  return {
    url: url.replace(/\/+$/, ''),
    ref,
    allowlist,
    anonKey,
    serviceRoleKey,
    hasServiceRole: Boolean(serviceRoleKey),
  }
}

export function resolveQaPreviewConfig(env = process.env, { allowLoopback = false } = {}) {
  const candidate = resolveCandidate(env)
  const rawUrl = String(env.TC_PREVIEW_URL || '').trim()
  if (!rawUrl) {
    throw new TextCompleteGuardError('PREVIEW_URL_MISSING', 'Falta TC_PREVIEW_URL del Preview protegido')
  }
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new TextCompleteGuardError('PREVIEW_URL_INVALID', 'TC_PREVIEW_URL no es una URL válida')
  }
  const host = parsed.hostname.toLowerCase()
  if (FORBIDDEN_PROD_HOSTS.includes(host)) {
    throw new TextCompleteGuardError('PREVIEW_IS_PROD', `TC_PREVIEW_URL apunta a Production (${host})`)
  }
  const isLoopback = host === '127.0.0.1' || host === 'localhost'
  if (allowLoopback && !isLoopback) {
    throw new TextCompleteGuardError('LOCAL_PREVIEW_NOT_LOOPBACK', 'En TC_LOCAL_QA=1, TC_PREVIEW_URL debe apuntar a loopback (127.0.0.1/localhost)')
  }
  if (parsed.protocol !== 'https:' && !(allowLoopback && isLoopback)) {
    throw new TextCompleteGuardError('PREVIEW_NOT_HTTPS', 'TC_PREVIEW_URL debe usar https://')
  }

  const bypassSecret = String(env.TC_PREVIEW_BYPASS_SECRET || '').trim() || null
  const shareToken = String(env.TC_PREVIEW_SHARE_TOKEN || '').trim() || null
  const storageStatePath = String(env.TC_PREVIEW_STORAGE_STATE || '').trim() || null

  let authMode = 'none'
  if (allowLoopback && isLoopback) authMode = 'local_loopback'
  else if (bypassSecret) authMode = 'vercel_protection_bypass'
  else if (storageStatePath) authMode = 'playwright_storage_state'
  else if (shareToken) authMode = 'vercel_share_token'

  if (storageStatePath && !existsSync(resolve(storageStatePath))) {
    throw new TextCompleteGuardError('STORAGE_STATE_MISSING', `TC_PREVIEW_STORAGE_STATE no existe: ${storageStatePath}`)
  }

  return {
    baseUrl: parsed.origin,
    host,
    authMode,
    bypassSecret,
    shareToken,
    storageStatePath: storageStatePath ? resolve(storageStatePath) : null,
    ...candidate,
  }
}

export function buildQaPreviewRequest(previewConfig, pathname = '/', extraHeaders = {}, { setBypassCookie = false } = {}) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const url = new URL(cleanPath, previewConfig.baseUrl)
  const headers = { ...extraHeaders }
  if (previewConfig.bypassSecret) {
    headers['x-vercel-protection-bypass'] = previewConfig.bypassSecret
    if (setBypassCookie) headers['x-vercel-set-bypass-cookie'] = 'true'
  } else if (previewConfig.shareToken) {
    url.searchParams.set('_vercel_share', previewConfig.shareToken)
  }
  return { url: url.toString(), headers }
}

/**
 * Requires distinct QA identities for full Text Complete validation:
 * super_admin (executive with write auth), direccion (read-only executive), lider, operativo,
 * and optional analista (for explicit E9 analyst denial).
 */
export function resolveTextCompleteIdentities(env = process.env) {
  const required = [
    ['super_admin', 'TC_QA_SUPER_ADMIN_EMAIL', 'TC_QA_SUPER_ADMIN_PASSWORD'],
    ['direccion', 'TC_QA_DIRECCION_EMAIL', 'TC_QA_DIRECCION_PASSWORD'],
    ['lider', 'TC_QA_LIDER_EMAIL', 'TC_QA_LIDER_PASSWORD'],
    ['operativo', 'TC_QA_OPERATIVO_EMAIL', 'TC_QA_OPERATIVO_PASSWORD'],
  ]
  const out = {}
  const seenEmails = new Set()

  for (const [key, emailKey, passKey] of required) {
    const email = String(env[emailKey] || '').trim().toLowerCase()
    const password = String(env[passKey] || '')
    if (!email || !password) {
      throw new TextCompleteGuardError('QA_IDENTITY_MISSING', `Faltan ${emailKey} / ${passKey}`)
    }
    if (seenEmails.has(email)) {
      throw new TextCompleteGuardError('QA_IDENTITY_DUPLICATE', `Email duplicado en identidades QA: ${key}`)
    }
    seenEmails.add(email)
    out[key] = { key, email, password }
  }

  const analistaEmail = String(env.TC_QA_ANALISTA_EMAIL || '').trim().toLowerCase()
  const analistaPass = String(env.TC_QA_ANALISTA_PASSWORD || '')
  if (analistaEmail && analistaPass) {
    if (seenEmails.has(analistaEmail)) {
      throw new TextCompleteGuardError('QA_IDENTITY_DUPLICATE', 'Email de analista duplicado con otra identidad QA')
    }
    out.analista = { key: 'analista', email: analistaEmail, password: analistaPass }
  }

  return out
}

export function resolveTcFixturePrefix(env = process.env) {
  const prefix = String(env.TC_FIXTURE_PREFIX || 'tc-qa-').trim()
  if (!/^tc-qa-[a-z0-9-]*$/i.test(prefix)) {
    throw new TextCompleteGuardError('FIXTURE_PREFIX_INVALID', 'TC_FIXTURE_PREFIX debe iniciar con "tc-qa-"')
  }
  return prefix
}

export function requireTextCompleteAuth(env = process.env, argv = process.argv.slice(2)) {
  const auth = String(env.TC_QA_AUTH || '').trim()
  const localMode = isLocalQaMode(env)
  const expected = localMode ? REQUIRED_LOCAL_QA_AUTH : REQUIRED_QA_AUTH
  const valid = localMode
    ? auth === REQUIRED_LOCAL_QA_AUTH || auth === REQUIRED_QA_AUTH
    : auth === REQUIRED_QA_AUTH
  if (!valid) {
    throw new TextCompleteGuardError('AUTH_MISSING', `Ejecución bloqueada: requiere TC_QA_AUTH=${expected}`)
  }
  if (!argv.includes('--execute')) {
    throw new TextCompleteGuardError('EXECUTE_FLAG_MISSING', 'Ejecución bloqueada: agrega --execute junto con la autorización')
  }
  return { authorized: true, token: auth }
}

export function requireTcRollbackAuth(env = process.env, argv = process.argv.slice(2)) {
  const auth = String(env.TC_ROLLBACK_AUTH || '').trim()
  if (auth !== REQUIRED_ROLLBACK_AUTH) {
    throw new TextCompleteGuardError(
      'ROLLBACK_AUTH_MISSING',
      `Rollback bloqueado: requiere TC_ROLLBACK_AUTH=${REQUIRED_ROLLBACK_AUTH}`,
    )
  }
  if (!argv.includes('--apply')) {
    throw new TextCompleteGuardError('APPLY_FLAG_MISSING', 'Rollback real bloqueado: agrega --apply (sin --apply corre dry-run)')
  }
  return { authorized: true, token: REQUIRED_ROLLBACK_AUTH }
}

export function redactQaSecrets(input, secretValues = []) {
  const clean = secretValues.filter((s) => typeof s === 'string' && s.length >= 6)
  let text = typeof input === 'string' ? input : JSON.stringify(input)
  for (const secret of clean) {
    text = text.split(secret).join('[REDACTED]')
  }
  text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
  text = text.replace(/_vercel_share=[A-Za-z0-9_-]+/gi, '_vercel_share=[REDACTED]')
  return typeof input === 'string' ? text : JSON.parse(text)
}
