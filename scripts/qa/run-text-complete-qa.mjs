/* global process, console */
/**
 * Text Complete Integrated QA Runner (`npm run qa:text:run`).
 *
 * Enforces:
 * 1. Explicit execution authorization (`TC_QA_AUTH=AUTH-TEXT-COMPLETE-QA` + `--execute`).
 * 2. Read-only preflight MUST return READY (zero writes if BLOCKED/FAIL).
 * 3. Runs Bloque A (Executive MVP), Bloque B (R2 E1-E13), and Bloque C (Integrated 1-3)
 *    using real QA JWTs against the dedicated QA Supabase project + single Preview SHA.
 * 4. Generates compact JSON + Markdown report in `.qa/` with all secrets redacted.
 * 5. Never mutates Vercel flags or triggers deployments.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  TextCompleteGuardError,
  loadQaEnvFile,
  redactQaSecrets,
  requireTextCompleteAuth,
  resolveQaPreviewConfig,
  resolveQaSupabaseTarget,
  resolveTcFixturePrefix,
  resolveTextCompleteIdentities,
} from './textCompleteGuard.mjs'
import { runTextCompletePreflight } from './textCompletePreflight.mjs'
import { runTextCompleteSuite } from './textCompleteSuite.mjs'
import { runPlaywrightPreviewProbe } from './r3PlaywrightProbe.mjs'

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false } }

async function signInQa(target, idCfg) {
  const authClient = createClient(target.url, target.anonKey, CLIENT_OPTS)
  const { data, error } = await authClient.auth.signInWithPassword({
    email: idCfg.email,
    password: idCfg.password,
  })
  if (error || !data?.session?.access_token) {
    throw new Error(`Autenticación QA fallida (${idCfg.key}): ${error?.message || 'sin sesión'}`)
  }
  const accessToken = data.session.access_token
  const authed = createClient(target.url, target.anonKey, {
    ...CLIENT_OPTS,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data: usuario, error: uErr } = await authed
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
    client: authed,
  }
}

export function formatCompactMarkdownReport(report) {
  const lines = [
    `# Text Complete Integrated QA — ${report.verdict}`,
    `- Run: \`${report.runId}\` · Fecha: ${report.ranAt}`,
    `- Candidato: \`${report.expectedBranch}\` @ \`${report.expectedSha}\``,
    `- Supabase QA: \`${report.targetRef}\` · Preview: \`${report.previewHost}\``,
    `- Totales: PASS=${report.counts.pass} · FAIL=${report.counts.fail} · BLOCKED=${report.counts.blocked}`,
    `- Limpieza fixtures (\`${report.manifest?.prefix ?? ''}\`): residuales=${report.cleanup?.remainingTotal ?? 0}`,
    '',
    '| Bloque | ID | Escenario | Estado |',
    '|---|---|---|---|',
    ...report.results.map((r) => `| ${r.block} | ${r.id} | ${r.title} | **${r.status}** |`),
  ]
  return `${lines.join('\n')}\n`
}

export async function executeTextCompleteCli({
  env = process.env,
  argv = process.argv.slice(2),
  preflightFn = runTextCompletePreflight,
  suiteFn = runTextCompleteSuite,
  outDir = resolve('.qa'),
} = {}) {
  const auth = requireTextCompleteAuth(env, argv)

  const preflightPath = resolve(outDir, 'text-complete-preflight.json')
  const preflight = await preflightFn({ env, reportPath: preflightPath })
  if (preflight.status !== 'READY') {
    return {
      status: 'BLOCKED',
      verdict: 'BLOCKED',
      reason: 'Preflight no está READY; ejecución abortada con 0 escrituras',
      preflight,
    }
  }

  const target = resolveQaSupabaseTarget(env)
  const previewConfig = resolveQaPreviewConfig(env)
  const identities = resolveTextCompleteIdentities(env)
  const fixturePrefix = resolveTcFixturePrefix(env)
  const runId = Date.now().toString(36)
  const useBrowser = !argv.includes('--no-browser')

  const secrets = [
    target.anonKey,
    target.serviceRoleKey,
    identities.super_admin.password,
    identities.direccion.password,
    identities.lider.password,
    identities.operativo.password,
    identities.analista?.password,
    previewConfig.bypassSecret,
    previewConfig.shareToken,
    env.VERCEL_TOKEN,
    env.TC_VERCEL_TOKEN,
  ]

  const clients = {
    signInSuperAdmin: () => signInQa(target, identities.super_admin),
    signInDireccion: () => signInQa(target, identities.direccion),
    signInLider: () => signInQa(target, identities.lider),
    signInOperativo: () => signInQa(target, identities.operativo),
    signInAnalista: identities.analista ? () => signInQa(target, identities.analista) : null,
    admin: target.serviceRoleKey ? createClient(target.url, target.serviceRoleKey, CLIENT_OPTS) : null,
  }

  const suiteReport = await suiteFn({
    runId,
    fixturePrefix,
    target,
    previewConfig,
    clients,
    browserProbe: useBrowser ? runPlaywrightPreviewProbe : null,
    stopOnCritical: true,
  })

  mkdirSync(outDir, { recursive: true })
  const runPath = resolve(outDir, `text-complete-run-${runId}.json`)
  const latestPath = resolve(outDir, 'text-complete-qa-latest.json')
  const summaryPath = resolve(outDir, 'text-complete-qa-summary.md')

  const finalReport = redactQaSecrets(
    {
      operation: 'QA-TEXT-COMPLETE-INTEGRATED',
      authorization: auth.token,
      ranAt: new Date().toISOString(),
      targetRef: target.ref,
      previewHost: previewConfig.host,
      expectedSha: previewConfig.expectedSha,
      expectedBranch: previewConfig.expectedBranch,
      runnerMutatedFlags: false,
      runnerDeployed: false,
      preflightStatus: preflight.status,
      ...suiteReport,
      artifacts: { preflight: preflightPath, run: runPath, summary: summaryPath },
    },
    secrets,
  )

  writeFileSync(runPath, JSON.stringify(finalReport, null, 2))
  writeFileSync(latestPath, JSON.stringify(finalReport, null, 2))
  writeFileSync(summaryPath, formatCompactMarkdownReport(finalReport))

  return finalReport
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const env = loadQaEnvFile(process.env.TC_ENV_FILE, process.env)
    const report = await executeTextCompleteCli({ env, argv: process.argv.slice(2) })
    console.log(JSON.stringify(report, null, 2))
    const code = report.verdict === 'PASS' ? 0 : report.verdict === 'BLOCKED' ? 2 : 1
    process.exit(code)
  } catch (error) {
    const code = error instanceof TextCompleteGuardError ? error.code : 'TC_RUNNER_ERROR'
    console.error(JSON.stringify({ status: 'BLOCKED', code, error: error instanceof Error ? error.message : String(error) }))
    process.exit(2)
  }
}
