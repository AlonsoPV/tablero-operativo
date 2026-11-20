/* global process, console, fetch, setTimeout */
// Matriz API R1 (formatos) + escenarios R2 contra un servidor QA (Vite --mode qa con .env.qa.local) y QA A.
// Requiere cuentas de provision-qa-accounts.mjs. Respeta el límite de 40 solicitudes/min por usuario.
// Uso: QA_API_BASE=http://127.0.0.1:5180 node scripts/qa/run-api-matrix.mjs
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { emailFor, QA_ACCOUNTS, requirePassword, requireQaTarget } from './qaGuard.mjs'

const qa = requireQaTarget('A', process.env, { needService: true })
const password = requirePassword()
const API = process.env.QA_API_BASE || 'http://127.0.0.1:5180'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(qa.url, qa.serviceKey, opts)

async function token(key) {
  const c = createClient(qa.url, qa.anonKey, opts)
  const { data, error } = await c.auth.signInWithPassword({ email: emailFor(QA_ACCOUNTS.find((a) => a.key === key)), password })
  return error ? null : data.session.access_token
}
let seq = 0
const sent = new Map()
async function throttle(tok) {
  const now = Date.now()
  const recent = (sent.get(tok) ?? []).filter((t) => now - t < 61_000)
  if (recent.length >= 36) await new Promise((r) => setTimeout(r, 61_000 - (now - recent[0])))
  recent.push(Date.now())
  sent.set(tok, recent)
}
async function ask(tok, text, { conversationId, responseFormat } = {}) {
  await throttle(tok)
  const res = await fetch(`${API}/api/gemini-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: JSON.stringify({ mode: 'operativo', messages: [{ role: 'user', content: text }], requestId: `qa-req-${Date.now()}-${seq++}`, conversationId, responseFormat }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const nums = (s) => [...String(s ?? '').matchAll(/\b\d+\b/g)].map((m) => Number(m[0]))
const refs = (b) => (b.agent?.references ?? []).map((r) => r.id ?? r.href ?? JSON.stringify(r)).sort().join(',')
const brief = (r) => ({ status: r.status, intent: r.body.agent?.intent, st: r.body.agent?.status, fmt: r.body.agent?.formatSelected, resolved: r.body.agent?.format, ui: r.body.ui?.views?.map((v) => v.type).join('+') || null, exec: r.body.agent?.executionEnabled, text: String(r.body.answer ?? r.body.error ?? '').replace(/\n+/g, ' | ').slice(0, 200) })

const results = []
const check = (id, title, ok, detail, expectedDefect = null) => {
  results.push({ id, title, ok, detail, expectedDefect })
  console.log(`  ${ok ? '✓' : expectedDefect ? '!' : '✗'} ${id} ${title}${ok ? '' : ` · ${expectedDefect ?? ''} ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const T = {}
for (const k of ['super_admin', 'direccion', 'okrs_area', 'analista', 'inactivo', 'lider']) T[k] = await token(k)
const conv = (n) => `qa-conv-${n}-${Date.now()}`
const FORMATS = ['auto', 'direct', 'report', 'analysis']

// F1–F3: misma pregunta en los cuatro formatos (Dirección): mismas referencias y misma cifra principal.
for (const [qid, Q] of [['persona', '¿Qué acciones tiene Lider Creadora?'], ['agregado', 'acciones pendientes por responsable']]) {
  const per = {}
  for (const f of FORMATS) per[f] = brief(await ask(T.direccion, Q, { conversationId: conv(`${qid}-${f}`), responseFormat: f }))
  const raw = {}
  for (const f of FORMATS) {
    const r = await ask(T.direccion, Q, { conversationId: conv(`${qid}-r-${f}`), responseFormat: f })
    raw[f] = { refs: refs(r.body), n: nums(r.body.answer)[0] }
  }
  const v = Object.values(per)
  check(`F1-${qid}`, `«${Q}»: 200 y mismo intent en los cuatro formatos`, v.every((x) => x.status === 200 && x.intent === v[0].intent), per)
  check(`F2-${qid}`, 'mismas referencias y misma cifra principal', Object.values(raw).every((x) => x.refs === raw.auto.refs && x.n === raw.auto.n), raw)
  check(`F3-${qid}`, 'operational_summary sólo cuando el formato resuelto es Reporte (Auto decide por regla)', per.report.ui === 'operational_summary' && FORMATS.every((f) => (per[f].ui === 'operational_summary') === (per[f].resolved === 'report')), Object.fromEntries(FORMATS.map((f) => [f, { resuelto: per[f].resolved, ui: per[f].ui }])))
}

// F4–F5: directivas y persistencia por conversationId.
async function directiveFlow(tok) {
  const c = conv('dir')
  const Q = '¿Qué acciones tiene Lider Creadora?'
  const a1 = await ask(tok, Q, { conversationId: c })
  const a2 = await ask(tok, 'modo reporte', { conversationId: c })
  const a3 = await ask(tok, Q, { conversationId: c })
  const a4 = await ask(tok, 'automático', { conversationId: c })
  const a5 = await ask(tok, Q, { conversationId: c })
  const other = await ask(tok, Q, { conversationId: conv('otra') })
  return { a1: brief(a1), a2: brief(a2), a3: brief(a3), a4: brief(a4), a5: brief(a5), other: brief(other), sameRefs: refs(a1.body) === refs(a3.body) }
}
const d = await directiveFlow(T.direccion)
check('F4', 'Dirección: «modo reporte» persiste en la conversación y conserva referencias', d.a2.fmt === 'report' && d.a3.fmt === 'report' && d.a3.ui === 'operational_summary' && d.sameRefs, d)
check('F5', 'Dirección: «automático» vuelve a Auto; otra conversación arranca en Auto', d.a4.fmt === 'auto' && d.a5.fmt === 'auto' && d.other.fmt === 'auto', { a4: d.a4.fmt, a5: d.a5.fmt, other: d.other.fmt })
for (const k of ['super_admin', 'okrs_area']) {
  const s = await directiveFlow(T[k])
  check(`F4-${k}`, `${k}: «modo reporte» persiste en la conversación`, s.a3.fmt === 'report', { a2: s.a2.fmt, a3: s.a3.fmt }, 'QA-R1-01 (capability_fingerprint > 128)')
}

// F6–F8: alcance y denegaciones en los cuatro formatos.
const denied = {}
for (const f of FORMATS) {
  const r = await ask(T.analista, '¿Qué acciones tiene Lider Creadora?', { conversationId: conv(`den-${f}`), responseFormat: f })
  denied[f] = { status: r.status, answer: Boolean(r.body.answer), error: r.body.error }
}
check('F6', 'Analista sin alcance de asistente: 403 en los cuatro formatos, sin datos', Object.values(denied).every((x) => x.status === 403 && !x.answer), denied)
const inact = T.inactivo ? await ask(T.inactivo, '¿Qué acciones tiene Lider Creadora?', { conversationId: conv('inact') }) : { status: 'sin sesión', body: {} }
check('F7', 'cuenta inactiva: 403 en el asistente', inact.status === 403, brief(inact))
const other = {}
for (const f of FORMATS) other[f] = brief(await ask(T.direccion, 'muéstrame las acciones privadas de otro equipo', { conversationId: conv(`otro-${f}`), responseFormat: f }))
const visible = (await admin.from('acciones_diarias').select('id', { count: 'exact', head: true }).in('id', ['00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-0000000000a3'])).count
check('F8', '«otro equipo / privadas»: se limita al equipo autorizado en los cuatro formatos', Object.values(other).every((x) => x.status === 200 && /autorizad/.test(x.text) && !/privad/i.test(x.text.replace(/privadas de otro equipo/, ''))), { other, sinteticas: visible })

// R2 por API (canal web): propuestas sin ejecución, autorización por rol y estado intacto.
const ids = ['00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-0000000000a3']
const snap = async () => (await admin.from('acciones_diarias').select('id,estado,updated_at').in('id', ids).order('id')).data
const before = await snap()
const c5 = conv('r2')
const list = await ask(T.super_admin, '¿Qué acciones tiene Lider Creadora?', { conversationId: c5 })
const p1 = await ask(T.super_admin, 'marca esa acción como en ejecución', { conversationId: c5 })
const p2 = await ask(T.super_admin, 'marca esa acción como verificada', { conversationId: c5 })
const p3 = await ask(T.super_admin, 'registra un bloqueo en esa acción porque falta material', { conversationId: c5 })
const p4 = await ask(T.super_admin, 'avisa al responsable de esa acción por whatsapp', { conversationId: c5 })
check('R2-A', 'Super Admin: cambio de estado por chat queda en propuesta, executionEnabled=false', p1.body.agent?.status === 'proposal' && p1.body.agent?.executionEnabled === false, { list: brief(list), p1: brief(p1) })
check('R2-A2', 'Super Admin: la propuesta identifica la acción del turno anterior', !/falta indicar/.test(String(p1.body.answer)), brief(p1), 'QA-R1-01 (sin contexto de sesión)')
check('R2-B', 'Verificado se niega desde el agente', p2.body.agent?.status === 'forbidden' && /verific/i.test(String(p2.body.answer)), brief(p2))
check('R2-C', 'bloqueo y aviso: propuestas sin envío', [p3, p4].every((r) => r.body.agent?.status === 'proposal' && r.body.agent?.executionEnabled === false), { p3: brief(p3), p4: brief(p4) })
const roleOut = {}
for (const k of ['direccion', 'okrs_area']) {
  const c = conv(`r2-${k}`)
  await ask(T[k], '¿Qué acciones tiene Lider Creadora?', { conversationId: c })
  roleOut[k] = brief(await ask(T[k], 'marca esa acción como en ejecución', { conversationId: c }))
}
check('R2-D', 'Dirección y Área OKRS (Analista) no preparan cambios: forbidden', Object.values(roleOut).every((x) => x.st === 'forbidden'), roleOut)
const lid = T.lider ? await ask(T.lider, 'marca esa acción como en ejecución', { conversationId: conv('r2-lider') }) : { status: 'sin sesión', body: {} }
check('R2-E', 'Líder sin módulo de asistente: 403 antes de cualquier propuesta', lid.status === 403, brief(lid))
const after = await snap()
check('R2-F', 'ninguna acción cambió (estado y updated_at)', JSON.stringify(before) === JSON.stringify(after), { before, after })
const outbox = await admin.from('qa_outbox').select('*', { count: 'exact', head: true })
const pend = await admin.from('assistant_pending_ops').select('status', { count: 'exact' }).in('status', ['executing', 'applied'])
check('R2-G', 'sin avisos (qa_outbox) y sin operaciones ejecutadas por el canal web', (outbox.count ?? 0) === 0, { qaOutbox: outbox.count, pendingOpsEjecutadas: pend.count, nota: 'las de JWT-04/09/13 son de la suite JWT' })

const failed = results.filter((r) => !r.ok && !r.expectedDefect)
const defects = results.filter((r) => !r.ok && r.expectedDefect)
const path = `.qa/api-matrix-${Date.now()}.json`
writeFileSync(path, JSON.stringify({ ranAt: new Date().toISOString(), api: API, ref: qa.ref, results }, null, 2))
console.log(`\n${results.length - failed.length - defects.length}/${results.length} correctas · ${defects.length} defecto(s) conocido(s) · ${failed.length} fallo(s) nuevos · ${path}`)
process.exit(failed.length ? 1 : 0)
