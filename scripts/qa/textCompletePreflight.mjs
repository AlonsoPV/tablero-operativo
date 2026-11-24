/* global process, console, fetch, URLSearchParams */
/**
 * Text Complete Integrated Preflight (`npm run qa:text:preflight`).
 *
 * Strictly READ-ONLY (zero DB writes, zero env mutations, zero deployments).
 * Verifies QA Supabase isolation, agent_execution_gate, R1/R2/R3 schema, real QA JWTs,
 * Preview SSO + SHA + flags, notification isolation, and rollback availability BEFORE any write.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  TextCompleteGuardError,
  assertQaIsolation,
  buildQaPreviewRequest,
  isLocalQaMode,
  loadQaEnvFile,
  redactQaSecrets,
  resolveCandidate,
  resolveQaPreviewConfig,
  resolveQaSupabaseTarget,
  resolveTcFixturePrefix,
  resolveTextCompleteIdentities,
} from './textCompleteGuard.mjs'
import { inspectPreviewDeployment, resolveVercelToken } from './r3-rollback-off.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const VERCEL_API = 'https://api.vercel.com'

function defaultCreateSupabaseClient(url, key, extraHeaders = {}) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: Object.keys(extraHeaders).length ? { headers: extraHeaders } : undefined,
  })
}

export async function inspectTextCompleteFlags({
  token,
  projectId,
  teamSlug,
  gitBranch,
  fetchImpl = fetch,
}) {
  const qs = new URLSearchParams({ slug: teamSlug, gitBranch })
  const res = await fetchImpl(`${VERCEL_API}/v9/projects/${projectId}/env?${qs.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: json?.error?.message || `HTTP ${res.status}`, flags: {} }
  }
  const envs = Array.isArray(json?.envs) ? json.envs : []
  const keys = [
    'AGENT_ORCHESTRATOR_R1',
    'AGENT_MEMORY_R3',
    'R2_EXECUTION_MODE',
    'R2_QA_PROJECT_REFS',
    'COPILOT_R2_GATE',
    'R0_ENABLED',
    'R4_ENABLED',
  ]
  const flags = {}
  for (const key of keys) {
    const match = envs.find(
      (e) =>
        e.key === key &&
        e.gitBranch === gitBranch &&
        Array.isArray(e.target) &&
        e.target.includes('preview') &&
        !e.target.includes('production'),
    )
    flags[key] = match ? { exists: true, id: match.id, value: match.value ?? null } : { exists: false, id: null, value: null }
  }
  return { ok: true, status: res.status, flags }
}

export async function runTextCompletePreflight({
  env = process.env,
  fetchImpl = fetch,
  createSupabaseClient = defaultCreateSupabaseClient,
  allowLoopback = false,
  reportPath = null,
} = {}) {
  const checks = {}
  const blockers = []
  const secrets = [
    env.TC_QA_SUPABASE_ANON_KEY,
    env.TC_QA_SUPABASE_SERVICE_ROLE_KEY,
    env.TC_QA_SUPER_ADMIN_PASSWORD,
    env.TC_QA_DIRECCION_PASSWORD,
    env.TC_QA_LIDER_PASSWORD,
    env.TC_QA_OPERATIVO_PASSWORD,
    env.TC_QA_ANALISTA_PASSWORD,
    env.TC_PREVIEW_BYPASS_SECRET,
    env.TC_PREVIEW_SHARE_TOKEN,
    env.VERCEL_TOKEN,
    env.TC_VERCEL_TOKEN,
  ]

  const setCheck = (key, status, detail = {}, critical = true) => {
    checks[key] = { status, critical, ...detail }
    if (critical && status !== 'PASS') {
      blockers.push(`${key}: ${detail.reason || status}`)
    }
  }

  // 1. Isolation (no DEV/PROD refs, no prod hosts, no live external notification providers)
  try {
    assertQaIsolation(env)
    setCheck('qa_isolation_and_notifications', 'PASS', { devAndProdBlocked: true, liveProvidersAbsent: true })
  } catch (error) {
    setCheck('qa_isolation_and_notifications', 'FAIL', {
      code: error instanceof TextCompleteGuardError ? error.code : 'ISOLATION_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  // 2. Dedicated QA Supabase target allowlist
  let qaTarget = null
  try {
    qaTarget = resolveQaSupabaseTarget(env, { allowLoopback })
    setCheck('qa_supabase_allowed', 'PASS', {
      ref: qaTarget.ref,
      allowlist: qaTarget.allowlist,
      hasServiceRoleForCleanup: qaTarget.hasServiceRole,
    })
  } catch (error) {
    setCheck('qa_supabase_allowed', 'BLOCKED', {
      code: error instanceof TextCompleteGuardError ? error.code : 'QA_TARGET_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  // 3. QA Supabase Auth Health (read-only)
  if (!qaTarget) {
    setCheck('qa_auth_health', 'BLOCKED', { reason: 'Sin destino Supabase QA autorizado' })
  } else {
    try {
      const healthRes = await fetchImpl(`${qaTarget.url}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: qaTarget.anonKey },
      })
      const ok = healthRes.status === 200
      setCheck('qa_auth_health', ok ? 'PASS' : 'BLOCKED', {
        httpStatus: healthRes.status,
        reason: ok ? undefined : `Auth health devolvió HTTP ${healthRes.status}`,
      })
    } catch (error) {
      setCheck('qa_auth_health', 'BLOCKED', {
        reason: `Error conectando a Supabase QA: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
      })
    }
  }

  // 4. QA Identities (real JWT signIn) + R1/R2/R3 Schema & agent_execution_gate (read-only)
  let identities = null
  try {
    identities = resolveTextCompleteIdentities(env)
  } catch (error) {
    setCheck('qa_identities_and_gate', 'BLOCKED', {
      code: error instanceof TextCompleteGuardError ? error.code : 'QA_ID_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  if (identities && qaTarget && checks.qa_auth_health?.status === 'PASS') {
    try {
      const signInAndProbe = async (idCfg) => {
        const authClient = createSupabaseClient(qaTarget.url, qaTarget.anonKey)
        const { data, error } = await authClient.auth.signInWithPassword({
          email: idCfg.email,
          password: idCfg.password,
        })
        if (error || !data?.session?.access_token) {
          throw new Error(`signIn ${idCfg.key}: ${error?.message || 'sin sesión'}`)
        }
        secrets.push(data.session.access_token)
        const authed = createSupabaseClient(qaTarget.url, qaTarget.anonKey, {
          Authorization: `Bearer ${data.session.access_token}`,
        })
        const uRes = await authed.from('usuarios').select('id,rol,activo').eq('user_id', data.user.id).maybeSingle()
        if (uRes.error || !uRes.data?.id) {
          throw new Error(`usuarios ${idCfg.key}: ${uRes.error?.message || 'sin perfil'}`)
        }
        return {
          key: idCfg.key,
          usuarioId: uRes.data.id,
          rol: uRes.data.rol ?? null,
          activo: uRes.data.activo !== false,
          client: authed,
        }
      }

      const signed = {}
      for (const cfg of Object.values(identities)) {
        signed[cfg.key] = await signInAndProbe(cfg)
      }
      const usuarioIds = Object.values(signed).map((s) => s.usuarioId)
      const allDistinct = new Set(usuarioIds).size === usuarioIds.length
      const allActive = Object.values(signed).every((s) => s.activo)

      // Read-only schema + gate checks using authenticated super_admin JWT
      const probeClient = signed.super_admin.client
      const [gateAllowed, gateEnv, memProbe, docProbe, receiptProbe, outboxProbe] = await Promise.all([
        probeClient.rpc('agent_execution_allowed'),
        probeClient.rpc('agent_execution_environment'),
        probeClient.from('agent_memory').select('id', { count: 'exact', head: true }),
        probeClient.from('agent_documents').select('id', { count: 'exact', head: true }),
        probeClient.from('agent_action_receipts').select('pending_op_id', { count: 'exact', head: true }),
        probeClient.from('qa_outbox').select('id', { count: 'exact', head: true }),
      ])

      const gateOpen = !gateAllowed.error && gateAllowed.data === true
      const gateMatchesRef = !gateEnv.error && String(gateEnv.data || '').toLowerCase() === qaTarget.ref
      const schemaOk = !memProbe.error && !docProbe.error && !receiptProbe.error && !outboxProbe.error
      const ok = allDistinct && allActive && gateOpen && gateMatchesRef && schemaOk

      const reasons = []
      if (!allDistinct) reasons.push('usuario_id duplicado entre identidades QA')
      if (!allActive) reasons.push('identidad QA inactiva')
      if (!gateOpen) reasons.push(`agent_execution_allowed=${gateAllowed.data ?? gateAllowed.error?.message ?? 'false'}`)
      if (!gateMatchesRef) reasons.push(`agent_execution_environment=${gateEnv.data ?? 'null'} != ${qaTarget.ref}`)
      if (memProbe.error) reasons.push(`agent_memory: ${memProbe.error.message}`)
      if (docProbe.error) reasons.push(`agent_documents: ${docProbe.error.message}`)
      if (receiptProbe.error) reasons.push(`agent_action_receipts: ${receiptProbe.error.message}`)
      if (outboxProbe.error) reasons.push(`qa_outbox: ${outboxProbe.error.message}`)

      setCheck('qa_identities_and_gate', ok ? 'PASS' : 'FAIL', {
        identities: Object.fromEntries(Object.entries(signed).map(([k, v]) => [k, { rol: v.rol, activo: v.activo }])),
        allDistinct,
        gateOpen,
        gateEnv: gateEnv.data ?? null,
        schemaOk,
        reason: reasons.length ? reasons.join('; ') : undefined,
      })
    } catch (error) {
      setCheck('qa_identities_and_gate', 'BLOCKED', {
        reason: error instanceof Error ? error.message.slice(0, 220) : String(error),
      })
    }
  } else if (identities && !checks.qa_identities_and_gate) {
    setCheck('qa_identities_and_gate', 'BLOCKED', {
      reason: 'Identidades presentes pero sin conectividad a Supabase QA',
    })
  }

  // 5. Preview SSO intact + authenticated access (or local loopback reachability when allowLoopback)
  let previewConfig = null
  try {
    previewConfig = resolveQaPreviewConfig(env, { allowLoopback })
  } catch (error) {
    setCheck('preview_sso_and_access', 'BLOCKED', {
      code: error instanceof TextCompleteGuardError ? error.code : 'PREVIEW_CFG_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  if (previewConfig) {
    if (previewConfig.authMode === 'local_loopback') {
      try {
        const localRes = await fetchImpl(`${previewConfig.baseUrl}/`, { method: 'GET', redirect: 'manual' })
        const ok = localRes.status >= 200 && localRes.status < 400
        setCheck('preview_sso_and_access', ok ? 'PASS' : 'BLOCKED', {
          host: previewConfig.host,
          authMode: 'local_loopback',
          httpStatus: localRes.status,
          reason: ok ? undefined : `App local devolvió HTTP ${localRes.status}`,
        })
      } catch (error) {
        setCheck('preview_sso_and_access', 'BLOCKED', {
          host: previewConfig.host,
          authMode: 'local_loopback',
          reason: `Error conectando a app local: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
        })
      }
    } else if (previewConfig.authMode === 'none') {
      setCheck('preview_sso_and_access', 'BLOCKED', {
        host: previewConfig.host,
        authMode: 'none',
        reason: 'Sin credenciales legítimas de Preview SSO (TC_PREVIEW_BYPASS_SECRET, TC_PREVIEW_STORAGE_STATE o TC_PREVIEW_SHARE_TOKEN)',
      })
    } else {
      try {
        const anonRes = await fetchImpl(`${previewConfig.baseUrl}/`, { method: 'HEAD', redirect: 'manual' })
        const anonLoc = anonRes.headers.get('location') || ''
        const ssoIntact = anonRes.status === 302 && /vercel\.com\/sso-api/i.test(anonLoc)

        if (previewConfig.authMode === 'playwright_storage_state') {
          setCheck('preview_sso_and_access', ssoIntact ? 'PASS' : 'BLOCKED', {
            host: previewConfig.host,
            authMode: previewConfig.authMode,
            ssoIntact,
            reason: ssoIntact ? undefined : `SSO check inesperado (HTTP ${anonRes.status})`,
          })
        } else {
          const authReq = buildQaPreviewRequest(previewConfig, '/')
          const authRes = await fetchImpl(authReq.url, {
            method: 'GET',
            headers: authReq.headers,
            redirect: 'manual',
          })
          const authLoc = authRes.headers.get('location') || ''
          const hitWall = authRes.status === 302 && /vercel\.com\/sso-api/i.test(authLoc)
          const ok = ssoIntact && !hitWall && authRes.status >= 200 && authRes.status < 400
          setCheck('preview_sso_and_access', ok ? 'PASS' : 'BLOCKED', {
            host: previewConfig.host,
            authMode: previewConfig.authMode,
            ssoIntact,
            authenticatedStatus: authRes.status,
            hitSsoWall: hitWall,
            reason: ok ? undefined : hitWall ? 'Auth Preview redirigió al muro SSO' : `HTTP ${authRes.status} (ssoIntact=${ssoIntact})`,
          })
        }
      } catch (error) {
        setCheck('preview_sso_and_access', 'BLOCKED', {
          host: previewConfig.host,
          reason: `Error consultando Preview: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
        })
      }
    }
  }

  // 6. Fixture prefix + runner modules
  try {
    const prefix = resolveTcFixturePrefix(env)
    const requiredFiles = [
      resolve(HERE, 'textCompleteGuard.mjs'),
      resolve(HERE, 'textCompletePreflight.mjs'),
      resolve(HERE, 'textCompleteSuite.mjs'),
      resolve(HERE, 'run-text-complete-qa.mjs'),
      resolve(HERE, 'textCompleteRollback.mjs'),
    ]
    const missing = requiredFiles.filter((f) => !existsSync(f))
    setCheck('harness_and_fixtures', missing.length === 0 ? 'PASS' : 'FAIL', {
      prefix,
      missing,
      reason: missing.length ? `Faltan módulos: ${missing.join(', ')}` : undefined,
    })
  } catch (error) {
    setCheck('harness_and_fixtures', 'FAIL', { reason: error instanceof Error ? error.message : String(error) })
  }

  // 7. Deployment SHA, branch, expected flags & rollback readiness (Vercel remote OR local env)
  let candidate = null
  try {
    candidate = resolveCandidate(env)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    setCheck('preview_sha_and_flags', 'BLOCKED', { reason })
    setCheck('rollback_ready', 'BLOCKED', { reason })
  }

  if (candidate && allowLoopback && isLocalQaMode(env)) {
    const r1On = env.AGENT_ORCHESTRATOR_R1 === '1'
    const r3On = env.AGENT_MEMORY_R3 === '1'
    const r2Qa = env.R2_EXECUTION_MODE === 'qa'
    const qaLocalOn = env.QA_LOCAL === '1'
    const allowlistHasRef =
      qaTarget != null &&
      String(env.R2_QA_PROJECT_REFS || env.TC_QA_PROJECT_REFS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .includes(qaTarget.ref)
    const r0Off = env.R0_ENABLED !== '1'
    const r4Off = env.R4_ENABLED !== '1'
    const reasons = []
    if (!r1On) reasons.push('AGENT_ORCHESTRATOR_R1 != 1')
    if (!r3On) reasons.push('AGENT_MEMORY_R3 != 1')
    if (!r2Qa) reasons.push('R2_EXECUTION_MODE != qa')
    if (!qaLocalOn) reasons.push('QA_LOCAL != 1')
    if (!allowlistHasRef) reasons.push('R2_QA_PROJECT_REFS no incluye ref local QA')
    if (!r0Off) reasons.push('R0_ENABLED debe permanecer OFF')
    if (!r4Off) reasons.push('R4_ENABLED debe permanecer OFF')
    setCheck('preview_sha_and_flags', reasons.length === 0 ? 'PASS' : 'BLOCKED', {
      mode: 'local_qa',
      expectedSha: candidate.expectedSha,
      expectedBranch: candidate.expectedBranch,
      flags: {
        AGENT_ORCHESTRATOR_R1: env.AGENT_ORCHESTRATOR_R1 ?? 'unset',
        AGENT_MEMORY_R3: env.AGENT_MEMORY_R3 ?? 'unset',
        R2_EXECUTION_MODE: env.R2_EXECUTION_MODE ?? 'unset',
        QA_LOCAL: env.QA_LOCAL ?? 'unset',
        COPILOT_R2_GATE: env.COPILOT_R2_GATE ?? 'unset',
        R0_ENABLED: env.R0_ENABLED ?? 'unset',
        R4_ENABLED: env.R4_ENABLED ?? 'unset',
      },
      reason: reasons.length ? reasons.join('; ') : undefined,
    })
    setCheck('rollback_ready', 'PASS', {
      mode: 'local_qa',
      dbRollbackScript: 'supabase/scripts/rollback_agent_apply_action_status.sql',
      scope: `local:${qaTarget?.ref ?? 'unknown'}`,
    })
  } else {
  const { token: vercelToken, source: tokenSource } = resolveVercelToken({
    ...env,
    VERCEL_TOKEN: env.TC_VERCEL_TOKEN || env.VERCEL_TOKEN,
  })
  if (vercelToken) secrets.push(vercelToken)

  if (candidate && !vercelToken) {
    setCheck('preview_sha_and_flags', 'BLOCKED', {
      expectedSha: candidate.expectedSha,
      expectedBranch: candidate.expectedBranch,
      reason: 'Sin VERCEL_TOKEN ni sesión Vercel CLI para inspeccionar SHA y flags',
    })
    setCheck('rollback_ready', 'BLOCKED', { tokenSource, reason: 'Sin token Vercel para rollback' })
  } else if (candidate && vercelToken) {
    const [flagRes, depRes] = await Promise.all([
      inspectTextCompleteFlags({
        token: vercelToken,
        projectId: candidate.projectId,
        teamSlug: candidate.teamId,
        gitBranch: candidate.expectedBranch,
        fetchImpl,
      }),
      previewConfig
        ? inspectPreviewDeployment({
            token: vercelToken,
            host: previewConfig.host,
            teamSlug: candidate.teamId,
            expectedProjectId: candidate.projectId,
            expectedSha: candidate.expectedSha,
            expectedBranch: candidate.expectedBranch,
            fetchImpl,
          })
        : Promise.resolve({ ok: false, mismatchReasons: ['Sin TC_PREVIEW_URL para verificar deployment real'] }),
    ])

    if (!flagRes.ok) {
      setCheck('preview_sha_and_flags', 'BLOCKED', { reason: `Vercel API rechazó consulta flags (${flagRes.error})` })
      setCheck('rollback_ready', 'BLOCKED', { tokenSource, reason: `Vercel API rechazó consulta (${flagRes.error})` })
    } else {
      const f = flagRes.flags
      const r1On = f.AGENT_ORCHESTRATOR_R1?.value === '1'
      const r3On = f.AGENT_MEMORY_R3?.value === '1'
      const r2Qa = f.R2_EXECUTION_MODE?.value === 'qa'
      const allowlistHasRef =
        qaTarget != null &&
        String(f.R2_QA_PROJECT_REFS?.value || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .includes(qaTarget.ref)
      const r0Off = f.R0_ENABLED?.value !== '1'
      const r4Off = f.R4_ENABLED?.value !== '1'

      const reasons = []
      if (!r1On) reasons.push(`AGENT_ORCHESTRATOR_R1=${f.AGENT_ORCHESTRATOR_R1?.value ?? 'unset'} (esperado 1)`)
      if (!r3On) reasons.push(`AGENT_MEMORY_R3=${f.AGENT_MEMORY_R3?.value ?? 'unset'} (esperado 1)`)
      if (!r2Qa) reasons.push(`R2_EXECUTION_MODE=${f.R2_EXECUTION_MODE?.value ?? 'unset'} (esperado qa)`)
      if (!allowlistHasRef) reasons.push('R2_QA_PROJECT_REFS no incluye el proyecto QA autorizado')
      if (!r0Off) reasons.push('R0_ENABLED debe permanecer OFF')
      if (!r4Off) reasons.push('R4_ENABLED debe permanecer OFF')
      if (!depRes.ok) reasons.push(...(depRes.mismatchReasons || ['Discrepancia de deployment']))

      const allOk = reasons.length === 0
      setCheck('preview_sha_and_flags', allOk ? 'PASS' : !depRes.ok ? 'FAIL' : 'BLOCKED', {
        expectedSha: candidate.expectedSha,
        expectedBranch: candidate.expectedBranch,
        deploymentId: depRes.deploymentId ?? null,
        deploymentSha: depRes.sha ?? null,
        deploymentBranch: depRes.branch ?? null,
        deploymentReadyState: depRes.readyState ?? null,
        flags: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value ?? 'unset'])),
        reason: reasons.length ? reasons.join('; ') : undefined,
      })

      setCheck('rollback_ready', 'PASS', {
        tokenSource,
        rollbackScript: 'scripts/qa/textCompleteRollback.mjs',
        dbRollbackScript: 'supabase/scripts/rollback_agent_apply_action_status.sql',
        scope: `preview:${candidate.expectedBranch}`,
      })
    }
  }
  }

  const hasFail = Object.values(checks).some((c) => c.critical && c.status === 'FAIL')
  const hasBlocked = Object.values(checks).some((c) => c.critical && c.status === 'BLOCKED')
  const status = hasFail ? 'FAIL' : hasBlocked ? 'BLOCKED' : 'READY'

  const report = redactQaSecrets(
    {
      operation: 'QA-TEXT-COMPLETE-PREFLIGHT',
      status,
      ranAt: new Date().toISOString(),
      writesPerformed: 0,
      blockers,
      checks,
    },
    secrets,
  )

  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, JSON.stringify(report, null, 2))
  }
  return report
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const env = loadQaEnvFile(process.env.TC_ENV_FILE, process.env)
    const reportPath = resolve('.qa/text-complete-preflight.json')
    const report = await runTextCompletePreflight({ env, allowLoopback: isLocalQaMode(env), reportPath })
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.status === 'READY' ? 0 : report.status === 'BLOCKED' ? 2 : 1)
  } catch (error) {
    const code = error instanceof TextCompleteGuardError ? error.code : 'PREFLIGHT_ERROR'
    console.error(JSON.stringify({ status: 'BLOCKED', code, error: error instanceof Error ? error.message : String(error) }))
    process.exit(2)
  }
}
