/* global process, console, fetch, URLSearchParams */
/**
 * Text Complete Independent Rollback OFF (`npm run qa:text:rollback`).
 *
 * Dry-run by default (read-only). With `TC_ROLLBACK_AUTH=AUTH-TEXT-COMPLETE-ROLLBACK --apply`:
 * patches ONLY Preview branch flags (`AGENT_ORCHESTRATOR_R1=0`, `AGENT_MEMORY_R3=0`,
 * `R2_EXECUTION_MODE=disabled`, `COPILOT_R2_GATE=0`) on `TC_EXPECTED_BRANCH`, never Production.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TextCompleteGuardError,
  assertQaIsolation,
  loadQaEnvFile,
  redactQaSecrets,
  requireTcRollbackAuth,
  resolveCandidate,
} from './textCompleteGuard.mjs'
import { inspectTextCompleteFlags } from './textCompletePreflight.mjs'
import { resolveVercelToken } from './r3-rollback-off.mjs'

const VERCEL_API = 'https://api.vercel.com'

export const TC_ROLLBACK_TARGETS = Object.freeze({
  AGENT_ORCHESTRATOR_R1: '0',
  AGENT_MEMORY_R3: '0',
  R2_EXECUTION_MODE: 'disabled',
  COPILOT_R2_GATE: '0',
})

export async function runTextCompleteRollback({
  env = process.env,
  argv = process.argv.slice(2),
  fetchImpl = fetch,
  reportPath = null,
} = {}) {
  const apply = argv.includes('--apply')
  assertQaIsolation(env)
  const candidate = resolveCandidate(env)
  if (apply) requireTcRollbackAuth(env, argv)

  const { token, source: tokenSource } = resolveVercelToken({
    ...env,
    VERCEL_TOKEN: env.TC_VERCEL_TOKEN || env.VERCEL_TOKEN,
  })
  if (!token) {
    return {
      status: 'BLOCKED',
      mode: apply ? 'apply' : 'dry-run',
      reason: 'Falta VERCEL_TOKEN / TC_VERCEL_TOKEN para inspeccionar o aplicar rollback Preview',
      tokenSource,
    }
  }

  const before = await inspectTextCompleteFlags({
    token,
    projectId: candidate.projectId,
    teamSlug: candidate.teamId,
    gitBranch: candidate.expectedBranch,
    fetchImpl,
  })
  if (!before.ok) {
    return {
      status: 'BLOCKED',
      mode: apply ? 'apply' : 'dry-run',
      reason: `No se pudieron leer flags Preview (${before.error})`,
      tokenSource,
    }
  }

  if (!apply) {
    const report = {
      operation: 'TC-ROLLBACK-DRY-RUN',
      status: 'READY',
      ranAt: new Date().toISOString(),
      scope: { ...candidate, keys: Object.keys(TC_ROLLBACK_TARGETS) },
      flagsBefore: before.flags,
      mutated: false,
      dbGateDisableSql: 'DELETE FROM public.agent_execution_gate;',
      dbRollbackScript: 'supabase/scripts/rollback_agent_apply_action_status.sql',
    }
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true })
      writeFileSync(reportPath, JSON.stringify(redactQaSecrets(report, [token]), null, 2))
    }
    return report
  }

  const patched = []
  for (const [key, safeValue] of Object.entries(TC_ROLLBACK_TARGETS)) {
    const info = before.flags[key]
    if (!info?.exists || !info.id) {
      patched.push({ key, action: 'already_absent', ok: true })
      continue
    }
    const qs = new URLSearchParams({ slug: candidate.teamId })
    const res = await fetchImpl(`${VERCEL_API}/v9/projects/${candidate.projectId}/env/${info.id}?${qs.toString()}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        key,
        value: safeValue,
        type: 'plain',
        target: ['preview'],
        gitBranch: candidate.expectedBranch,
        comment: 'Text Complete QA Rollback OFF',
      }),
    })
    patched.push({ key, id: info.id, action: `patched_to_${safeValue}`, ok: res.ok, status: res.status })
  }

  const after = await inspectTextCompleteFlags({
    token,
    projectId: candidate.projectId,
    teamSlug: candidate.teamId,
    gitBranch: candidate.expectedBranch,
    fetchImpl,
  })
  const allSafeAfter =
    after.ok &&
    Object.entries(TC_ROLLBACK_TARGETS).every(([k, safeVal]) => {
      const v = after.flags[k]?.value
      return v == null || v === safeVal || (safeVal === '0' && v !== '1')
    })

  const ok = !patched.some((p) => !p.ok) && allSafeAfter
  const report = {
    operation: 'AUTH-TEXT-COMPLETE-ROLLBACK',
    status: ok ? 'PASS' : 'FAIL',
    ranAt: new Date().toISOString(),
    scope: { ...candidate, keys: Object.keys(TC_ROLLBACK_TARGETS) },
    patched,
    allSafeAfter,
    productionUntouched: true,
    dbGateDisableSql: 'DELETE FROM public.agent_execution_gate;',
    dbRollbackScript: 'supabase/scripts/rollback_agent_apply_action_status.sql',
  }
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, JSON.stringify(redactQaSecrets(report, [token]), null, 2))
  }
  return report
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const env = loadQaEnvFile(process.env.TC_ENV_FILE, process.env)
    const reportPath = resolve('.qa/text-complete-rollback-report.json')
    const result = await runTextCompleteRollback({ env, argv: process.argv.slice(2), reportPath })
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.status === 'PASS' || result.status === 'READY' ? 0 : result.status === 'BLOCKED' ? 2 : 1)
  } catch (error) {
    const code = error instanceof TextCompleteGuardError ? error.code : 'TC_ROLLBACK_ERROR'
    console.error(JSON.stringify({ status: 'BLOCKED', code, error: error instanceof Error ? error.message : String(error) }))
    process.exit(2)
  }
}
