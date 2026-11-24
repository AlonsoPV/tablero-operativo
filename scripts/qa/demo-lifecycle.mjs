#!/usr/bin/env node
/**
 * SCRUMBAN — Ciclo de Vida Seguro para Demostración Comercial Local ($0 USD).
 *
 * Comandos:
 *   npm run demo:start  -> valida entorno local, siembra datos sintéticos, abre compuerta R2 sólo
 *                          para `project_ref = qalocaltc20260000001`, verifica estado y levanta Vite.
 *   npm run demo:reset  -> cierra compuerta, limpia residuales y resiembra dataset comercial sintético.
 *   npm run demo:stop   -> detiene Vite, cierra compuerta R2 específica, limpia operaciones de demo
 *                          y verifica 0 residuales + agent_execution_allowed() = false.
 *
 * Restricciones fail-closed:
 * - Bloquea DEV (`tgiuevzlyptzlfgxsfhj`), PROD (`xhpasmjzuwifmjhrsumb`), TOOL SCRUMBAN (`bcmeiyboqvpksjxfavfl`)
 *   y cualquier host distinto de `127.0.0.1` / `localhost`.
 * - Nunca habilita indiscriminadamente todas las filas de `agent_execution_gate`.
 * - Recuperación automática ante SIGINT/SIGTERM o salida inesperada.
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const EXPECTED_CONTAINER = 'supabase_db_scrumban-tc-local'
const EXPECTED_PROJECT_REF = 'qalocaltc20260000001'
const EXPECTED_SUPABASE_URL = 'http://127.0.0.1:57421'
const DEMO_PORT = 5179
const DEMO_URL = `http://127.0.0.1:${DEMO_PORT}`
const FORBIDDEN_REFS = ['tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb', 'bcmeiyboqvpksjxfavfl']
const STATE_FILE = path.resolve('.qa/demo-lifecycle-state.json')
const SEED_SQL = path.resolve('supabase/scripts/qa/seed_commercial_demo_local.sql')
const RESET_SQL = path.resolve('supabase/scripts/qa/reset_commercial_demo_local.sql')
const ENV_FILE = path.resolve('.env.tclocal')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function assertStrictlyLocalIdentity(envMap) {
  const url = (envMap.VITE_SUPABASE_URL || envMap.SUPABASE_URL || EXPECTED_SUPABASE_URL).trim()
  const ref = (envMap.QA_LOCAL_REF || envMap.TC_QA_LOCAL_REF || '').trim()

  for (const forbidden of FORBIDDEN_REFS) {
    if (url.includes(forbidden) || ref.includes(forbidden)) {
      throw new Error(`BLOQUEADO FAIL-CLOSED: destino prohibido detectado (${forbidden}).`)
    }
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`BLOQUEADO FAIL-CLOSED: URL Supabase inválida (${url}).`)
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error(`BLOQUEADO FAIL-CLOSED: host no local (${parsed.hostname}). Sólo 127.0.0.1 permitido.`)
  }
  if (ref && ref !== EXPECTED_PROJECT_REF) {
    throw new Error(`BLOQUEADO FAIL-CLOSED: ref local inesperada (${ref} != ${EXPECTED_PROJECT_REF}).`)
  }

  // Verificar que el contenedor local exacto exista y esté en ejecución
  const running = execFileSync(
    'docker',
    ['ps', '--filter', `name=^/${EXPECTED_CONTAINER}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' }
  ).trim()
  if (running !== EXPECTED_CONTAINER) {
    throw new Error(
      `Servicio requerido no disponible: contenedor ${EXPECTED_CONTAINER} no está activo.`
    )
  }

  return { url, ref: EXPECTED_PROJECT_REF }
}

async function assertServicesHealthy(supabaseUrl) {
  const res = await fetch(`${supabaseUrl}/auth/v1/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
  if (!res || !res.ok) {
    throw new Error(`Supabase Local Auth no responde en ${supabaseUrl}/auth/v1/health.`)
  }
}

function runPsql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', EXPECTED_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-U', 'postgres', '-d', 'postgres'],
    { input: sql, encoding: 'utf8' }
  ).trim()
}

function runPsqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8')
  return runPsql(sql)
}

function setLocalQaGate(enabled) {
  // Verificar que jamás exista una fila de otro proyecto (fail-closed)
  const foreignRows = runPsql(`
    SELECT count(*) FROM public.agent_execution_gate
    WHERE project_ref <> '${EXPECTED_PROJECT_REF}';
  `)
  if (Number(foreignRows) > 0) {
    throw new Error('BLOQUEADO FAIL-CLOSED: agent_execution_gate contiene un project_ref distinto al local QA.')
  }

  // Nunca habilitar/actualizar indiscriminadamente todas las filas: acotado a id = true AND project_ref exacto
  if (enabled) {
    runPsql(`
      INSERT INTO public.agent_execution_gate (id, enabled, project_ref)
      VALUES (true, true, '${EXPECTED_PROJECT_REF}')
      ON CONFLICT (id) DO UPDATE
        SET enabled = true
        WHERE public.agent_execution_gate.project_ref = '${EXPECTED_PROJECT_REF}';
    `)
  } else {
    runPsql(`
      UPDATE public.agent_execution_gate
      SET enabled = false
      WHERE id = true AND project_ref = '${EXPECTED_PROJECT_REF}';
    `)
  }

  const check = runPsql(`
    SELECT COALESCE(
      (SELECT enabled::text || '|' || project_ref FROM public.agent_execution_gate WHERE id = true AND project_ref = '${EXPECTED_PROJECT_REF}'),
      'false|absent'
    ) || '|' || public.agent_execution_allowed()::text;
  `)
  const [rowEnabled, rowRef, allowed] = check.split('|')
  if (enabled && (rowRef !== EXPECTED_PROJECT_REF || rowEnabled !== 'true' || allowed !== 'true')) {
    throw new Error(`La compuerta R2 local no quedó activa (${check}).`)
  }
  if (!enabled && (rowEnabled !== 'false' || allowed !== 'false')) {
    throw new Error(`La compuerta R2 local no quedó cerrada (${check}).`)
  }
  return {
    enabled: rowEnabled === 'true',
    projectRef: rowRef === 'absent' ? EXPECTED_PROJECT_REF : rowRef,
    executionAllowed: allowed === 'true',
  }
}

function cleanOperationalDemoArtifacts() {
  runPsql(`
    DELETE FROM public.assistant_pending_ops;
    DELETE FROM public.qa_outbox;
    DELETE FROM public.notification_email_logs;
    DELETE FROM public.whatsapp_messages;
    DELETE FROM public.acciones_diarias
    WHERE titulo_accion ILIKE '%revisar este problema%'
       OR titulo_accion ILIKE '%demo-rehearsal%'
       OR titulo_accion LIKE 'tc-qa-%';
  `)
}

function stopRunningDemoVite() {
  let stoppedPid = null
  if (fs.existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
      if (state.pid) {
        try {
          process.kill(Number(state.pid), 'SIGTERM')
          stoppedPid = Number(state.pid)
        } catch {
          // El proceso ya no existía.
        }
      }
    } catch {
      // Estado corrupto: continuar con limpieza segura.
    }
    try {
      fs.unlinkSync(STATE_FILE)
    } catch {
      // ignore
    }
  }
  // En Windows, asegurar liberación del puerto 5179 si quedó un Vite huérfano tras crash
  if (process.platform === 'win32') {
    try {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${DEMO_PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: 'ignore' }
      )
    } catch {
      // ignore
    }
  }
  return stoppedPid
}

function readBoardSummary() {
  const row = runPsql(`
    SELECT
      (SELECT count(*) FROM public.acciones_diarias)::text || '|' ||
      (SELECT count(*) FROM public.okrs)::text || '|' ||
      (SELECT count(*) FROM public.agent_documents)::text || '|' ||
      (SELECT count(*) FROM public.agent_memory)::text || '|' ||
      (SELECT count(*) FROM public.assistant_pending_ops)::text || '|' ||
      public.agent_execution_allowed()::text;
  `)
  const [actions, okrs, docs, memories, pendingOps, executionAllowed] = row.split('|')
  return {
    actions: Number(actions),
    okrs: Number(okrs),
    docs: Number(docs),
    memories: Number(memories),
    pendingOps: Number(pendingOps),
    executionAllowed: executionAllowed === 'true',
  }
}

async function cmdStop(reason = 'manual_stop') {
  const envMap = parseEnvFile(ENV_FILE)
  assertStrictlyLocalIdentity(envMap)
  const stoppedPid = stopRunningDemoVite()
  cleanOperationalDemoArtifacts()
  const gate = setLocalQaGate(false)
  const summary = readBoardSummary()
  console.log(
    JSON.stringify(
      {
        command: 'demo:stop',
        reason,
        stoppedPid,
        gate,
        summary,
        externalPaidCalls: 0,
      },
      null,
      2
    )
  )
}

async function cmdReset() {
  const envMap = parseEnvFile(ENV_FILE)
  const local = assertStrictlyLocalIdentity(envMap)
  await assertServicesHealthy(local.url)
  const wasActive = fs.existsSync(STATE_FILE)
  setLocalQaGate(false)
  runPsqlFile(RESET_SQL)
  runPsqlFile(SEED_SQL)
  const gate = setLocalQaGate(wasActive)
  const summary = readBoardSummary()
  console.log(
    JSON.stringify(
      {
        command: 'demo:reset',
        projectRef: local.ref,
        gate,
        summary,
        externalPaidCalls: 0,
      },
      null,
      2
    )
  )
}

async function waitForHttpReady(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) }).catch(() => null)
    if (res && res.ok) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

async function cmdStart() {
  const checkOnly = process.argv.includes('--check-only')
  const envMap = parseEnvFile(ENV_FILE)
  const local = assertStrictlyLocalIdentity(envMap)
  await assertServicesHealthy(local.url)

  // Recuperación segura si una ejecución previa terminó inesperadamente
  if (fs.existsSync(STATE_FILE)) {
    stopRunningDemoVite()
    cleanOperationalDemoArtifacts()
    setLocalQaGate(false)
  }

  // Sembrar exclusivamente dataset sintético limpio y abrir compuerta acotada a local QA
  runPsqlFile(RESET_SQL)
  runPsqlFile(SEED_SQL)
  const gate = setLocalQaGate(true)

  const viteArgs = [
    '--use-system-ca',
    './node_modules/vite/bin/vite.js',
    '--mode',
    'tclocal',
    '--host',
    '127.0.0.1',
    '--port',
    String(DEMO_PORT),
    '--strictPort',
  ]

  const child = spawn(process.execPath, viteArgs, {
    stdio: checkOnly ? 'ignore' : 'inherit',
    env: {
      ...process.env,
      AGENT_ORCHESTRATOR_R1: '1',
      AGENT_MEMORY_R3: '1',
      R2_EXECUTION_MODE: 'qa',
      COPILOT_R2_GATE: '1',
      AI_ZERO_COST_ONLY: '1',
      WHATSAPP_DISPATCHER_ENABLED: '0',
      VOICE_TTS_LIVE: '0',
      VOICE_STT_LIVE: '0',
    },
  })

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ pid: child.pid, url: DEMO_URL, projectRef: local.ref, startedAt: new Date().toISOString() }, null, 2)
  )

  let cleaned = false
  const safeShutdown = (reason) => {
    if (cleaned) return
    cleaned = true
    try {
      if (!child.killed) child.kill('SIGTERM')
    } catch {
      // ignore
    }
    try {
      stopRunningDemoVite()
      cleanOperationalDemoArtifacts()
      setLocalQaGate(false)
    } catch (err) {
      console.error('Error en limpieza de salida:', err instanceof Error ? err.message : String(err))
    }
    if (!checkOnly) {
      console.log(`\n[demo:start] Cierre seguro completado (${reason}): compuerta R2 deshabilitada y operaciones limpias.`)
    }
  }

  process.on('SIGINT', () => {
    safeShutdown('SIGINT')
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    safeShutdown('SIGTERM')
    process.exit(0)
  })
  process.on('uncaughtException', (err) => {
    console.error('[demo:start] Error inesperado:', err)
    safeShutdown('uncaughtException')
    process.exit(1)
  })

  const ready = await waitForHttpReady(DEMO_URL)
  if (!ready) {
    safeShutdown('vite_timeout')
    throw new Error(`Vite no respondió en ${DEMO_URL} dentro del tiempo límite.`)
  }

  const summary = readBoardSummary()
  console.log(
    JSON.stringify(
      {
        command: 'demo:start',
        status: 'READY',
        url: DEMO_URL,
        projectRef: local.ref,
        gate,
        summary,
        profiles: {
          executiveRead: 'qa-direccion@tc-local.test (Diagnóstico, prioridades, riesgos, recomendaciones — permisos reales sin elevar)',
          operationalWrite: 'qa-lider@tc-local.test (Creación/aprobación de compromisos R2 y seguimiento de equipo)',
        },
        zeroCostEnforced: true,
        stopHint: 'Pulsa Ctrl+C o ejecuta `npm run demo:stop` para cerrar compuerta y limpiar.',
      },
      null,
      2
    )
  )

  if (checkOnly) {
    safeShutdown('check_only_complete')
    return
  }

  await new Promise((resolve) => {
    child.on('exit', () => {
      safeShutdown('vite_exit')
      resolve()
    })
  })
}

const action = process.argv[2] || 'start'
;(async () => {
  if (action === 'start') return cmdStart()
  if (action === 'reset') return cmdReset()
  if (action === 'stop') return cmdStop()
  throw new Error(`Subcomando desconocido: ${action}. Usa start | reset | stop.`)
})().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
