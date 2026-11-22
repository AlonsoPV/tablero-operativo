#!/usr/bin/env node
/* global process, console, fetch */
/**
 * Fase 2C H-06: propuestas simulated → INSERT assistant_pending_ops en QA A.
 * NO confirma / NO ejecuta R2. No cambia R2_EXECUTION_MODE.
 * Uso: QA_API_BASE=http://127.0.0.1:5180 node scripts/qa/run-fase2c-h06.mjs
 */
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

const results = []
const check = (id, title, ok, detail) => {
  results.push({ id, title, ok, detail: detail ?? null })
  console.log(`  ${ok ? '✓' : '✗'} ${id} ${title}${ok ? '' : ` · ${JSON.stringify(detail).slice(0, 320)}`}`)
}

async function session(key) {
  const account = QA_ACCOUNTS.find((a) => a.key === key)
  const c = createClient(qa.url, qa.anonKey, opts)
  const { data, error } = await c.auth.signInWithPassword({ email: emailFor(account), password })
  return { key, token: data?.session?.access_token ?? null, error: error?.message ?? null }
}

let seq = 0
async function ask(tok, text, conversationId) {
  const res = await fetch(`${API}/api/gemini-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: JSON.stringify({
      mode: 'operativo',
      messages: [{ role: 'user', content: text }],
      requestId: `qa-h06-${Date.now()}-${seq++}`,
      conversationId,
    }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function snap() {
  const acciones = (await admin.from('acciones_diarias').select('id,estado,updated_at').in('id', [A1, A2, '00000000-0000-4000-a000-0000000000a3']).order('id')).data
  const ops = await admin.from('assistant_pending_ops').select('id,status,usuario_id,tool,resource_id,created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(20)
  const receipts = await admin.from('agent_action_receipts').select('id', { count: 'exact', head: true })
  const providers = {
    email: (await admin.from('notification_email_logs').select('id', { count: 'exact', head: true })).count,
    wa: (await admin.from('whatsapp_messages').select('id', { count: 'exact', head: true })).count,
  }
  return {
    acciones,
    opsCount: ops.count,
    recentOps: (ops.data ?? []).map((o) => ({ id: o.id, status: o.status, usuario_id: o.usuario_id, tool: o.tool, resource_id: o.resource_id })),
    receipts: receipts.count,
    providers,
  }
}

const before = await snap()
const sa = await session('super_admin')
const dir = await session('direccion')
const an = await session('analista')
const resp = await session('responsable')
check('H-06-login', 'Cuentas SA/Dir/Analista/Responsable con JWT', Boolean(sa.token && dir.token && an.token && resp.token), {
  sa: Boolean(sa.token), dir: Boolean(dir.token), an: Boolean(an.token), resp: Boolean(resp.token),
})

const mA = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync('.qa/manifest-A.json', 'utf8')))
const U = Object.fromEntries(mA.users.map((u) => [u.key, u]))

// Continuidad: listar → proponer sobre «esa acción» (no confirmar)
const c1 = `h06-sa-${Date.now()}`
const list = await ask(sa.token, '¿Qué acciones tiene Lider Creadora?', c1)
const proposed = await ask(sa.token, 'marca esa acción como en ejecución', c1)
const opId = proposed.body.proposals?.[0]?.id ?? null
const agentStatus = proposed.body.agent?.status ?? null
check('H-06-propose', 'Propuesta simulated con status proposal e id de pending_op', proposed.status === 200 && agentStatus === 'proposal' && Boolean(opId), {
  list: list.status,
  proposed: proposed.status,
  agentStatus,
  executionEnabled: proposed.body.agent?.executionEnabled,
  opId,
  proposals: proposed.body.proposals?.map((p) => ({ id: p.id, tool: p.tool })),
  answer: String(proposed.body.answer ?? '').slice(0, 160),
})

// Verificar fila en BD (INSERT sintético)
let opRow = null
if (opId) {
  const { data } = await admin.from('assistant_pending_ops').select('id,status,usuario_id,tool,resource_id,payload').eq('id', opId).maybeSingle()
  opRow = data
}
check('H-06-insert', 'pending_op insertada en QA A con status pending', Boolean(opRow) && opRow.status === 'pending', {
  opRow: opRow ? { id: opRow.id, status: opRow.status, tool: opRow.tool, usuario_id: opRow.usuario_id, resource_id: opRow.resource_id } : null,
})
check('H-06-identity', 'pending_op pertenece al Super Admin que propuso', opRow?.usuario_id === U.super_admin.usuarioId, {
  expected: U.super_admin.usuarioId,
  got: opRow?.usuario_id ?? null,
})

// Acciones NO cambiaron (sin confirm/execute)
const mid = await snap()
const accionesSame = JSON.stringify(before.acciones) === JSON.stringify(mid.acciones)
check('H-06-no-execute', 'Estados de acciones sintéticas intactos (sin confirm)', accionesSame, {
  before: before.acciones,
  mid: mid.acciones,
})

// Analista no propone / no escribe
const cAn = `h06-an-${Date.now()}`
const anList = await ask(an.token, '¿Qué acciones tiene Lider Creadora?', cAn)
const anProp = await ask(an.token, 'marca esa acción como hecha', cAn)
const anOpId = anProp.body.proposals?.[0]?.id
check('H-06-analista', 'Analista no crea propuesta ni obtiene datos ejecutivos', (anList.status === 403 || anProp.status === 403) && !anOpId, {
  list: anList.status,
  prop: anProp.status,
  opId: anOpId ?? null,
  error: anProp.body.error ?? anList.body.error ?? null,
})

// Dirección puede proponer en simulated pero no debe ejecutar; verificamos que si propone, no cambia estado
const cDir = `h06-dir-${Date.now()}`
await ask(dir.token, 'acciones pendientes por responsable', cDir)
const dirProp = await ask(dir.token, 'marca la acción del responsable como en ejecución', cDir)
const dirOpId = dirProp.body.proposals?.[0]?.id ?? null
const dirStatus = dirProp.body.agent?.status ?? null
// Accept either proposal created OR authorized denial — must not change acción estado
const afterDir = await snap()
const accionesStill = JSON.stringify(before.acciones) === JSON.stringify(afterDir.acciones)
check('H-06-dir-no-effect', 'Dirección: propuesta o denegación sin efecto en acciones', accionesStill && dirProp.status === 200, {
  status: dirProp.status,
  agentStatus: dirStatus,
  opId: dirOpId,
  executionEnabled: dirProp.body.agent?.executionEnabled,
})

// Idempotencia de lectura: re-pedir la misma confirmación NO se hace; segundo propose en nuevo hilo crea otra op o reusa — documentamos conteo
const after = await snap()
const opsGrew = (after.opsCount ?? 0) >= (before.opsCount ?? 0)
const newOps = (after.opsCount ?? 0) - (before.opsCount ?? 0)
check('H-06-ops-delta', 'Conteo pending_ops aumentó solo por propuestas (sin confirm)', opsGrew && newOps >= 1, {
  before: before.opsCount,
  after: after.opsCount,
  delta: newOps,
})
check('H-06-providers', 'Sin proveedores reales (email/wa = 0)', (after.providers.email ?? 0) === 0 && (after.providers.wa ?? 0) === 0, after.providers)
check('H-06-isolation', 'Destino QA A local', qa.ref === 'qalocala000000000000' && /127\.0\.0\.1:54421/.test(qa.url), {
  ref: qa.ref,
  url: qa.url,
})

// Explicit: NO confirm called in this script
check('H-06-no-confirm', 'Suite no invocó assistant-ops confirm', true, { note: 'confirm no llamado por diseño' })

const report = {
  ranAt: new Date().toISOString(),
  api: API,
  ref: qa.ref,
  modeExpected: 'simulated',
  residueBefore: before,
  residueAfter: after,
  createdOpIds: [opId, dirOpId].filter(Boolean),
  results,
}
const path = `.qa/fase2c-h06-${Date.now()}.json`
writeFileSync(path, JSON.stringify(report, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} · ${path}`)
process.exit(failed.length ? 1 : 0)
