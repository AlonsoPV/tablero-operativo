import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadDotenv } from './_load-dotenv.mjs'

loadDotenv(import.meta.url)

const key = process.env.RETELL_API_KEY
const secret = process.env.GUIDE_RETELL_TOOL_SECRET
const host =
  process.env.GUIDE_E2E_HOST ||
  'https://tablero-operativo-git-dev-alonsopvs-projects.vercel.app'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const usuarioId = 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'

function sign(body) {
  return createHmac('sha256', key).update(body).digest('hex')
}

async function post(path, body, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const response = await fetch(`${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  })
  const text = await response.text()
  return { status: response.status, text, raw }
}

const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
const ins = await sb
  .from('guide_sessions')
  .insert({
    usuario_id: usuarioId,
    provider: 'retell',
    status: 'active',
    expires_at: expires,
    access_mode: 'propose',
  })
  .select('id,usuario_id,expires_at,status,access_mode')
  .single()
if (ins.error) {
  console.error('insert', ins.error)
  process.exit(1)
}
const session = ins.data
console.log('session', session.id, session.access_mode)

const clockBody = JSON.stringify({ session_id: session.id })
let clock = await post('/api/guide-session-state', clockBody, {
  'x-guide-tool-secret': secret,
})
console.log('clock_secret', clock.status, clock.text.slice(0, 240))
if (clock.status !== 200) {
  clock = await post('/api/guide-session-state', clockBody, {
    'x-retell-signature': sign(clockBody),
  })
  console.log('clock_sig', clock.status, clock.text.slice(0, 240))
}

const toolBody = JSON.stringify({
  name: 'scrumban',
  args: { tool: 'get_okr_progress' },
  call: {
    metadata: {
      product: 'guide',
      guide_session_id: session.id,
      usuario_id: session.usuario_id,
    },
  },
})
const tool = await post('/api/guide-retell-tool', toolBody, {
  'x-retell-signature': sign(toolBody),
})
console.log('scrumban_okr', tool.status, tool.text.slice(0, 500))

const toolBody2 = JSON.stringify({
  name: 'scrumban',
  args: JSON.stringify({ tool: 'get_my_actions', filter: 'open' }),
  call: {
    metadata: { product: 'guide' },
    retell_llm_dynamic_variables: { session_id: session.id },
  },
})
const tool2 = await post('/api/guide-retell-tool', toolBody2, {
  'x-retell-signature': sign(toolBody2),
})
console.log('scrumban_actions', tool2.status, tool2.text.slice(0, 500))

const { data: after } = await sb
  .from('guide_sessions')
  .select('consult_log,report_status')
  .eq('id', session.id)
  .maybeSingle()
console.log('consult_log', JSON.stringify(after?.consult_log, null, 2))

await sb
  .from('guide_sessions')
  .update({ status: 'completed', closed_at: new Date().toISOString(), close_reason: 'user_requested' })
  .eq('id', session.id)

const clockOk = clock.status === 200 && clock.text.includes('"found":true')
const toolOk =
  (tool.status === 200 && /"status":"(ok|empty|denied)"/.test(tool.text)) ||
  (tool2.status === 200 && /"status":"(ok|empty|denied)"/.test(tool2.text))
const logOk = Array.isArray(after?.consult_log) && after.consult_log.length > 0
console.log(JSON.stringify({ host, clockOk, toolOk, logOk }, null, 2))
process.exit(clockOk && toolOk && logOk ? 0 : 1)
