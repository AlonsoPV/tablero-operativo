/* global process, console */
/**
 * R3 Integrated Runner CLI (`npm run qa:r3:integrated`).
 *
 * Enforces:
 * 1. Explicit execution authorization (`R3_INTEGRATED_AUTH=AUTH-R3-INTEGRATED` + `--execute`).
 * 2. Automated read-only preflight MUST return READY (zero writes if BLOCKED).
 * 3. Executes R3-I0..R3-I7 against DEV + Preview with real QA identities & synthetic `r3-int-` fixtures.
 * 4. Records fixture manifest and cleans up ONLY tracked fixtures.
 * 5. Halts immediately on critical failure.
 * 6. NEVER modifies Vercel flags or triggers deployments.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  R3GuardError,
  loadProtectedEnvFile,
  redactSecrets,
  requireIntegratedExecutionAuth,
  resolveFixturePrefix,
  resolvePreviewConfig,
  resolveQaIdentities,
  resolveR3DevTarget,
} from './r3DevGuard.mjs'
import { runR3Preflight } from './r3-preflight.mjs'
import { runR3IntegratedSuite } from './r3IntegratedSuite.mjs'
import { runPlaywrightPreviewProbe } from './r3PlaywrightProbe.mjs'

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false } }

async function signInQaIdentity(target, idCfg) {
  const authClient = createClient(target.url, target.anonKey, CLIENT_OPTS)
  const { data, error } = await authClient.auth.signInWithPassword({
    email: idCfg.email,
    password: idCfg.password,
  })
  if (error || !data?.session?.access_token) {
    throw new Error(`Autenticación QA fallida (${idCfg.key}): ${error?.message || 'sin sesión'}`)
  }
  const accessToken = data.session.access_token
  const authedClient = createClient(target.url, target.anonKey, {
    ...CLIENT_OPTS,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data: usuario, error: uErr } = await authedClient
    .from('usuarios')
    .select('id,rol')
    .eq('user_id', data.user.id)
    .maybeSingle()
  if (uErr || !usuario?.id) {
    throw new Error(`Perfil usuarios faltante (${idCfg.key}): ${uErr?.message || 'missing'}`)
  }
  return {
    key: idCfg.key,
    accessToken,
    userId: data.user.id,
    usuarioId: usuario.id,
    rol: usuario.rol ?? null,
    rawSession: data.session,
    client: authedClient,
  }
}

export async function executeR3IntegratedCli({
  env = process.env,
  argv = process.argv.slice(2),
  preflightFn = runR3Preflight,
  suiteFn = runR3IntegratedSuite,
  outDir = resolve('.qa'),
} = {}) {
  // 1. Explicit execution authorization required BEFORE anything else
  const auth = requireIntegratedExecutionAuth(env, argv)

  // 2. Preflight MUST return READY
  const preflightPath = resolve(outDir, 'r3-integrated-preflight.json')
  const preflight = await preflightFn({ env, reportPath: preflightPath })
  if (preflight.status !== 'READY') {
    return {
      status: 'BLOCKED',
      reason: 'Preflight no está READY; ejecución abortada sin escrituras',
      preflight,
    }
  }

  const target = resolveR3DevTarget(env)
  const previewConfig = resolvePreviewConfig(env)
  const depMeta = preflight.checks?.flags_and_deployment_expected || {}
  if (depMeta.deploymentSha && depMeta.deploymentSha !== previewConfig.expectedSha) {
    throw new R3GuardError(
      'DEPLOYMENT_SHA_MISMATCH',
      `SHA desplegado (${depMeta.deploymentSha}) no coincide con R3_EXPECTED_SHA (${previewConfig.expectedSha})`,
    )
  }
  if (depMeta.deploymentBranch && depMeta.deploymentBranch !== previewConfig.expectedBranch) {
    throw new R3GuardError(
      'DEPLOYMENT_BRANCH_MISMATCH',
      `Rama desplegada (${depMeta.deploymentBranch}) no coincide con R3_EXPECTED_BRANCH (${previewConfig.expectedBranch})`,
    )
  }
  const identities = resolveQaIdentities(env)
  const fixturePrefix = resolveFixturePrefix(env)
  const windowMode = String(env.R3_EXPECTED_WINDOW || 'ON').toUpperCase() === 'OFF' ? 'OFF' : 'ON'
  const runId = Date.now().toString(36)
  const useBrowser = !argv.includes('--no-browser')

  const secretsToRedact = [
    target.anonKey,
    target.serviceRoleKey,
    identities.direccion.password,
    identities.lider.password,
    previewConfig.bypassSecret,
    previewConfig.shareToken,
    env.VERCEL_TOKEN,
    env.R3_VERCEL_TOKEN,
  ]

  const clients = {
    anon: createClient(target.url, target.anonKey, CLIENT_OPTS),
    signInDireccion: () => signInQaIdentity(target, identities.direccion),
    signInLider: () => signInQaIdentity(target, identities.lider),
    admin: target.serviceRoleKey ? createClient(target.url, target.serviceRoleKey, CLIENT_OPTS) : null,
  }

  const suiteReport = await suiteFn({
    windowMode,
    runId,
    fixturePrefix,
    target,
    previewConfig,
    clients,
    browserProbe: useBrowser ? runPlaywrightPreviewProbe : null,
    stopOnCritical: true,
    env,
  })

  mkdirSync(outDir, { recursive: true })
  const fixturesPath = resolve(outDir, `r3-integrated-fixtures-${runId}.json`)
  const runPath = resolve(outDir, `r3-integrated-run-${runId}.json`)
  const latestPath = resolve(outDir, 'r3-integrated-latest.json')

  const finalReport = redactSecrets(
    {
      operation: 'QA-R3-INTEGRATED',
      authorization: auth.token,
      ranAt: new Date().toISOString(),
      targetRef: target.ref,
      previewHost: previewConfig.host,
      projectId: previewConfig.projectId,
      teamId: previewConfig.teamId,
      target: previewConfig.target,
      expectedSha: previewConfig.expectedSha,
      expectedBranch: previewConfig.expectedBranch,
      deploymentId: depMeta.deploymentId ?? null,
      deploymentSha: depMeta.deploymentSha ?? null,
      deploymentBranch: depMeta.deploymentBranch ?? null,
      runnerMutatedFlags: false,
      runnerDeployed: false,
      preflightStatus: preflight.status,
      ...suiteReport,
      artifacts: {
        preflight: preflightPath,
        fixtures: fixturesPath,
        run: runPath,
      },
    },
    secretsToRedact,
  )

  writeFileSync(fixturesPath, JSON.stringify(redactSecrets({ runId, createdFixtures: suiteReport.createdFixtures, cleanup: suiteReport.cleanup }, secretsToRedact), null, 2))
  writeFileSync(runPath, JSON.stringify(finalReport, null, 2))
  writeFileSync(latestPath, JSON.stringify(finalReport, null, 2))

  return finalReport
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const env = loadProtectedEnvFile(process.env.R3_ENV_FILE, process.env)
    const report = await executeR3IntegratedCli({ env, argv: process.argv.slice(2) })
    console.log(JSON.stringify(report, null, 2))
    const code = report.verdict === 'PASS' ? 0 : report.status === 'BLOCKED' || report.verdict === 'BLOCKED' ? 2 : 1
    process.exit(code)
  } catch (error) {
    const code = error instanceof R3GuardError ? error.code : 'INTEGRATED_RUNNER_ERROR'
    console.error(JSON.stringify({ status: 'BLOCKED', code, error: error instanceof Error ? error.message : String(error) }))
    process.exit(2)
  }
}
