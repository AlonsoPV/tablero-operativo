/* global process, console, fetch */
/**
 * Independent R3 Rollback OFF Automation (standalone — zero dependency on R3 runner or Supabase).
 *
 * Can run even if the R3 integrated runner crashes or is unavailable.
 *
 * Usage:
 *   Dry-run (read-only check):  npm run qa:r3:rollback
 *   Apply rollback OFF:         R3_ROLLBACK_AUTH=AUTH-R3-ROLLBACK-OFF npm run qa:r3:rollback -- --apply
 *   Apply without redeploy:     R3_ROLLBACK_AUTH=AUTH-R3-ROLLBACK-OFF npm run qa:r3:rollback -- --apply --env-only
 *
 * Hardcoded isolation constraints:
 * - Project: prj_k71rhUH9uTFEEPWofF3NyyhcKEDn (tablero-operativo)
 * - Team:    alonsopvs-projects
 * - Scope:   target=["preview"], gitBranch="preview" ONLY
 * - Keys:    AGENT_ORCHESTRATOR_R1, AGENT_MEMORY_R3 ONLY -> "0" (fail-closed === '1')
 * - SHA:     fe8ddf4765359de65ed708996a2e7d486481145b ONLY
 * - NEVER modifies Production, R2, R4, R0, SSO, CSP, or any other env var.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_CANDIDATE_SHA,
  DEFAULT_PREVIEW_BRANCH,
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  R3GuardError,
  isFlagOn,
  loadProtectedEnvFile,
  redactSecrets,
  requireRollbackExecutionAuth,
} from './r3DevGuard.mjs'

export const ROLLBACK_FLAG_KEYS = Object.freeze(['AGENT_ORCHESTRATOR_R1', 'AGENT_MEMORY_R3'])
const VERCEL_API = 'https://api.vercel.com'

export function resolveVercelToken(env = process.env) {
  const fromEnv = String(env.VERCEL_TOKEN || env.R3_VERCEL_TOKEN || '').trim()
  if (fromEnv) return { token: fromEnv, source: 'env' }

  const candidates = []
  if (env.APPDATA) candidates.push(join(env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json'))
  if (env.XDG_DATA_HOME) candidates.push(join(env.XDG_DATA_HOME, 'com.vercel.cli', 'auth.json'))
  if (env.HOME) {
    candidates.push(join(env.HOME, '.local', 'share', 'com.vercel.cli', 'auth.json'))
    candidates.push(join(env.HOME, 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'))
  }

  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof parsed?.token === 'string' && parsed.token.trim().length > 0) {
        return { token: parsed.token.trim(), source: 'vercel_cli_auth_json' }
      }
    } catch {
      // ignore malformed file
    }
  }
  return { token: null, source: 'missing' }
}

async function vercelRequest(fetchImpl, token, method, path, body = undefined) {
  const url = `${VERCEL_API}${path}`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  return { ok: res.ok, status: res.status, json }
}

/**
 * Inspect current gitBranch=preview R3 flags via Vercel API (read-only).
 */
export async function inspectPreviewBranchFlags({
  token,
  projectId = DEFAULT_PROJECT_ID,
  teamSlug = DEFAULT_TEAM_ID,
  gitBranch = DEFAULT_PREVIEW_BRANCH,
  fetchImpl = fetch,
}) {
  const qs = new URLSearchParams({ slug: teamSlug, gitBranch })
  const res = await vercelRequest(fetchImpl, token, 'GET', `/v9/projects/${projectId}/env?${qs.toString()}`)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: res.json?.error?.message || `HTTP ${res.status}`,
      flags: {},
      otherVarsUnmodified: true,
    }
  }
  const envs = Array.isArray(res.json?.envs) ? res.json.envs : []
  const flags = {}
  for (const key of ROLLBACK_FLAG_KEYS) {
    const match = envs.find(
      (e) =>
        e.key === key &&
        e.gitBranch === gitBranch &&
        Array.isArray(e.target) &&
        e.target.includes('preview') &&
        !e.target.includes('production'),
    )
    flags[key] = match
      ? {
          exists: true,
          id: match.id,
          value: match.value ?? null,
          isOn: isFlagOn(match.value),
          gitBranch: match.gitBranch,
          target: match.target,
        }
      : { exists: false, id: null, value: null, isOn: false, gitBranch, target: ['preview'] }
  }

  return { ok: true, status: res.status, flags }
}

/**
 * Execute dry-run or authorized Rollback OFF.
 */
export async function runR3RollbackOff({
  env = process.env,
  argv = process.argv.slice(2),
  fetchImpl = fetch,
  projectId = DEFAULT_PROJECT_ID,
  teamSlug = DEFAULT_TEAM_ID,
  gitBranch = DEFAULT_PREVIEW_BRANCH,
  sha = DEFAULT_CANDIDATE_SHA,
  reportPath = null,
} = {}) {
  const apply = argv.includes('--apply')
  const envOnly = argv.includes('--env-only')

  if (apply) {
    requireRollbackExecutionAuth(env, argv)
  }

  const { token, source: tokenSource } = resolveVercelToken(env)
  if (!token) {
    return {
      status: 'BLOCKED',
      mode: apply ? 'apply' : 'dry-run',
      reason: 'Falta VERCEL_TOKEN (o sesión Vercel CLI local) para ejecutar/verificar rollback OFF',
      tokenSource,
    }
  }

  const before = await inspectPreviewBranchFlags({ token, projectId, teamSlug, gitBranch, fetchImpl })
  if (!before.ok) {
    return {
      status: 'BLOCKED',
      mode: apply ? 'apply' : 'dry-run',
      reason: `No se pudo leer env vars de Vercel (${before.error})`,
      tokenSource,
    }
  }

  if (!apply) {
    const report = {
      operation: 'R3-ROLLBACK-OFF-DRY-RUN',
      status: 'READY',
      ranAt: new Date().toISOString(),
      tokenSource,
      scope: { projectId, teamSlug, target: ['preview'], gitBranch, sha, keys: [...ROLLBACK_FLAG_KEYS] },
      flagsBefore: before.flags,
      allOffNow: ROLLBACK_FLAG_KEYS.every((k) => !before.flags[k]?.isOn),
      mutated: false,
      redeployCommand: 'R3_ROLLBACK_AUTH=AUTH-R3-ROLLBACK-OFF npm run qa:r3:rollback -- --apply',
    }
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true })
      writeFileSync(reportPath, JSON.stringify(redactSecrets(report, [token]), null, 2))
    }
    return report
  }

  // Apply: strictly patch ONLY AGENT_ORCHESTRATOR_R1 and AGENT_MEMORY_R3 on gitBranch=preview -> "0"
  const patched = []
  for (const key of ROLLBACK_FLAG_KEYS) {
    const info = before.flags[key]
    if (!info?.exists || !info.id) {
      patched.push({ key, action: 'already_absent', ok: true })
      continue
    }
    const qs = new URLSearchParams({ slug: teamSlug })
    const res = await vercelRequest(fetchImpl, token, 'PATCH', `/v9/projects/${projectId}/env/${info.id}?${qs.toString()}`, {
      key,
      value: '0',
      type: 'plain',
      target: ['preview'],
      gitBranch,
      comment: 'R3 Rollback OFF — qa:r3:rollback (fail-closed, === 1 only)',
    })
    patched.push({
      key,
      id: info.id,
      action: 'patched_to_0',
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : res.json?.error?.message || `HTTP ${res.status}`,
    })
  }

  const patchFailed = patched.some((p) => !p.ok)

  // Verify flags are OFF via read-only GET
  const after = await inspectPreviewBranchFlags({ token, projectId, teamSlug, gitBranch, fetchImpl })
  const allOffAfter = after.ok && ROLLBACK_FLAG_KEYS.every((k) => !after.flags[k]?.isOn)

  // Single redeploy OFF of authorized SHA ref=preview (unless --env-only or patch failed)
  let redeploy = { requested: !envOnly, executed: false, ok: true }
  if (!envOnly && !patchFailed && allOffAfter) {
    const qs = new URLSearchParams({ slug: teamSlug, forceNew: '1' })
    const depRes = await vercelRequest(fetchImpl, token, 'POST', `/v13/deployments?${qs.toString()}`, {
      name: 'tablero-operativo',
      project: projectId,
      gitSource: {
        type: 'github',
        org: 'AlonsoPV',
        repo: 'tablero-operativo',
        ref: gitBranch,
        sha,
      },
    })
    redeploy = {
      requested: true,
      executed: true,
      ok: depRes.ok,
      status: depRes.status,
      id: depRes.json?.id ?? null,
      url: depRes.json?.url ? `https://${depRes.json.url}` : null,
      readyState: depRes.json?.readyState ?? null,
      target: depRes.json?.target ?? null,
      error: depRes.ok ? null : depRes.json?.error?.message || `HTTP ${depRes.status}`,
    }
  }

  const ok = !patchFailed && allOffAfter && redeploy.ok
  const report = {
    operation: 'AUTH-R3-ROLLBACK-OFF',
    status: ok ? 'PASS' : 'FAIL',
    ranAt: new Date().toISOString(),
    tokenSource,
    scope: { projectId, teamSlug, target: ['preview'], gitBranch, sha, keys: [...ROLLBACK_FLAG_KEYS] },
    patched,
    flagsAfter: after.flags,
    allOffAfter,
    redeploy,
    productionUntouched: true,
  }

  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, JSON.stringify(redactSecrets(report, [token]), null, 2))
  }
  return report
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const env = loadProtectedEnvFile(process.env.R3_ENV_FILE, process.env)
    const reportPath = resolve('.qa/r3-rollback-script-report.json')
    const result = await runR3RollbackOff({ env, argv: process.argv.slice(2), reportPath })
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.status === 'PASS' || result.status === 'READY' ? 0 : result.status === 'BLOCKED' ? 2 : 1)
  } catch (error) {
    const code = error instanceof R3GuardError ? error.code : 'ROLLBACK_ERROR'
    console.error(JSON.stringify({ status: 'BLOCKED', code, error: error instanceof Error ? error.message : String(error) }))
    process.exit(2)
  }
}
