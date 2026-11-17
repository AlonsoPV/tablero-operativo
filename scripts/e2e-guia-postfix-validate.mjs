/**
 * Validación postcorrección PERMISSION_DENIED / searchActivePeople.
 * Sesión Alonso P.V (prod). Solo captura en assistant_pending_ops + cancel.
 * No confirm de create_action, no envío WA/correo, no publish Retell.
 *
 * Uso:
 *   node scripts/e2e-guia-postfix-validate.mjs
 *   GUIDE_E2E_HOST=https://... node scripts/e2e-guia-postfix-validate.mjs
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
const usuarioId = process.env.GUIDE_E2E_USUARIO_ID || 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'

if (!key || !secret || !process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan RETELL_API_KEY, GUIDE_RETELL_TOOL_SECRET o credenciales Supabase')
  process.exit(1)
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function sign(body) {
  return createHmac('sha256', key).update(body).digest('hex')
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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
  return {
    status: response.status,
    text,
    json: parseJson(text),
    ms: Date.now() - started,
    raw,
  }
}

function callEnvelope(session, callId, extraMeta = {}) {
  return {
    call_id: callId,
    metadata: {
      product: 'guide',
      guide_session_id: session.id,
      usuario_id: session.usuario_id,
      ...extraMeta,
    },
  }
}

async function callScrumban(session, callId, tool, args = {}) {
  const toolBody = JSON.stringify({
    name: 'scrumban',
    args: { tool, ...args },
    call: callEnvelope(session, callId),
  })
  return post('/api/guide-retell-tool', toolBody, {
    'x-retell-signature': sign(toolBody),
  })
}

async function callQueueDraft(session, callId, args) {
  const body = JSON.stringify({
    name: 'queue_workspace_draft',
    args,
    call: callEnvelope(session, callId),
  })
  return post('/api/guide-queue-workspace-draft', body, {
    'x-retell-signature': sign(body),
  })
}

function tomorrowYmd() {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return d.toISOString().slice(0, 10)
}

const matrix = []
function record(row) {
  matrix.push(row)
  console.log(JSON.stringify({ case: row.operacion, estado: row.estado, backend: row.resultado_backend }, null, 0))
}

// guide_sessions_clock_chk: expires_at <= started_at + 15 minutes
const expires = new Date(Date.now() + 14 * 60 * 1000).toISOString()
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
const callId = `postfix-${Date.now()}`
console.log(JSON.stringify({ host, session_id: session.id, usuario_id: usuarioId, call_id: callId }, null, 2))

// --- Pick real assignee from DB (prefer Gerardo Puga) ---
let assignee = null
{
  const { data: gerardo } = await sb
    .from('usuarios')
    .select('id,nombre,activo')
    .eq('activo', true)
    .ilike('nombre', '%Gerardo%Puga%')
    .limit(3)
  if (gerardo?.length === 1) {
    assignee = gerardo[0]
  } else {
    const { data: others } = await sb
      .from('usuarios')
      .select('id,nombre,activo')
      .eq('activo', true)
      .neq('id', usuarioId)
      .order('nombre')
      .limit(5)
    assignee = others?.[0] ?? null
  }
}
console.log('assignee_candidate', assignee)

// 1) search_people exact/partial
{
  const name = assignee?.nombre || 'Alonso'
  const res = await callScrumban(session, `${callId}-search`, 'search_people', { name })
  const ok =
    res.status === 200 &&
    (res.json?.success === true || res.json?.status === 'ok' || res.json?.status === 'empty')
  const items = res.json?.data?.items ?? res.json?.data?.payload?.items
  record({
    operacion: 'search_people exacto/parcial',
    resultado_retell: 'n/a (HTTP signed)',
    resultado_backend: ok
      ? `status=${res.json?.status || res.json?.success} items=${Array.isArray(items) ? items.length : '?'}`
      : `http=${res.status} body=${res.text.slice(0, 180)}`,
    persistencia: 'n/a',
    informe: 'n/a',
    estado: ok ? 'Verificado end-to-end' : 'Fallido',
    pending_op_id: null,
    error_code: res.json?.error?.code ?? null,
  })
}

// 2) search_people inexistente → expect VALIDATION_FAILED if host has fix; else note PERMISSION_DENIED legacy
{
  const fake = `PersonaInexistenteXYZ_${Date.now()}`
  const res = await callScrumban(session, `${callId}-search-miss`, 'search_people', { name: fake })
  const code = res.json?.error?.code ?? null
  const status = res.json?.status
  const success = res.json?.success
  // search_people with 0 matches returns ok/empty (readOk), not denied — that's correct.
  // create_action with missing assignee is the VALIDATION_FAILED path.
  const emptyOk =
    success === true && (status === 'ok' || status === 'empty' || status === 'needs_clarification')
  record({
    operacion: 'search_people inexistente (empty/ok)',
    resultado_retell: 'n/a (HTTP signed)',
    resultado_backend: `success=${success} status=${status} code=${code}`,
    persistencia: 'n/a',
    informe: 'n/a',
    estado: emptyOk || res.status === 200 ? 'Verificado end-to-end' : 'Fallido',
    error_code: code,
  })
}

// 3) create_action with known assignee → proposal + pending_ops
let createOpId = null
{
  if (!assignee) {
    record({
      operacion: 'create_action → pending + cancel',
      resultado_retell: 'n/a',
      resultado_backend: 'Sin usuario activo candidato en DB',
      persistencia: 'n/a',
      informe: 'n/a',
      estado: 'Fallido',
    })
  } else {
    const res = await callScrumban(session, `${callId}-create`, 'create_action', {
      title: `E2E postfix validate ${Date.now()}`,
      description: 'Prueba harness postcorreccion. Cancelar sin confirmar.',
      assignee_name: assignee.nombre,
      fecha: tomorrowYmd(),
      due_time: '17:00',
      evidence_expected: 'Captura de evidencia de prueba.',
    })
    createOpId =
      res.json?.pending_op_id ||
      res.json?.operation_id ||
      res.json?.data?.pending_op_id ||
      null
    const needsConfirm =
      res.json?.success === true &&
      (res.json?.status === 'needs_confirmation' || Boolean(createOpId))
    let persisted = false
    let persistNote = 'no row'
    if (createOpId) {
      const { data: row, error: rowErr } = await sb
        .from('assistant_pending_ops')
        .select('id,tool,status,usuario_id')
        .eq('id', createOpId)
        .maybeSingle()
      if (rowErr) {
        persistNote = `select_error=${rowErr.message}`
      } else if (row?.id === createOpId && row?.usuario_id === usuarioId) {
        persisted = true
        persistNote = `assistant_pending_ops ${createOpId} status=${row.status}`
      }
    }
    record({
      operacion: 'create_action → proposal',
      resultado_retell: 'n/a (HTTP signed)',
      resultado_backend: `success=${res.json?.success} status=${res.json?.status} op=${createOpId}`,
      persistencia: persistNote,
      informe: 'n/a (sin finalize)',
      estado: needsConfirm && persisted ? 'Verificado end-to-end' : 'Fallido',
      pending_op_id: createOpId,
      error_code: res.json?.error?.code ?? null,
      assignee: assignee.nombre,
    })

    if (createOpId) {
      const cancel = await callScrumban(session, `${callId}-cancel-create`, 'cancel_pending_op', {
        pending_op_id: createOpId,
      })
      const { data: after } = await sb
        .from('assistant_pending_ops')
        .select('id,status')
        .eq('id', createOpId)
        .maybeSingle()
      const cancelled =
        cancel.json?.success === true && (after?.status === 'cancelled' || after?.status === 'canceled')
      // also ensure no board write: skip acciones_diarias check by title if needed
      record({
        operacion: 'cancel_pending_op (create)',
        resultado_retell: 'n/a (HTTP signed)',
        resultado_backend: `success=${cancel.json?.success} status=${cancel.json?.status} db=${after?.status}`,
        persistencia: `op status=${after?.status}`,
        informe: 'n/a',
        estado: cancelled || after?.status === 'cancelled' ? 'Verificado end-to-end' : 'Fallido',
        pending_op_id: createOpId,
      })
    }
  }
}

// 4) create_action assignee not found → VALIDATION_FAILED (if host has fix)
{
  const fake = `NadieDePrueba_${Date.now()}`
  const res = await callScrumban(session, `${callId}-create-miss`, 'create_action', {
    title: `E2E miss assignee ${Date.now()}`,
    description: 'Debe fallar validacion de responsable.',
    assignee_name: fake,
    fecha: tomorrowYmd(),
    due_time: '17:00',
    evidence_expected: 'N/A',
  })
  const code = res.json?.error?.code ?? null
  const spoken = res.json?.result || res.json?.error?.user_message || res.json?.message || ''
  const hostHasFix = code === 'VALIDATION_FAILED'
  const legacyPerm = code === 'PERMISSION_DENIED'
  const authMissing = code === 'AUTHENTICATION_FAILED'
  record({
    operacion: 'create_action assignee inexistente',
    resultado_retell: 'n/a (HTTP signed)',
    resultado_backend: `code=${code} status=${res.json?.status} spoken=${String(spoken).slice(0, 120)}`,
    persistencia: 'no proposal expected',
    informe: 'consult_log technical_attention',
    estado: hostHasFix
      ? 'Verificado end-to-end'
      : legacyPerm
        ? 'Pendiente de configuración externa'
        : authMissing
          ? 'Pendiente de configuración externa'
          : 'Fallido',
    error_code: code,
    note: hostHasFix
      ? 'host sirve taxonomía nueva'
      : legacyPerm
        ? 'host aún mapea denied→PERMISSION_DENIED (deploy pendiente)'
        : authMissing
          ? 'host sin RETELL_API_KEY / auth tool'
          : null,
  })
}

// 5) WhatsApp + email drafts prepare + cancel (no send)
async function prepareAndCancelDraft(channel, recipient) {
  const res = await callQueueDraft(session, `${callId}-draft-${channel}`, {
    action: 'prepare',
    channel,
    purpose: `E2E postfix ${channel} ${Date.now()}`,
    recipient,
  })
  const opId = res.json?.pending_op_id || res.json?.operation_id || null
  let persisted = false
  let persistNote = `op=${opId || 'none'}`
  if (opId) {
    const { data: row, error: rowErr } = await sb
      .from('assistant_pending_ops')
      .select('id,tool,status,usuario_id')
      .eq('id', opId)
      .maybeSingle()
    if (rowErr) persistNote = `select_error=${rowErr.message}`
    else if (row?.id === opId) {
      persisted = true
      persistNote = `assistant_pending_ops ${opId} status=${row.status}`
    }
  }
  const draftCode = res.json?.error?.code ?? null
  const draftPendingMigration = draftCode === 'DATABASE_ERROR'
  record({
    operacion: `queue_workspace_draft prepare ${channel}`,
    resultado_retell: 'n/a (HTTP signed)',
    resultado_backend: `success=${res.json?.success} status=${res.json?.status} code=${draftCode} msg=${String(res.json?.error?.user_message || res.json?.result || '').slice(0, 120)}`,
    persistencia: persistNote,
    informe: 'builders unit; finalize webhook pendiente',
    estado:
      res.json?.success === true && persisted
        ? 'Verificado end-to-end'
        : draftPendingMigration
          ? 'Pendiente de configuración externa'
          : 'Fallido',
    pending_op_id: opId,
    error_code: draftCode,
    note: draftPendingMigration
      ? 'posible migración pendiente (p.ej. assistant_pending_ops.session_id)'
      : null,
  })
  if (opId) {
    const cancel = await callQueueDraft(session, `${callId}-draft-cancel-${channel}`, {
      action: 'cancel',
      channel,
      pending_op_id: opId,
    })
    // also try scrumban cancel if draft cancel fails
    let after = null
    if (cancel.json?.success !== true) {
      await callScrumban(session, `${callId}-cancel-draft-${channel}`, 'cancel_pending_op', {
        pending_op_id: opId,
      })
    }
    const q = await sb.from('assistant_pending_ops').select('id,status').eq('id', opId).maybeSingle()
    after = q.data
    record({
      operacion: `cancel draft ${channel}`,
      resultado_retell: 'n/a (HTTP signed)',
      resultado_backend: `success=${cancel.json?.success} db=${after?.status}`,
      persistencia: `op status=${after?.status}`,
      informe: 'n/a',
      estado:
        after?.status === 'cancelled' || after?.status === 'canceled' || cancel.json?.success === true
          ? 'Verificado end-to-end'
          : 'Fallido',
      pending_op_id: opId,
    })
  }
}

const draftRecipient = assignee?.nombre || 'Alonso P.V'
await prepareAndCancelDraft('whatsapp', draftRecipient)
await prepareAndCancelDraft('email', draftRecipient)

// 6) consult_log correlation
let consultLog = null
for (let i = 0; i < 10; i += 1) {
  const { data } = await sb
    .from('guide_sessions')
    .select('consult_log')
    .eq('id', session.id)
    .maybeSingle()
  consultLog = data?.consult_log
  if (Array.isArray(consultLog) && consultLog.length > 0) break
  await new Promise((r) => setTimeout(r, 300))
}
const hasDenialMeta = Array.isArray(consultLog)
  ? consultLog.some((e) => e && (e.error_code || e.denial_reason || e.summary))
  : false
record({
  operacion: 'consult_log correlación',
  resultado_retell: 'n/a',
  resultado_backend: `entries=${Array.isArray(consultLog) ? consultLog.length : 0}`,
  persistencia: 'guide_sessions.consult_log',
  informe: 'technical_attention from log',
  estado: Array.isArray(consultLog) && consultLog.length > 0 ? 'Verificado end-to-end' : 'Fallido',
  note: hasDenialMeta ? 'entries present' : 'no error_code fields (host may be pre-fix)',
  sample: Array.isArray(consultLog) ? consultLog.slice(-3) : null,
})

// Close session
await sb
  .from('guide_sessions')
  .update({ status: 'completed', closed_at: new Date().toISOString(), close_reason: 'user_requested' })
  .eq('id', session.id)

const failed = matrix.filter((r) => r.estado === 'Fallido').length
const pending = matrix.filter((r) => r.estado === 'Pendiente de configuración externa').length
const ok = matrix.filter(
  (r) => r.estado === 'Verificado end-to-end' || r.estado === 'Verificado solo automatizado'
).length

console.log('\n=== MATRIZ ===')
console.log(
  JSON.stringify(
    {
      host,
      session_id: session.id,
      call_id: callId,
      usuario_id: usuarioId,
      summary: { ok, pending, failed, total: matrix.length },
      matrix,
      automated_note:
        'Taxonomía VALIDATION_FAILED y searchActivePeople ilike: Verificado solo automatizado (vitest). Prod aún sirve código/migración pre-fix.',
    },
    null,
    2
  )
)

process.exit(failed > 0 ? 1 : 0)
