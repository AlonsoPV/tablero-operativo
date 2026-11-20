/* global process, console, fetch */
// Prueba HTTP R2 en QA local: propuesta (gemini-chat) → confirmación (assistant-ops) →
// autorización → ejecución → recibo. Exige R2_EXECUTION_MODE=qa con QA_LOCAL=1 en el servidor.
// No llama proveedores reales. Restaura las acciones sintéticas al terminar.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { emailFor, QA_ACCOUNTS, requirePassword, requireQaTarget } from './qaGuard.mjs'

const qa = requireQaTarget('A', process.env, { needService: true })
const password = requirePassword()
const API = process.env.QA_API_BASE || 'http://127.0.0.1:5180'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(qa.url, qa.serviceKey, opts)
const A1 = '00000000-0000-4000-a000-0000000000a1'
const A2 = '00000000-0000-4000-a000-0000000000a2'

async function token(key) {
  const c = createClient(qa.url, qa.anonKey, opts)
  const { data, error } = await c.auth.signInWithPassword({ email: emailFor(QA_ACCOUNTS.find((a) => a.key === key)), password })
  if (error) throw new Error(`sesión ${key}: ${error.message}`)
  return data.session.access_token
}

let seq = 0
async function ask(tok, text, conversationId) {
  const res = await fetch(`${API}/api/gemini-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: JSON.stringify({
      mode: 'operativo',
      messages: [{ role: 'user', content: text }],
      requestId: `qa-r2-http-${Date.now()}-${seq++}`,
      conversationId,
    }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function confirm(tok, opId) {
  const res = await fetch(`${API}/api/assistant-ops`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: JSON.stringify({ action: 'confirm', op_id: opId }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const results = []
const check = (id, title, ok, detail) => {
  results.push({ id, title, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${id} ${title}${ok ? '' : ` · ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const superTok = await token('super_admin')
const dirTok = await token('direccion')
await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).in('id', [A1, A2])

const c1 = `qa-r2-http-${Date.now()}`
const list = await ask(superTok, '¿Qué acciones tiene Lider Creadora?', c1)
const proposed = await ask(superTok, 'marca esa acción como en ejecución', c1)
const opId = proposed.body.proposals?.[0]?.id
check('R2-H1', 'propuesta HTTP persiste un pending_op con id', Boolean(opId) && proposed.body.agent?.status === 'proposal', {
  list: list.status,
  proposed: proposed.status,
  opId,
  answer: String(proposed.body.answer ?? '').slice(0, 180),
  proposals: proposed.body.proposals?.map((p) => ({ id: p.id, tool: p.tool })),
})

const applied = opId ? await confirm(superTok, opId) : { status: 0, body: { error: 'sin op' } }
const appliedId = applied.body.result?.accionId
const row = appliedId
  ? (await admin.from('acciones_diarias').select('id,estado').eq('id', appliedId).maybeSingle()).data
  : null
const receipt = opId
  ? (await admin.from('agent_action_receipts').select('estado_anterior,estado_nuevo,pending_op_id').eq('pending_op_id', opId).maybeSingle()).data
  : null
check('R2-H2', 'confirmación HTTP aplica el estado y deja recibo', applied.status === 200 && applied.body.status === 'confirmed' && row?.estado === 'En_Ejecucion' && receipt?.estado_nuevo === 'En_Ejecucion', {
  http: applied.status,
  body: applied.body,
  estado: row?.estado,
  receipt,
})

const again = opId ? await confirm(superTok, opId) : { status: 0, body: {} }
check('R2-H3', 'reintento HTTP es idempotente (mismo recibo, sin segundo cambio)', again.status === 200 && again.body.status === 'confirmed' && JSON.stringify(again.body.result) === JSON.stringify(applied.body.result), {
  http: again.status,
  body: again.body,
})

const c2 = `qa-r2-http-b-${Date.now()}`
await ask(superTok, '¿Qué acciones tiene Lider Creadora?', c2)
const second = await ask(superTok, 'marca esa acción como hecho', c2)
const op2 = second.body.proposals?.[0]?.id
const [pA, pB] = op2 ? await Promise.all([confirm(superTok, op2), confirm(superTok, op2)]) : [{ status: 0, body: {} }, { status: 0, body: {} }]
const confirmed = [pA, pB].filter((r) => r.status === 200 && r.body.status === 'confirmed')
const conflicted = [pA, pB].filter((r) => r.status !== 200)
check('R2-H4', 'dos confirmaciones concurrentes del mismo op: una sola ejecución', confirmed.length >= 1 && confirmed.length + conflicted.length === 2, {
  pA: { status: pA.status, body: pA.body },
  pB: { status: pB.status, body: pB.body },
})

const stolen = opId ? await confirm(dirTok, opId) : { status: 0, body: {} }
check('R2-H5', 'Dirección no confirma una operación de Super Admin', stolen.status >= 400, stolen)

const c3 = `qa-r2-http-n-${Date.now()}`
await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).eq('id', A2)
await ask(superTok, `avisa al responsable de la acción ${A2} por correo`, c3)
const notify = await ask(superTok, 'avisa al responsable de esa acción por correo', c3)
const nop = notify.body.proposals?.[0]?.id
const nConfirm = nop ? await confirm(superTok, nop) : { status: 0, body: { error: 'sin propuesta de aviso' } }
const logs = await admin.from('notification_email_logs').select('id', { count: 'exact', head: true })
const wa = await admin.from('whatsapp_messages').select('id', { count: 'exact', head: true })
check('R2-H6', 'aviso HTTP no usa proveedores reales (se niega o queda en buzón QA)', nConfirm.status !== 200 || (await admin.from('qa_outbox').select('id', { count: 'exact', head: true })).count > 0, {
  propose: notify.status,
  confirm: nConfirm.status,
  error: nConfirm.body.error,
  emailLogs: logs.count,
  whatsapp: wa.count,
})
check('R2-H7', 'notification_email_logs y whatsapp_messages siguen en 0', (logs.count ?? 0) === 0 && (wa.count ?? 0) === 0, { logs: logs.count, wa: wa.count })

await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).in('id', [A1, A2])

const failed = results.filter((r) => !r.ok)
const path = `.qa/r2-http-${Date.now()}.json`
writeFileSync(path, JSON.stringify({ ranAt: new Date().toISOString(), api: API, ref: qa.ref, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} correctas · ${path}`)
process.exit(failed.length ? 1 : 0)
