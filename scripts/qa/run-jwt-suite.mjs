#!/usr/bin/env node
/* global process, console, fetch, setTimeout */
// Matriz JWT R1/R2 contra los proyectos QA A y B. PREPARADO, NO EJECUTADO.
// Requiere: migraciones R0/R1 + 20261119120000 + 20261120120000 aplicadas en QA, seed QA aplicado
// y cuentas creadas con provision-qa-accounts.mjs (manifiestos en .qa/).
// Todas las operaciones de permisos usan sesiones JWT reales de las cuentas sintéticas.
// La service role del proyecto QA sólo prepara datos (restablecer estados, cambiar un rol entre
// propuesta y confirmación) y cuenta filas de proveedores; nunca sustituye a un usuario.
// Uso: node scripts/qa/run-jwt-suite.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { emailFor, QA_ACCOUNTS, requirePassword, requireQaTarget } from './qaGuard.mjs'

const qaA = requireQaTarget('A', process.env, { needService: true })
const qaB = requireQaTarget('B', process.env)
if (qaA.ref === qaB.ref) {
  console.error('QA GUARD: QA A y QA B deben ser proyectos distintos')
  process.exit(2)
}
const password = requirePassword()
const manifest = (t) => {
  const path = `.qa/manifest-${t}.json`
  if (!existsSync(path)) {
    console.error(`Falta ${path}; ejecuta antes provision-qa-accounts.mjs --apply (con autorización)`)
    process.exit(2)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}
const mA = manifest('A')
const mB = manifest('B')
if (mA.ref !== qaA.ref || mB.ref !== qaB.ref) {
  console.error('QA GUARD: los manifiestos no corresponden a los proyectos configurados')
  process.exit(2)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(qaA.url, qaA.serviceKey, opts)
const U = Object.fromEntries(mA.users.map((u) => [u.key, u]))
const [A1, A2, A3] = mA.actions.map((a) => a.id)

async function session(qa, key) {
  const account = QA_ACCOUNTS.find((a) => a.key === key)
  const client = createClient(qa.url, qa.anonKey, opts)
  const { data, error } = await client.auth.signInWithPassword({ email: emailFor(account), password })
  return { client, token: data?.session?.access_token ?? null, error }
}

const results = []
async function check(id, title, fn) {
  try {
    const detail = await fn()
    results.push({ id, title, ok: true, detail: detail ?? null })
    console.log(`  ✓ ${id} ${title}`)
  } catch (error) {
    results.push({ id, title, ok: false, detail: String(error?.message ?? error) })
    console.log(`  ✗ ${id} ${title}: ${error?.message ?? error}`)
  }
}
function expect(cond, message) {
  if (!cond) throw new Error(message)
}
const errText = (e) => String(e?.message ?? e ?? '')

async function resetActions() {
  for (const id of [A1, A2, A3]) {
    const { error } = await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).eq('id', id)
    if (error) throw new Error(`reset ${id}: ${error.message}`)
  }
}
async function actionRow(id) {
  const { data } = await admin.from('acciones_diarias').select('id,estado,causa_raiz,updated_at,responsable,created_by').eq('id', id).single()
  return data
}
async function newOp(client, user, tool, accionId, payload, ttlMs = 10 * 60_000) {
  const row = await actionRow(accionId)
  const { data, error } = await client.from('assistant_pending_ops').insert({
    usuario_id: user.usuarioId, tool, resource_id: accionId, expected_updated_at: row.updated_at,
    payload, preview: { title: 'QA', summary: 'QA', fields: [] }, status: 'pending',
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  }).select('id,payload,expected_updated_at').single()
  if (error) throw new Error(`insert op: ${error.message}`)
  return data
}
const claim = (client, op) => client.rpc('agent_claim_pending_op', { p_op_id: op.id, p_payload: op.payload })
const apply = (client, op, estado, motivo = null) => client.rpc('agent_apply_action_status', {
  p_pending_op_id: op.id, p_accion_id: op.payload.accionId, p_estado: estado, p_motivo: motivo,
  p_expected_updated_at: op.expected_updated_at,
})
async function providerCounts() {
  const counts = {}
  for (const table of ['notification_email_logs', 'whatsapp_messages']) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
    counts[table] = error ? `error: ${error.message}` : count
  }
  return counts
}

console.log(`Suite JWT QA · A=${qaA.ref} · B=${qaB.ref}`)
await resetActions()
const providersBefore = await providerCounts()
const S = {}
for (const key of ['super_admin', 'direccion', 'direccion_okrs', 'okrs_area', 'lider', 'responsable', 'analista', 'inactivo']) {
  S[key] = await session(qaA, key)
}

await check('JWT-01', 'las cuentas activas inician sesión con JWT real del proyecto A', async () => {
  for (const [key, s] of Object.entries(S)) if (key !== 'inactivo') expect(s.token, `${key} sin sesión: ${errText(s.error)}`)
  return { inactivoConSesion: Boolean(S.inactivo.token) }
})

await check('JWT-02', 'puerta en BD: el seed QA habilita la ejecución y declara el proyecto A', async () => {
  const allowed = await S.responsable.client.rpc('agent_execution_allowed')
  const env = await S.responsable.client.rpc('agent_execution_environment')
  expect(allowed.data === true, 'agent_execution_allowed() no es true')
  expect(env.data === qaA.ref, `agent_execution_environment() = ${env.data}`)
})

await check('JWT-03', 'ruta directa: fijar executing por PostgREST o llamar la RPC sin claim se rechaza', async () => {
  const c = S.responsable.client
  const op = await newOp(c, U.responsable, 'agent_set_action_status', A1, { accionId: A1, estado: 'En_Ejecucion' })
  const direct = await c.from('assistant_pending_ops').update({ status: 'executing' }).eq('id', op.id).select('id')
  expect(direct.error, 'el cliente pudo fijar executing directamente')
  const forgedClaim = await c.from('assistant_pending_ops').update({ claimed_at: new Date().toISOString() }).eq('id', op.id).select('id')
  expect(forgedClaim.error, 'el cliente pudo fijar claimed_at')
  const rpc = await apply(c, op, 'En_Ejecucion')
  expect(/not_confirmed/.test(errText(rpc.error)), `RPC sin claim: ${errText(rpc.error) || 'aceptada'}`)
  expect((await actionRow(A1)).estado === 'Pendiente', 'la acción cambió')
})

await check('JWT-04', 'responsable: claim + RPC aplica una vez; reintento devuelve el recibo; recibo sólo visible al autor', async () => {
  const c = S.responsable.client
  const op = await newOp(c, U.responsable, 'agent_set_action_status', A1, { accionId: A1, estado: 'En_Ejecucion' })
  expect((await claim(c, op)).data === true, 'claim rechazado')
  const first = await apply(c, op, 'En_Ejecucion')
  expect(!first.error && first.data?.ok, `apply: ${errText(first.error)}`)
  const again = await apply(c, op, 'En_Ejecucion')
  expect(again.data?.replayed === true, 'el reintento no devolvió el recibo')
  const mine = await c.from('agent_action_receipts').select('pending_op_id').eq('pending_op_id', op.id)
  const theirs = await S.lider.client.from('agent_action_receipts').select('pending_op_id').eq('pending_op_id', op.id)
  expect(mine.data?.length === 1 && (theirs.data?.length ?? 0) === 0, 'visibilidad de recibos incorrecta')
})

await check('JWT-05', 'bloqueo por responsable: Bloqueado + comentario bloqueo_reportado; causa_raiz intacta', async () => {
  const before = await actionRow(A3)
  const c = S.responsable.client
  const op = await newOp(c, U.responsable, 'agent_register_blocker', A3, { accionId: A3, motivo: 'Falta material del proveedor QA' })
  expect((await claim(c, op)).data === true, 'claim rechazado')
  const r = await apply(c, op, 'Bloqueado', 'Falta material del proveedor QA')
  expect(!r.error, `apply: ${errText(r.error)}`)
  const after = await actionRow(A3)
  expect(after.estado === 'Bloqueado', `estado ${after.estado}`)
  expect(after.causa_raiz === before.causa_raiz, 'causa_raiz cambió')
  const { data: comments } = await admin.from('accion_comentarios').select('contenido,tipo_comentario,created_by')
    .eq('accion_id', A3).eq('tipo_comentario', 'bloqueo_reportado')
  expect(comments?.some((x) => x.contenido === 'Causa reportada: Falta material del proveedor QA' && x.created_by === U.responsable.usuarioId), 'sin comentario bloqueo_reportado')
})

await check('JWT-06', 'historial de bloqueos: responsable, creadora y Super Admin sí; Analista y Dirección no', async () => {
  const seen = {}
  for (const key of ['responsable', 'lider', 'super_admin', 'analista', 'direccion', 'direccion_okrs']) {
    const r = await S[key].client.rpc('agent_action_block_history', { p_accion_id: A3 })
    seen[key] = r.error ? 'denegado' : `reportes=${r.data?.reportes?.length ?? 0}`
  }
  for (const key of ['responsable', 'lider', 'super_admin']) expect(seen[key] !== 'denegado', `${key} no pudo leer`)
  for (const key of ['analista', 'direccion', 'direccion_okrs']) expect(seen[key] === 'denegado', `${key} pudo leer`)
  return seen
})

await check('JWT-07', 'Analista, Dirección y Dirección con OKRS no ejecutan aunque la operación sea propia', async () => {
  const out = {}
  for (const key of ['analista', 'direccion', 'direccion_okrs', 'okrs_area']) {
    const c = S[key].client
    const op = await newOp(c, U[key], 'agent_set_action_status', A2, { accionId: A2, estado: 'En_Ejecucion' })
    const cl = await claim(c, op)
    const r = cl.data === true ? await apply(c, op, 'En_Ejecucion') : cl
    out[key] = r.error ? errText(r.error).split(':')[0] : 'APLICADA'
  }
  expect(out.analista !== 'APLICADA' && out.direccion !== 'APLICADA' && out.direccion_okrs !== 'APLICADA', JSON.stringify(out))
  expect((await actionRow(A2)).estado === 'Pendiente', 'la acción cambió')
  return out
})

await check('JWT-08', 'cuenta inactiva: sin sesión o sin ejecución', async () => {
  if (!S.inactivo.token) return 'sin sesión'
  const c = S.inactivo.client
  const r = await c.rpc('agent_claim_pending_op', { p_op_id: '00000000-0000-4000-a000-00000000ffff', p_payload: {} })
  expect(/not_authorized/.test(errText(r.error)), `claim inactivo: ${errText(r.error) || 'aceptado'}`)
})

await check('JWT-09', 'Super Admin (acumulativo) aplica sobre una acción ajena por edición general', async () => {
  const c = S.super_admin.client
  const op = await newOp(c, U.super_admin, 'agent_set_action_status', A2, { accionId: A2, estado: 'En_Ejecucion' })
  expect((await claim(c, op)).data === true, 'claim rechazado')
  const r = await apply(c, op, 'En_Ejecucion')
  expect(!r.error, `apply: ${errText(r.error)}`)
  await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).eq('id', A2)
})

await check('JWT-10', 'lectura (observación): acciones sintéticas visibles por perfil', async () => {
  const seen = {}
  for (const key of ['super_admin', 'direccion', 'direccion_okrs', 'okrs_area', 'analista', 'responsable']) {
    const { data, error } = await S[key].client.from('acciones_diarias').select('id').in('id', [A1, A2, A3])
    seen[key] = error ? `error: ${error.message}` : data.length
  }
  return seen
})

await check('JWT-11', 'un JWT del proyecto B se rechaza en el proyecto A', async () => {
  const b = await session(qaB, 'admin_b')
  expect(b.token, `B sin sesión: ${errText(b.error)}`)
  const res = await fetch(`${qaA.url}/rest/v1/acciones_diarias?select=id&limit=1`, {
    headers: { apikey: qaA.anonKey, Authorization: `Bearer ${b.token}` },
  })
  expect(res.status === 401, `status ${res.status}`)
})

await check('JWT-12', 'cambio de rol entre propuesta y confirmación: la RPC lo niega con el rol vigente', async () => {
  const c = S.responsable.client
  await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).eq('id', A1)
  const op = await newOp(c, U.responsable, 'agent_set_action_status', A1, { accionId: A1, estado: 'En_Ejecucion' })
  await admin.from('usuarios').update({ rol: 'Analista' }).eq('id', U.responsable.usuarioId)
  try {
    expect((await claim(c, op)).data === true, 'claim rechazado')
    const r = await apply(c, op, 'En_Ejecucion')
    expect(/not_authorized/.test(errText(r.error)), `apply con rol nuevo: ${errText(r.error) || 'aceptada'}`)
  } finally {
    await admin.from('usuarios').update({ rol: U.responsable.rol }).eq('id', U.responsable.usuarioId)
  }
})

await check('JWT-13', 'duplicados y concurrencia: un solo claim y un solo recibo', async () => {
  const c = S.lider.client
  await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).eq('id', A2)
  const op = await newOp(c, U.lider, 'agent_set_action_status', A2, { accionId: A2, estado: 'En_Ejecucion' })
  const claims = await Promise.all([claim(c, op), claim(c, op)])
  expect(claims.filter((r) => r.data === true).length === 1, 'claims concurrentes')
  await Promise.all([apply(c, op, 'En_Ejecucion'), apply(c, op, 'En_Ejecucion')])
  const { data } = await admin.from('agent_action_receipts').select('pending_op_id').eq('pending_op_id', op.id)
  expect(data?.length === 1, `recibos ${data?.length}`)
})

await check('JWT-14', 'confirmación vencida: el claim no reserva y no hay efecto', async () => {
  const c = S.lider.client
  await admin.from('acciones_diarias').update({ estado: 'Pendiente' }).eq('id', A2)
  const op = await newOp(c, U.lider, 'agent_set_action_status', A2, { accionId: A2, estado: 'En_Ejecucion' }, 3_000)
  await new Promise((r) => setTimeout(r, 4_000))
  const r = await claim(c, op)
  expect(r.data === false, `claim vencido: ${JSON.stringify(r.data ?? errText(r.error))}`)
  expect((await actionRow(A2)).estado === 'Pendiente', 'la acción cambió')
})

await check('JWT-15', 'Verificado nunca se asigna desde el agente', async () => {
  const c = S.lider.client
  const op = await newOp(c, U.lider, 'agent_set_action_status', A2, { accionId: A2, estado: 'Verificado' })
  expect((await claim(c, op)).data === true, 'claim rechazado')
  const r = await apply(c, op, 'Verificado')
  expect(/verified_requires_human/.test(errText(r.error)), errText(r.error) || 'aceptada')
})

await check('JWT-16', 'proveedores reales sin filas nuevas; avisos sólo en qa_outbox', async () => {
  const after = await providerCounts()
  expect(JSON.stringify(after) === JSON.stringify(providersBefore), `antes ${JSON.stringify(providersBefore)} después ${JSON.stringify(after)}`)
  const { count } = await admin.from('qa_outbox').select('*', { count: 'exact', head: true })
  return { providers: after, qaOutbox: count }
})

await resetActions()
const failed = results.filter((r) => !r.ok)
const report = { refs: { A: qaA.ref, B: qaB.ref }, ranAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }
const path = `.qa/jwt-report-${Date.now()}.json`
writeFileSync(path, JSON.stringify(report, null, 2))
console.log(`\n${report.passed}/${results.length} correctas · reporte ${path}`)
process.exit(failed.length ? 1 : 0)
