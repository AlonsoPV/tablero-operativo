/**
 * Harness de latencia voz (matriz A–N) contra preview/host.
 * Imprime ms por herramienta y p50/p95 offline. No publica Retell.
 *
 * Uso:
 *   node scripts/e2e-guia-voice-latency.mjs
 *   GUIDE_E2E_HOST=https://... GUIDE_E2E_ROUNDS=3 node scripts/e2e-guia-voice-latency.mjs
 */
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadDotenv } from './_load-dotenv.mjs'

loadDotenv(import.meta.url)

const key = process.env.RETELL_API_KEY
const secret = process.env.GUIDE_RETELL_TOOL_SECRET
const host =
  process.env.GUIDE_E2E_HOST ||
  'https://tablero-operativo-git-dev-alonsopvs-projects.vercel.app'
const rounds = Math.max(1, Number(process.env.GUIDE_E2E_ROUNDS || 3))
const usuarioId = process.env.GUIDE_E2E_USUARIO_ID || 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'

if (!key || !secret || !process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan RETELL_API_KEY, GUIDE_RETELL_TOOL_SECRET o credenciales Supabase')
  process.exit(1)
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function sign(body) {
  return createHmac('sha256', key).update(body).digest('hex')
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

async function post(path, body, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const started = Date.now()
  const response = await fetch(`${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  })
  const text = await response.text()
  return { status: response.status, text, ms: Date.now() - started, bytes: Buffer.byteLength(text, 'utf8') }
}

const MATRIX = [
  { id: 'A', label: 'conceptual_sin_tool', skipTool: true },
  { id: 'B', label: 'dashboard_vencidas', tool: 'get_dashboard_summary', args: {} },
  { id: 'C', label: 'acciones_responsable', tool: 'get_my_actions', args: { filter: 'open' } },
  { id: 'D', label: 'okrs', tool: 'get_okr_progress', args: {} },
  { id: 'E', label: 'dashboard_breve', tool: 'get_dashboard_summary', args: {} },
  { id: 'G', label: 'seguimiento_reconsulta', tool: 'get_my_actions', args: { filter: 'open' }, twice: true },
  {
    id: 'H',
    label: 'tool_lenta_timeout',
    tool: 'get_module_data',
    args: { module: 'reports' },
    expectTimeoutOrDenied: true,
  },
  { id: 'L', label: 'auth_session_okr', tool: 'get_okr_progress', args: {} },
]

const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString()
const ins = await sb
  .from('guide_sessions')
  .insert({
    usuario_id: usuarioId,
    provider: 'retell',
    status: 'active',
    expires_at: expires,
    access_mode: 'propose',
  })
  .select('id,usuario_id,access_mode')
  .single()
if (ins.error) {
  console.error('insert session', ins.error)
  process.exit(1)
}
const session = ins.data
console.log(JSON.stringify({ host, session: session.id, rounds, matrix: MATRIX.map((m) => m.id) }, null, 2))

const byCase = {}

async function callScrumban(tool, args) {
  const toolBody = JSON.stringify({
    name: 'scrumban',
    args: { tool, ...args },
    call: {
      call_id: `latency-${Date.now()}`,
      metadata: {
        product: 'guide',
        guide_session_id: session.id,
        usuario_id: session.usuario_id,
      },
    },
  })
  return post('/api/guide-retell-tool', toolBody, {
    'x-retell-signature': sign(toolBody),
  })
}

for (const item of MATRIX) {
  byCase[item.id] = { label: item.label, samples: [] }
  for (let r = 0; r < rounds; r += 1) {
    if (item.skipTool) {
      byCase[item.id].samples.push({ ms: 0, status: 200, note: 'sin_tool' })
      continue
    }
    const first = await callScrumban(item.tool, item.args)
    byCase[item.id].samples.push({
      ms: first.ms,
      status: first.status,
      bytes: first.bytes,
      body_status: /"status":"([^"]+)"/.exec(first.text)?.[1] ?? null,
      voice_slim: first.text.includes('"voice_slim":true'),
      snippet: first.text.slice(0, 160),
    })
    if (item.twice) {
      const second = await callScrumban(item.tool, item.args)
      byCase[item.id].samples.push({
        ms: second.ms,
        status: second.status,
        bytes: second.bytes,
        body_status: /"status":"([^"]+)"/.exec(second.text)?.[1] ?? null,
        voice_slim: second.text.includes('"voice_slim":true'),
        note: 'reconsulta',
      })
    }
  }
}

// N: cierre de sesión (informe queda en call_analyzed; aquí solo verificamos que no bloqueamos el turno).
const closed = await sb
  .from('guide_sessions')
  .update({ status: 'completed', closed_at: new Date().toISOString(), close_reason: 'user_requested' })
  .eq('id', session.id)
  .select('id,consult_log,report_status')
  .maybeSingle()

const summary = Object.fromEntries(
  Object.entries(byCase).map(([id, row]) => {
    const ms = row.samples.map((s) => s.ms).filter((n) => typeof n === 'number').sort((a, b) => a - b)
    return [
      id,
      {
        label: row.label,
        n: ms.length,
        p50_ms: percentile(ms, 50),
        p95_ms: percentile(ms, 95),
        min_ms: ms[0] ?? null,
        max_ms: ms[ms.length - 1] ?? null,
        samples: row.samples,
      },
    ]
  })
)

const logOk = Array.isArray(closed.data?.consult_log) && closed.data.consult_log.length > 0
const reportUntouched = closed.data?.report_status == null || closed.data?.report_status === 'pending'

console.log(
  JSON.stringify(
    {
      host,
      session: session.id,
      summary,
      post_call: {
        N: 'colgar_sin_bloquear_informe',
        consult_log_entries: Array.isArray(closed.data?.consult_log) ? closed.data.consult_log.length : 0,
        report_status: closed.data?.report_status ?? null,
        logOk,
        report_path_intact: reportUntouched,
        note: 'El informe lo escribe call_analyzed / finalizeGuideInterview; no forma parte del turno de voz.',
      },
      compare_hint:
        'Guarda este JSON como after; compara p50/p95 vs baseline de logs guide-retell-tool previos.',
    },
    null,
    2
  )
)

const toolCasesOk = Object.values(summary).every((row) => {
  if (row.label === 'conceptual_sin_tool') return true
  return row.samples.some((s) => s.status === 200)
})
process.exit(toolCasesOk && logOk ? 0 : 1)
