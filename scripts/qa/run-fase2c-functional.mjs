#!/usr/bin/env node
/* global process, console, fetch */
/**
 * Fase 2C: H-03…H-09 verificables sin nuevas propuestas R2 (no INSERT pending_ops).
 * H-06 (proponer) queda BLOCKED fuera de este script.
 * Uso: QA_API_BASE=http://127.0.0.1:5180 node scripts/qa/run-fase2c-functional.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { emailFor, QA_ACCOUNTS, requirePassword, requireQaTarget } from './qaGuard.mjs'

const qa = requireQaTarget('A', process.env, { needService: true })
const password = requirePassword()
const API = process.env.QA_API_BASE || 'http://127.0.0.1:5180'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(qa.url, qa.serviceKey, opts)

async function token(key) {
  const account = QA_ACCOUNTS.find((a) => a.key === key)
  const c = createClient(qa.url, qa.anonKey, opts)
  const { data, error } = await c.auth.signInWithPassword({ email: emailFor(account), password })
  return { token: data?.session?.access_token ?? null, error: error?.message ?? null, claims: data?.session?.access_token
    ? JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString())
    : null }
}

let seq = 0
async function ask(tok, text, { conversationId, responseFormat } = {}) {
  const res = await fetch(`${API}/api/gemini-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: JSON.stringify({
      mode: 'operativo',
      messages: [{ role: 'user', content: text }],
      requestId: `qa-2c-${Date.now()}-${seq++}`,
      conversationId,
      responseFormat,
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
  results.push({ id, title, ok, detail: detail ?? null })
  console.log(`  ${ok ? '✓' : '✗'} ${id} ${title}${ok ? '' : ` · ${JSON.stringify(detail).slice(0, 350)}`}`)
}

const snap = async () => {
  const acciones = (await admin.from('acciones_diarias').select('id,estado,updated_at').in('id', [
    '00000000-0000-4000-a000-0000000000a1',
    '00000000-0000-4000-a000-0000000000a2',
    '00000000-0000-4000-a000-0000000000a3',
  ]).order('id')).data
  const ops = await admin.from('assistant_pending_ops').select('id', { count: 'exact', head: true })
  const receipts = await admin.from('agent_action_receipts').select('id', { count: 'exact', head: true })
  return { acciones, ops: ops.count, receipts: receipts.count }
}

const before = await snap()

// H-03 login
const sa = await token('super_admin')
const dir = await token('direccion')
const an = await token('analista')
check('H-03-login-sa', 'Super Admin inicia sesión JWT', Boolean(sa.token) && sa.claims?.role === 'authenticated', {
  hasToken: Boolean(sa.token), role: sa.claims?.role, err: sa.error,
})
check('H-03-login-dir', 'Dirección inicia sesión JWT', Boolean(dir.token), { err: dir.error })
check('H-03-login-an', 'Analista inicia sesión JWT (Auth OK; acceso asistente se niega abajo)', Boolean(an.token), { err: an.error })

const health = await fetch(`${API}/`).then((r) => r.status).catch((e) => String(e))
check('Vite-root', 'Vite QA responde en 5180', health === 200, { health })

const saAsk = await ask(sa.token, '¿Qué acciones tiene Lider Creadora?', { conversationId: `2c-sa-${Date.now()}` })
check('H-03-assist-sa', 'Super Admin obtiene 200 en /api/gemini-chat (asistente)', saAsk.status === 200 && Boolean(saAsk.body.answer || saAsk.body.agent), {
  status: saAsk.status, intent: saAsk.body.agent?.intent, st: saAsk.body.agent?.status,
  text: String(saAsk.body.answer ?? saAsk.body.error ?? '').slice(0, 160),
})
const anAsk = await ask(an.token, '¿Qué acciones tiene Lider Creadora?', { conversationId: `2c-an-${Date.now()}` })
check('H-03-assist-an', 'Analista sin módulo: 403 en asistente', anAsk.status === 403 && !anAsk.body.answer, {
  status: anAsk.status, error: anAsk.body.error, answer: Boolean(anAsk.body.answer),
})

// H-04 Auto Kanban/OKR — una petición orquestador
const h4 = await ask(dir.token, 'acciones pendientes por responsable', {
  conversationId: `2c-h4-${Date.now()}`,
  responseFormat: 'auto',
})
const h4text = String(h4.body.answer ?? '')
check('H-04', 'Auto Kanban: 200 orquestador con datos (no inventados vacíos)', h4.status === 200 && Boolean(h4.body.agent?.intent) && h4text.length > 0, {
  status: h4.status,
  intent: h4.body.agent?.intent,
  format: h4.body.agent?.format ?? h4.body.agent?.formatSelected,
  executionEnabled: h4.body.agent?.executionEnabled,
  refs: (h4.body.agent?.references ?? []).length,
  text: h4text.slice(0, 180),
})

// H-05 cuatro formatos, mismas cifras
const FORMATS = ['auto', 'direct', 'report', 'analysis']
const Q = 'acciones pendientes por responsable'
const per = {}
const nums = (s) => [...String(s ?? '').matchAll(/\b\d+\b/g)].map((m) => Number(m[0]))
for (const f of FORMATS) {
  const r = await ask(dir.token, Q, { conversationId: `2c-h5-${f}-${Date.now()}`, responseFormat: f })
  per[f] = {
    status: r.status,
    intent: r.body.agent?.intent,
    resolved: r.body.agent?.format ?? r.body.agent?.formatSelected,
    n: nums(r.body.answer)[0] ?? null,
    ui: r.body.ui?.views?.map((v) => v.type).join('+') || null,
    text: String(r.body.answer ?? '').slice(0, 100),
  }
}
check('H-05-status', 'Cuatro formatos responden 200', FORMATS.every((f) => per[f].status === 200), per)
check('H-05-intent', 'Mismo intent en los cuatro formatos', FORMATS.every((f) => per[f].intent === per.auto.intent), per)
check('H-05-cifra', 'Misma cifra principal en los cuatro formatos', FORMATS.every((f) => per[f].n === per.auto.n), per)
check('H-05-report-ui', 'Reporte expone operational_summary', per.report.ui === 'operational_summary' || per.report.resolved === 'report', {
  report: per.report,
})

// H-07 alcance
const denied = {}
for (const f of FORMATS) {
  const r = await ask(an.token, '¿Qué acciones tiene Lider Creadora?', { conversationId: `2c-h7-${f}-${Date.now()}`, responseFormat: f })
  denied[f] = { status: r.status, answer: Boolean(r.body.answer) }
}
check('H-07-analista', 'Analista: 403 en los cuatro formatos, sin datos', Object.values(denied).every((x) => x.status === 403 && !x.answer), denied)

const other = await ask(dir.token, 'muéstrame las acciones privadas de otro equipo', { conversationId: `2c-h7-other-${Date.now()}` })
const otherText = String(other.body.answer ?? other.body.error ?? '')
check('H-07-scope', 'Dirección: consulta de otro equipo limitada/autorizada, sin fuga', other.status === 200 && /autorizad/i.test(otherText), {
  status: other.status, text: otherText.slice(0, 180),
})

// H-08 R2 confirm deshabilitado en simulated (sin modo qa): usa op pendiente existente si hay
const { data: pending } = await admin.from('assistant_pending_ops')
  .select('id,status,usuario_id')
  .eq('status', 'pending')
  .order('created_at', { ascending: false })
  .limit(5)
let h8detail = { pendingFound: pending?.length ?? 0 }
if (pending?.length) {
  // Intentar con super_admin; si no es dueño, esperamos error de pertenencia o EXECUTION_DISABLED
  const c = await confirm(sa.token, pending[0].id)
  const msg = String(c.body.error ?? c.body.message ?? JSON.stringify(c.body))
  const disabled = /EXECUTION_DISABLED/i.test(msg) || c.status === 400 || c.status === 403
  const ownership = /no te pertenece|no encontr/i.test(msg)
  h8detail = { ...h8detail, http: c.status, msg: msg.slice(0, 200), disabled, ownership }
  check('H-08', 'Confirm HTTP no aplica efecto (EXECUTION_DISABLED u ownership; sin modo qa)', disabled || ownership, h8detail)
} else {
  check('H-08', 'Confirm HTTP no aplica efecto', false, { reason: 'no hay pending_ops pending para probar' })
}

// H-09 aislamiento local (archivo + runtime)
const envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || qa.url
const hits = ['tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb'].filter((r) => String(envUrl).toLowerCase().includes(r))
check('H-09-local', 'URL runtime ≠ PROD/DEV', hits.length === 0 && /127\.0\.0\.1:54421/.test(qa.url), {
  url: qa.url, hits,
})

const after = await snap()
const accionesSame = JSON.stringify(before.acciones) === JSON.stringify(after.acciones)
check('NO-WRITE-acciones', 'Estados de acciones sintéticas intactos', accionesSame, { before: before.acciones, after: after.acciones })
check('NO-WRITE-ops-count', 'Sin nuevas pending_ops (conteo estable o menor)', after.ops <= before.ops, { before: before.ops, after: after.ops })

const report = {
  ranAt: new Date().toISOString(),
  api: API,
  ref: qa.ref,
  residueBefore: before,
  residueAfter: after,
  results,
  blocked: [{ id: 'H-06', reason: 'proponer en simulated inserta assistant_pending_ops; requiere auth de escritura sintética' }],
}
const path = `.qa/fase2c-functional-${Date.now()}.json`
writeFileSync(path, JSON.stringify(report, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} · ${path}`)
process.exit(failed.length ? 1 : 0)
