/* global process, console, fetch */
/**
 * Automated R3 Integrated Preflight (`npm run qa:r3:preflight`).
 *
 * Strictly READ-ONLY: zero database writes, zero env mutations, zero deployments.
 * Returns status READY (exit 0) ONLY if all critical checks PASS; otherwise BLOCKED (exit 2).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_CANDIDATE_SHA,
  DEFAULT_DEV_REF,
  DEFAULT_PREVIEW_BRANCH,
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  R3GuardError,
  assertNoProductionConfig,
  buildPreviewRequest,
  loadProtectedEnvFile,
  redactSecrets,
  resolveFixturePrefix,
  resolvePreviewConfig,
  resolveQaIdentities,
  resolveR3DevTarget,
} from './r3DevGuard.mjs'
import { inspectPreviewBranchFlags, resolveVercelToken } from './r3-rollback-off.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

function defaultCreateSupabaseClient(url, key, extraHeaders = {}) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: Object.keys(extraHeaders).length ? { headers: extraHeaders } : undefined,
  })
}

/**
 * Execute full read-only R3 preflight. Injectable for deterministic Vitest testing.
 */
export async function runR3Preflight({
  env = process.env,
  fetchImpl = fetch,
  createSupabaseClient = defaultCreateSupabaseClient,
  allowLoopback = false,
  reportPath = null,
} = {}) {
  const checks = {}
  const blockers = []
  const secretsToRedact = [
    env.R3_DEV_SUPABASE_ANON_KEY,
    env.R3_DEV_SUPABASE_SERVICE_ROLE_KEY,
    env.R3_QA_DIRECCION_PASSWORD,
    env.R3_QA_LIDER_PASSWORD,
    env.R3_PREVIEW_BYPASS_SECRET,
    env.R3_PREVIEW_SHARE_TOKEN,
    env.VERCEL_TOKEN,
    env.R3_VERCEL_TOKEN,
  ]

  const setCheck = (key, status, detail = {}, critical = true) => {
    checks[key] = { status, critical, ...detail }
    if (critical && status !== 'PASS') {
      blockers.push(`${key}: ${detail.reason || status}`)
    }
  }

  // 1. Ausencia de configuración Production
  try {
    assertNoProductionConfig(env)
    setCheck('no_production_config', 'PASS', { prodRefsBlocked: true, r2Safe: true })
  } catch (error) {
    setCheck('no_production_config', 'FAIL', {
      code: error instanceof R3GuardError ? error.code : 'PROD_CHECK_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  // 2. Proyecto Supabase permitido (allowlist explícita + bloqueo PROD)
  let devTarget = null
  try {
    devTarget = resolveR3DevTarget(env, { allowLoopback })
    setCheck('supabase_project_allowed', 'PASS', {
      ref: devTarget.ref,
      expectedDevRef: DEFAULT_DEV_REF,
      matchesDefaultDev: devTarget.ref === DEFAULT_DEV_REF,
      allowlist: devTarget.allowedRefs,
      hasServiceRoleForCleanup: devTarget.hasServiceRole,
    })
  } catch (error) {
    setCheck('supabase_project_allowed', 'BLOCKED', {
      code: error instanceof R3GuardError ? error.code : 'DEV_TARGET_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  // 3. Disponibilidad de acceso DEV (read-only auth health)
  if (!devTarget) {
    setCheck('dev_access_available', 'BLOCKED', { reason: 'Sin destino Supabase DEV válido' })
  } else {
    try {
      const healthRes = await fetchImpl(`${devTarget.url}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: devTarget.anonKey },
      })
      const ok = healthRes.status === 200
      setCheck('dev_access_available', ok ? 'PASS' : 'BLOCKED', {
        httpStatus: healthRes.status,
        reason: ok ? undefined : `Auth health devolvió HTTP ${healthRes.status}`,
      })
    } catch (error) {
      setCheck('dev_access_available', 'BLOCKED', {
        reason: `Error conectando a Supabase DEV: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
      })
    }
  }

  // 4. Identidades QA válidas (autenticación legítima Dirección y Líder)
  let qaIdentities = null
  try {
    qaIdentities = resolveQaIdentities(env)
  } catch (error) {
    setCheck('qa_identities_valid', 'BLOCKED', {
      code: error instanceof R3GuardError ? error.code : 'QA_ID_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  if (qaIdentities && devTarget && checks.dev_access_available?.status === 'PASS') {
    try {
      const signInAndResolve = async (idCfg) => {
        const authClient = createSupabaseClient(devTarget.url, devTarget.anonKey)
        const { data, error } = await authClient.auth.signInWithPassword({
          email: idCfg.email,
          password: idCfg.password,
        })
        if (error || !data?.session?.access_token) {
          throw new Error(`signIn ${idCfg.key}: ${error?.message || 'sin sesión'}`)
        }
        secretsToRedact.push(data.session.access_token)
        const authed = createSupabaseClient(devTarget.url, devTarget.anonKey, {
          Authorization: `Bearer ${data.session.access_token}`,
        })
        const uRes = await authed.from('usuarios').select('id,rol,activo').eq('user_id', data.user.id).maybeSingle()
        if (uRes.error || !uRes.data?.id) {
          throw new Error(`usuarios ${idCfg.key}: ${uRes.error?.message || 'sin perfil'}`)
        }
        // Read-only verify R3 tables exist and are queryable under RLS
        const memProbe = await authed.from('agent_memory').select('id', { count: 'exact', head: true })
        if (memProbe.error) {
          throw new Error(`agent_memory probe ${idCfg.key}: ${memProbe.error.message}`)
        }
        return { usuarioId: uRes.data.id, rol: uRes.data.rol ?? null, activo: uRes.data.activo ?? null }
      }

      const dir = await signInAndResolve(qaIdentities.direccion)
      const lider = await signInAndResolve(qaIdentities.lider)
      const distinct = dir.usuarioId !== lider.usuarioId
      const bothActive = dir.activo !== false && lider.activo !== false
      const ok = distinct && bothActive

      setCheck('qa_identities_valid', ok ? 'PASS' : 'FAIL', {
        distinctUsuarioIds: distinct,
        direccionRol: dir.rol,
        liderRol: lider.rol,
        r3TablesAccessible: true,
        reason: ok ? undefined : 'Identidades QA duplicadas o inactivas',
      })
    } catch (error) {
      setCheck('qa_identities_valid', 'BLOCKED', {
        reason: error instanceof Error ? error.message.slice(0, 200) : String(error),
      })
    }
  } else if (qaIdentities && !checks.qa_identities_valid) {
    setCheck('qa_identities_valid', 'BLOCKED', {
      reason: 'Credenciales QA presentes pero sin conectividad DEV para verificarlas',
    })
  }

  // 5. Acceso autenticado a Preview (sin desactivar SSO)
  let previewConfig = null
  try {
    previewConfig = resolvePreviewConfig(env, { allowLoopback })
  } catch (error) {
    setCheck('preview_authenticated_access', 'BLOCKED', {
      code: error instanceof R3GuardError ? error.code : 'PREVIEW_CFG_ERROR',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  if (previewConfig) {
    if (previewConfig.authMode === 'none') {
      setCheck('preview_authenticated_access', 'BLOCKED', {
        host: previewConfig.host,
        authMode: 'none',
        reason:
          'Sin mecanismo de auth Preview SSO (configura R3_PREVIEW_BYPASS_SECRET, R3_PREVIEW_STORAGE_STATE o R3_PREVIEW_SHARE_TOKEN)',
      })
    } else {
      try {
        // Verify unauthenticated request STILL hits SSO wall (SSO intact)
        const anonRes = await fetchImpl(`${previewConfig.baseUrl}/`, { method: 'HEAD', redirect: 'manual' })
        const anonLoc = anonRes.headers.get('location') || ''
        const ssoIntact = anonRes.status === 302 && /vercel\.com\/sso-api/i.test(anonLoc)

        if (previewConfig.authMode === 'playwright_storage_state') {
          setCheck('preview_authenticated_access', ssoIntact ? 'PASS' : 'BLOCKED', {
            host: previewConfig.host,
            authMode: previewConfig.authMode,
            ssoIntact,
            storageStateExists: true,
            reason: ssoIntact ? undefined : `SSO check inesperado (HTTP ${anonRes.status})`,
          })
        } else {
          const authReq = buildPreviewRequest(previewConfig, '/')
          const authRes = await fetchImpl(authReq.url, {
            method: 'GET',
            headers: authReq.headers,
            redirect: 'manual',
          })
          const authLoc = authRes.headers.get('location') || ''
          const hitWall = authRes.status === 302 && /vercel\.com\/sso-api/i.test(authLoc)
          const ok = ssoIntact && !hitWall && authRes.status >= 200 && authRes.status < 400
          setCheck('preview_authenticated_access', ok ? 'PASS' : 'BLOCKED', {
            host: previewConfig.host,
            authMode: previewConfig.authMode,
            ssoIntact,
            authenticatedStatus: authRes.status,
            hitSsoWall: hitWall,
            reason: ok ? undefined : hitWall ? 'Auth Preview redirigió al muro SSO' : `HTTP ${authRes.status} (ssoIntact=${ssoIntact})`,
          })
        }
      } catch (error) {
        setCheck('preview_authenticated_access', 'BLOCKED', {
          host: previewConfig.host,
          reason: `Error consultando Preview: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
        })
      }
    }
  }

  // 6. Runner funcional (archivos y módulos requeridos presentes)
  const requiredFiles = [
    resolve(HERE, 'r3DevGuard.mjs'),
    resolve(HERE, 'r3IntegratedSuite.mjs'),
    resolve(HERE, 'r3PlaywrightProbe.mjs'),
    resolve(HERE, 'run-r3-integrated.mjs'),
    resolve(HERE, 'r3-rollback-off.mjs'),
  ]
  const missingFiles = requiredFiles.filter((f) => !existsSync(f))
  setCheck('runner_functional', missingFiles.length === 0 ? 'PASS' : 'FAIL', {
    filesChecked: requiredFiles.length,
    missingFiles,
    reason: missingFiles.length ? `Faltan módulos: ${missingFiles.join(', ')}` : undefined,
  })

  // 7. Fixtures identificables (`r3-int-`)
  try {
    const prefix = resolveFixturePrefix(env)
    setCheck('fixtures_identifiable', 'PASS', { prefix })
  } catch (error) {
    setCheck('fixtures_identifiable', 'FAIL', {
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  // 8. Rollback OFF disponible + 9. Flags y deployment esperados (Vercel read-only)
  const { token: vercelToken, source: tokenSource } = resolveVercelToken(env)
  if (vercelToken) secretsToRedact.push(vercelToken)

  if (!vercelToken) {
    setCheck('rollback_off_available', 'BLOCKED', {
      tokenSource,
      reason: 'Sin VERCEL_TOKEN ni sesión Vercel CLI para verificar/ejecutar rollback OFF',
    })
    setCheck('flags_and_deployment_expected', 'BLOCKED', {
      expectedSha: previewConfig?.expectedSha || DEFAULT_CANDIDATE_SHA,
      expectedBranch: previewConfig?.expectedBranch || DEFAULT_PREVIEW_BRANCH,
      reason: 'Sin acceso read-only a Vercel API para verificar flags gitBranch=preview',
    })
  } else {
    const inspected = await inspectPreviewBranchFlags({
      token: vercelToken,
      projectId: env.R3_VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID,
      teamSlug: env.R3_VERCEL_TEAM_ID || DEFAULT_TEAM_ID,
      gitBranch: previewConfig?.expectedBranch || DEFAULT_PREVIEW_BRANCH,
      fetchImpl,
    })

    if (!inspected.ok) {
      setCheck('rollback_off_available', 'BLOCKED', {
        tokenSource,
        httpStatus: inspected.status,
        reason: `Vercel API rechazó consulta read-only (${inspected.error})`,
      })
      setCheck('flags_and_deployment_expected', 'BLOCKED', {
        reason: `No se pudieron inspeccionar flags (${inspected.error})`,
      })
    } else {
      setCheck('rollback_off_available', 'PASS', {
        tokenSource,
        rollbackScript: 'scripts/qa/r3-rollback-off.mjs',
        scope: `gitBranch=${previewConfig?.expectedBranch || DEFAULT_PREVIEW_BRANCH}`,
      })

      const expectedWindow = String(env.R3_EXPECTED_WINDOW || 'ON').toUpperCase()
      const r1On = Boolean(inspected.flags.AGENT_ORCHESTRATOR_R1?.isOn)
      const r3On = Boolean(inspected.flags.AGENT_MEMORY_R3?.isOn)
      const matchesExpected = expectedWindow === 'ON' ? r1On && r3On : !r1On && !r3On

      setCheck('flags_and_deployment_expected', matchesExpected ? 'PASS' : 'BLOCKED', {
        expectedWindow,
        expectedSha: previewConfig?.expectedSha || DEFAULT_CANDIDATE_SHA,
        AGENT_ORCHESTRATOR_R1: inspected.flags.AGENT_ORCHESTRATOR_R1?.value ?? 'unset',
        AGENT_MEMORY_R3: inspected.flags.AGENT_MEMORY_R3?.value ?? 'unset',
        reason: matchesExpected
          ? undefined
          : `Flags actuales (R1=${inspected.flags.AGENT_ORCHESTRATOR_R1?.value ?? 'unset'}, R3=${inspected.flags.AGENT_MEMORY_R3?.value ?? 'unset'}) no coinciden con ventana esperada ${expectedWindow}`,
      })
    }
  }

  const hasFail = Object.values(checks).some((c) => c.critical && c.status === 'FAIL')
  const hasBlocked = Object.values(checks).some((c) => c.critical && c.status === 'BLOCKED')
  const status = hasFail ? 'FAIL' : hasBlocked ? 'BLOCKED' : 'READY'

  const report = redactSecrets(
    {
      operation: 'QA-R3-PREFLIGHT',
      status,
      ranAt: new Date().toISOString(),
      writesPerformed: 0,
      blockers,
      checks,
    },
    secretsToRedact,
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
    const env = loadProtectedEnvFile(process.env.R3_ENV_FILE, process.env)
    const reportPath = resolve('.qa/r3-integrated-preflight.json')
    const report = await runR3Preflight({ env, reportPath })
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.status === 'READY' ? 0 : report.status === 'BLOCKED' ? 2 : 1)
  } catch (error) {
    const code = error instanceof R3GuardError ? error.code : 'PREFLIGHT_ERROR'
    console.error(JSON.stringify({ status: 'BLOCKED', code, error: error instanceof Error ? error.message : String(error) }))
    process.exit(2)
  }
}
