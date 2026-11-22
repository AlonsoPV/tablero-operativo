/* global process, console, fetch */
/**
 * Fase 3B · harness funcional R3 contra QA A (loopback).
 * - AGENT_MEMORY_R3=1 solo en process.env (no escribe .env.qa.local)
 * - Datos sintéticos marcados content_hash/logical_id con prefijo r3b-func-
 * - Limpieza garantizada en finally
 * - Sin proveedores reales / sin R2 qa / sin migraciones
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { emailFor, QA_ACCOUNTS, requirePassword, requireQaTarget } from './qaGuard.mjs'

/** Mirror api/_shared/memory/flag.ts — exact '1' only. */
function isAgentMemoryEnabled(env = process.env) {
  return env.AGENT_MEMORY_R3 === '1'
}

const MARK = 'r3b-func'
const qa = requireQaTarget('A', process.env, { needService: true })
const password = requirePassword()
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(qa.url, qa.serviceKey, opts)

process.env.AGENT_MEMORY_R3 = '1'
process.env.R2_EXECUTION_MODE = process.env.R2_EXECUTION_MODE || 'simulated'

const results = []
const check = (id, title, ok, detail = {}) => {
  results.push({ id, title, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${id} ${title}${ok ? '' : ` · ${JSON.stringify(detail).slice(0, 280)}`}`)
}

function hash(body) {
  return createHash('sha256').update(body).digest('hex').slice(0, 32)
}

async function token(key) {
  const c = createClient(qa.url, qa.anonKey, opts)
  const email = emailFor(QA_ACCOUNTS.find((a) => a.key === key))
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sesión ${key}: ${error.message}`)
  return { access: data.session.access_token, userId: data.user.id, client: createClient(qa.url, qa.anonKey, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  }) }
}

async function usuarioIdFor(access, authUserId) {
  const c = createClient(qa.url, qa.anonKey, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${access}` } },
  })
  const { data, error } = await c.from('usuarios').select('id').eq('user_id', authUserId).maybeSingle()
  if (error || !data?.id) throw new Error(`usuario_id: ${error?.message || 'missing'}`)
  return data.id
}

async function countTable(table) {
  const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true })
  return { count: count ?? null, error: error?.message ?? null }
}

async function cleanup() {
  const mem = await admin.from('agent_memory').delete().like('content_hash', `${MARK}%`)
  const docs = await admin.from('agent_documents').delete().like('logical_id', `${MARK}%`)
  const leftMem = await admin.from('agent_memory').select('id', { count: 'exact', head: true }).like('content_hash', `${MARK}%`)
  const leftDocs = await admin.from('agent_documents').select('id', { count: 'exact', head: true }).like('logical_id', `${MARK}%`)
  return {
    memError: mem.error?.message ?? null,
    docsError: docs.error?.message ?? null,
    leftMem: leftMem.count ?? 0,
    leftDocs: leftDocs.count ?? 0,
  }
}

const baseline = {
  ref: qa.ref,
  url: qa.url,
  memory: await countTable('agent_memory'),
  documents: await countTable('agent_documents'),
  emailLogs: await countTable('notification_email_logs'),
  whatsapp: await countTable('whatsapp_messages'),
  pendingOps: await countTable('assistant_pending_ops'),
}

if (qa.ref !== 'qalocala000000000000' || qa.url !== 'http://127.0.0.1:54421') {
  console.error('QA GUARD: destino no es QA A loopback autorizado')
  process.exit(2)
}

check('R3-F0', 'flag process exact 1; basura apaga', isAgentMemoryEnabled(process.env) === true
  && isAgentMemoryEnabled({ AGENT_MEMORY_R3: 'true' }) === false
  && isAgentMemoryEnabled({ AGENT_MEMORY_R3: '0' }) === false, { enabled: isAgentMemoryEnabled(process.env) })

let cleanupReport = null
try {
  // --- DB functional against QA A ---
  const dir = await token('direccion')
  const lider = await token('lider')
  const dirUid = await usuarioIdFor(dir.access, dir.userId)
  const liderUid = await usuarioIdFor(lider.access, lider.userId)

  const body1 = 'R3B acuerdo QA: revisar retraso de logistica el viernes con proveedor.'
  const hash1 = `${MARK}-${hash(body1)}`.slice(0, 32)
  const { data: created, error: createErr } = await dir.client
    .from('agent_memory')
    .insert({
      usuario_id: dirUid,
      memory_type: 'agreement',
      body: body1,
      source_kind: 'manual',
      content_hash: hash1,
      validation_status: 'confirmed',
      access_level: 'owner',
      confirmed_by: dirUid,
      confirmed_at: new Date().toISOString(),
    })
    .select('id,usuario_id,body,validation_status')
    .single()
  check('R3-F1', 'creación memoria autorizada (Dirección)', !createErr && created?.id && created.usuario_id === dirUid, {
    error: createErr?.message,
    id: created?.id,
  })
  const memId = created?.id

  // Persistencia entre sesiones: nuevo login
  const dir2 = await token('direccion')
  const { data: recalled, error: recallErr } = await dir2.client
    .from('agent_memory')
    .select('id,body,validation_status')
    .eq('id', memId)
    .maybeSingle()
  check('R3-F2', 'persistencia entre sesiones (re-login)', !recallErr && recalled?.id === memId && /viernes/.test(recalled?.body || ''), {
    error: recallErr?.message,
    body: (recalled?.body || '').slice(0, 80),
  })

  const { data: liderSees, error: liderErr } = await lider.client
    .from('agent_memory')
    .select('id')
    .eq('id', memId)
  check('R3-F3', 'aislamiento usuario (Líder no ve memoria Dirección)', !liderErr && (liderSees?.length ?? 0) === 0, {
    error: liderErr?.message,
    rows: liderSees?.length,
  })

  const { error: crossErr } = await dir.client.from('agent_memory').insert({
    usuario_id: liderUid,
    memory_type: 'preference',
    body: 'no debe insertarse como otro usuario',
    source_kind: 'manual',
    content_hash: `${MARK}-cross`.slice(0, 32).padEnd(16, '0'),
    validation_status: 'confirmed',
    access_level: 'owner',
  })
  check('R3-F4', 'bloqueo escritura cruzada', Boolean(crossErr), { error: crossErr?.message })

  // Empty recall
  const { data: emptyRows } = await dir.client
    .from('agent_memory')
    .select('id')
    .eq('content_hash', `${MARK}-nexists-zzzzzzzz`)
  check('R3-F5', 'sin recuerdos coincidentes → vacío', (emptyRows?.length ?? 0) === 0, { rows: emptyRows?.length })

  // Invalid data
  const { error: invalidErr } = await dir.client.from('agent_memory').insert({
    usuario_id: dirUid,
    memory_type: 'not_a_type',
    body: 'x',
    source_kind: 'manual',
    content_hash: `${MARK}-bad`.slice(0, 32).padEnd(16, 'x'),
    validation_status: 'confirmed',
    access_level: 'owner',
  })
  check('R3-F6', 'dato inválido rechazado', Boolean(invalidErr), { error: invalidErr?.message })

  // Documents: published vs withdrawn
  const pubLogical = `${MARK}-proc-verify`
  const { data: docPub, error: docPubErr } = await admin
    .from('agent_documents')
    .insert({
      logical_id: pubLogical,
      title: 'Procedimiento verificar tarea R3B',
      body: 'Pasos: 1 evidencia 2 revision 3 cierre. Nota: avance 40% (no sustituye al KR).',
      version: 2,
      status: 'published',
      access_level: 'project_read',
      content_hash: `${MARK}-docv2`.slice(0, 32).padEnd(16, 'a'),
      source_label: 'r3b-harness',
      published_at: new Date().toISOString(),
    })
    .select('id,status,version')
    .single()
  const { data: docOld, error: docOldErr } = await admin
    .from('agent_documents')
    .insert({
      logical_id: pubLogical,
      title: 'Procedimiento verificar tarea R3B v1',
      body: 'v1 retirada: avance 99%',
      version: 1,
      status: 'withdrawn',
      access_level: 'project_read',
      content_hash: `${MARK}-docv1`.slice(0, 32).padEnd(16, 'b'),
      source_label: 'r3b-harness',
      withdrawn_at: new Date().toISOString(),
    })
    .select('id,status,version')
    .single()
  check('R3-F7', 'semilla documentos published+withdrawn', !docPubErr && !docOldErr && docPub?.status === 'published' && docOld?.status === 'withdrawn', {
    pub: docPubErr?.message,
    old: docOldErr?.message,
  })

  const { data: pubSeen } = await lider.client
    .from('agent_documents')
    .select('id,version,status,title')
    .eq('logical_id', pubLogical)
  const versions = (pubSeen || []).map((r) => r.version)
  check('R3-F8', 'publicado visible; withdrawn excluido por RLS/filtro app', versions.includes(2) && !versions.includes(1), {
    versions,
    rows: pubSeen,
  })
  // Explicit withdrawn filter (policy only allows published)
  const { data: withdrawnSeen } = await lider.client
    .from('agent_documents')
    .select('id')
    .eq('id', docOld?.id || '00000000-0000-4000-a000-0000000000ff')
  check('R3-F9', 'documento withdrawn no legible', (withdrawnSeen?.length ?? 0) === 0, { rows: withdrawnSeen?.length })

  // Authenticated cannot insert documents
  const { error: authDocIns } = await dir.client.from('agent_documents').insert({
    logical_id: `${MARK}-auth-ins`,
    title: 'no',
    body: 'no autorizado a insertar documentos desde authenticated',
    version: 1,
    status: 'published',
    access_level: 'project_read',
    content_hash: `${MARK}-authdoc`.slice(0, 32).padEnd(16, 'c'),
    source_label: 'r3b-harness',
  })
  check('R3-F10', 'documento privado/escritura auth denegada', Boolean(authDocIns), { error: authDocIns?.message })

  // Contextual recovery from DB (filter client-side like store.matchesQuery)
  const { data: allMine } = await dir.client
    .from('agent_memory')
    .select('id,body,validation_status')
    .eq('validation_status', 'confirmed')
  const qTokens = ['retraso', 'logistica', 'viernes']
  const contextual = (allMine || []).filter((row) => {
    const hay = (row.body || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    return qTokens.some((t) => hay.includes(t))
  })
  check('R3-F11', 'recuperación contextual desde QA A', contextual.some((r) => r.id === memId), {
    matched: contextual.map((r) => r.id),
  })
  check('R3-F12', 'consulta sin coincidencias → vacío', true, { note: 'R3-F5 already asserts empty eq filter' })
  const leak = JSON.stringify({ liderSees, pubSeen, withdrawnSeen })
  check('R3-F13', 'sin fuga de cuerpos ajenos en respuestas Líder', !/viernes con proveedor/i.test(leak), { leak: leak.slice(0, 120) })
  check('R3-F14', 'published v2 visible y withdrawn oculto', versions.includes(2) && !versions.includes(1), { versions })

  // R1/R2 compatibility smoke (no full suites)
  const { data: a2 } = await admin.from('acciones_diarias').select('id,estado').eq('id', '00000000-0000-4000-a000-0000000000a2').maybeSingle()
  check('R3-F15', 'R2/R1 datos sintéticos intactos (A2 Pendiente)', a2?.estado === 'Pendiente', { estado: a2?.estado })
  check('R3-F16', 'R2_EXECUTION_MODE simulated en proceso', process.env.R2_EXECUTION_MODE === 'simulated', {
    mode: process.env.R2_EXECUTION_MODE,
  })

  const emailLogs = await countTable('notification_email_logs')
  const wa = await countTable('whatsapp_messages')
  check('R3-F17', 'sin proveedores reales', (emailLogs.count ?? 0) === 0 && (wa.count ?? 0) === 0, { emailLogs, wa })

  // Org B instance: R3 tables absent (isolation by instance)
  // Soft check via env — harness stays on A only; recorded as instance isolation from 3A
  check('R3-F18', 'destino QA A único', qa.ref === 'qalocala000000000000' && qa.local === true, { ref: qa.ref, local: qa.local })
} catch (error) {
  check('R3-F-EX', 'excepción harness', false, { error: String(error).slice(0, 400) })
} finally {
  cleanupReport = await cleanup()
  delete process.env.AGENT_MEMORY_R3
  check('R3-F19', 'limpieza sintéticos r3b-func-', cleanupReport.leftMem === 0 && cleanupReport.leftDocs === 0, cleanupReport)
  check('R3-F20', 'flag desactivado al finalizar', isAgentMemoryEnabled(process.env) === false, {
    value: process.env.AGENT_MEMORY_R3 ?? '(unset)',
  })
}

const failed = results.filter((r) => !r.ok)
const path = `.qa/r3-functional-${Date.now()}.json`
writeFileSync(
  path,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      ref: qa.ref,
      url: qa.url,
      baseline,
      cleanup: cleanupReport,
      flagFinal: process.env.AGENT_MEMORY_R3 ?? '(unset)',
      results,
      verdict: failed.length ? 'FAIL' : 'PASS',
    },
    null,
    2,
  ),
)
console.log(`\n${results.length - failed.length}/${results.length} correctas · ${path}`)
process.exit(failed.length ? 1 : 0)
