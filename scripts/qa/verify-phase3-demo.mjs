#!/usr/bin/env node
/**
 * SCRUMBAN Phase 3 — Verificador Live Local de Demostración Comercial ($0 USD).
 *
 * Valida:
 *   1..8A: Flujo comercial completo (Diagnóstico, Prioridades/Riesgos, Bloqueo + R3,
 *          Recomendación, Compromiso vía Voz es-MX + borrador R2, Aprobación y escritura
 *          real local PG, Verificación bajo RLS, Continuidad multicanal Voz $0)
 *   8B:    Fallback honesto HTTP 503 sin LLM externo (cero IA falsa, $0 USD)
 *   8C:    Respuesta clara por voz ante permisos insuficientes (rol consulta)
 *
 * Limpia únicamente los registros transaccionales de prueba y conserva intacto [DEMO-CORP].
 */
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.PHASE3_BASE_URL || 'http://127.0.0.1:5179'
const sbUrl = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!sbUrl || !anonKey || !serviceKey) {
  throw new Error('Faltan variables de Supabase Local (.qa/text-complete-local.env)')
}
const parsedUrl = new URL(sbUrl)
if (parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
  throw new Error(`ABORTADO FAIL-CLOSED: ${sbUrl} no es Supabase Local`)
}

const ownerClient = createClient(sbUrl, anonKey, { auth: { persistSession: false } })
const readonlyClient = createClient(sbUrl, anonKey, { auth: { persistSession: false } })
const admin = createClient(sbUrl, serviceKey, { auth: { persistSession: false } })

const { data: ownerAuth, error: ownerErr } = await ownerClient.auth.signInWithPassword({
  email: process.env.TC_QA_SUPER_ADMIN_EMAIL,
  password: process.env.TC_QA_SUPER_ADMIN_PASSWORD,
})
if (ownerErr || !ownerAuth.session) {
  throw new Error('Owner login fail: ' + (ownerErr?.message || 'sin sesión'))
}
const ownerJwt = ownerAuth.session.access_token

const { data: roAuth, error: roErr } = await readonlyClient.auth.signInWithPassword({
  email: process.env.TC_QA_DIRECCION_EMAIL,
  password: process.env.TC_QA_DIRECCION_PASSWORD,
})
if (roErr || !roAuth.session) {
  throw new Error('Read-only login fail: ' + (roErr?.message || 'sin sesión'))
}
const roJwt = roAuth.session.access_token

async function chat(jwt, content, opts = {}) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/gemini-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      mode: 'operativo',
      channel: opts.channel || 'web',
      conversationId: opts.conversationId || 'demo-phase3-session',
      messages: [...(opts.history || []), { role: 'user', content }],
    }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ms: Date.now() - t0, body }
}

const results = []
let createdActionId = null
let createdPendingOpId = null

try {
  // Step 1: Diagnóstico empresarial
  const s1 = await chat(ownerJwt, '¿Qué necesita mi atención hoy?')
  const a1 = String(s1.body.answer || '')
  results.push({
    step: 1,
    name: 'Diagnostico empresarial (Web, $0)',
    status: s1.status,
    ms: s1.ms,
    ok: s1.status === 200 && a1.length > 20 && /DEMO-CORP|bloquead|retraso|prioridad|atenci[oó]n/i.test(a1),
    preview: a1.slice(0, 140),
  })

  // Step 2: Prioridades y riesgos
  const s2 = await chat(ownerJwt, '¿Cuáles son los principales riesgos y prioridades?')
  const a2 = String(s2.body.answer || '')
  results.push({
    step: 2,
    name: 'Prioridades y riesgos (Web, $0)',
    status: s2.status,
    ms: s2.ms,
    ok: s2.status === 200 && a2.length > 20,
    preview: a2.slice(0, 140),
  })

  // Step 3: Análisis de bloqueo + documento R3
  const s3a = await chat(ownerJwt, '¿Qué está frenando a mi equipo?')
  const s3b = await chat(ownerJwt, 'Busca en los documentos la política de escalamiento de bloqueos')
  const a3a = String(s3a.body.answer || '')
  const a3b = String(s3b.body.answer || '')
  const hasDoc = /24 horas|escalamiento|Finanzas|Direcci[oó]n|pol[ií]tica|DEMO-CORP/i.test(a3b)
  results.push({
    step: 3,
    name: 'Analisis de bloqueo + recuperacion documental R3',
    status: s3a.status === 200 && s3b.status === 200 ? 200 : Math.max(s3a.status, s3b.status),
    ms: s3a.ms + s3b.ms,
    ok: s3a.status === 200 && s3b.status === 200 && a3a.length > 20 && hasDoc,
    blockerPreview: a3a.slice(0, 120),
    docPreview: a3b.slice(0, 120),
  })

  // Step 4: Recomendación concreta
  const s4 = await chat(ownerJwt, '¿Qué decisiones debería tomar?')
  const a4 = String(s4.body.answer || '')
  results.push({
    step: 4,
    name: 'Recomendacion ejecutiva concreta',
    status: s4.status,
    ms: s4.ms,
    ok: s4.status === 200 && a4.length > 20,
    preview: a4.slice(0, 140),
  })

  // Step 5: Creación de compromiso vía Voz (R4 + R2 draft)
  const s5 = await chat(
    ownerJwt,
    'Crea una acción para dar seguimiento a la validación fiscal Monterrey el viernes',
    { channel: 'voice' }
  )
  const proposal = Array.isArray(s5.body.proposals) ? s5.body.proposals[0] : null
  createdPendingOpId = proposal?.op_id || proposal?.opId || proposal?.id || null
  const spoken = String(s5.body.spokenText || '')
  const voiceReadiness = s5.body.voice || {}
  const cleanVoice =
    spoken.length > 0 &&
    !/https?:\/\//i.test(spoken) &&
    !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(spoken) &&
    !/[`*_#]/.test(spoken)
  results.push({
    step: 5,
    name: 'Compromiso via Voz es-MX + borrador R2',
    status: s5.status,
    ms: s5.ms,
    ok:
      s5.status === 200 &&
      Boolean(createdPendingOpId) &&
      cleanVoice &&
      voiceReadiness.externalPaidCallsActive === false,
    sttProvider: voiceReadiness.sttProvider,
    ttsProvider: voiceReadiness.ttsProvider,
    pendingOpIdPresent: Boolean(createdPendingOpId),
    spokenPreview: spoken.slice(0, 150),
  })

  // Step 6: Aprobación y ejecución real local
  if (createdPendingOpId) {
    const t0 = Date.now()
    const apRes = await fetch(`${BASE}/api/assistant-ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
      body: JSON.stringify({ action: 'confirm', op_id: createdPendingOpId }),
    })
    const apBody = await apRes.json().catch(() => ({}))
    createdActionId =
      apBody.result?.accion?.id ||
      apBody.result?.id ||
      apBody.accion_id ||
      apBody.data?.id ||
      null
    results.push({
      step: 6,
      name: 'Aprobacion R2 y ejecucion real local PG',
      status: apRes.status,
      ms: Date.now() - t0,
      ok:
        apRes.status === 200 &&
        (apBody.status === 'executed' || apBody.status === 'confirmed' || apBody.ok === true || Boolean(createdActionId)),
      resultStatus: apBody.status || null,
    })
  } else {
    results.push({
      step: 6,
      name: 'Aprobacion R2 y ejecucion real local PG',
      ok: false,
      reason: 'No op_id from step 5',
    })
  }

  // Step 7: Verificación del resultado bajo RLS
  const { data: verifiedRows } = await ownerClient
    .from('acciones_diarias')
    .select('id,titulo_accion,estado,prioridad,fecha')
    .ilike('titulo_accion', '%validación fiscal Monterrey%')
  const foundRow = verifiedRows?.[0] || null
  if (!createdActionId && foundRow?.id) createdActionId = foundRow.id
  results.push({
    step: 7,
    name: 'Verificacion real en tablero bajo RLS',
    ok: Boolean(foundRow),
    verifiedTitle: foundRow?.titulo_accion || null,
    verifiedStatus: foundRow?.estado || null,
  })

  // Step 8A: Continuidad voz multicanal
  const s8a = await chat(ownerJwt, '¿Qué está frenando a mi equipo?', { channel: 'voice' })
  results.push({
    step: '8A',
    name: 'Continuidad voz multicanal $0',
    status: s8a.status,
    ms: s8a.ms,
    ok:
      s8a.status === 200 &&
      Boolean(s8a.body.spokenText) &&
      s8a.body.voice?.externalPaidCallsActive === false,
    spokenPreview: String(s8a.body.spokenText || '').slice(0, 140),
  })

  // Step 8B: Fallback honesto cuando LLM no disponible (cero IA falsa)
  const s8b = await chat(ownerJwt, 'Explícame con una metáfora filosófica la cultura organizacional del siglo XXI')
  results.push({
    step: '8B',
    name: 'Fallback honesto sin LLM (HTTP 503 transparente, $0)',
    status: s8b.status,
    ms: s8b.ms,
    ok:
      s8b.status === 503 &&
      s8b.body.llmProvider === 'orchestrator_only_no_llm' &&
      s8b.body.retryable === false &&
      Boolean(s8b.body.error),
    llmProvider: s8b.body.llmProvider,
    errorPreview: String(s8b.body.error || '').slice(0, 150),
  })

  // Step 8C: Permisos insuficientes claros por Voz (rol consulta)
  const s8c = await chat(
    roJwt,
    'Crea una acción para dar seguimiento a la validación fiscal Monterrey el viernes',
    { channel: 'voice', conversationId: 'demo-phase3-ro' }
  )
  results.push({
    step: '8C',
    name: 'Permisos insuficientes claros por Voz (rol consulta)',
    status: s8c.status,
    ms: s8c.ms,
    ok:
      s8c.status === 200 &&
      (s8c.body.proposals?.length ?? 0) === 0 &&
      /consulta|permiso|no puede/i.test(String(s8c.body.spokenText || '')),
    spokenPreview: String(s8c.body.spokenText || '').slice(0, 140),
  })

  const summary = {
    budgetSpentUsd: 0,
    allPassed: results.every((r) => r.ok),
    passedCount: results.filter((r) => r.ok).length,
    totalCount: results.length,
    results,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!summary.allPassed) process.exitCode = 1
} finally {
  if (createdActionId) {
    await admin.from('acciones_diarias').delete().eq('id', createdActionId)
  }
  if (createdPendingOpId) {
    await admin.from('assistant_pending_ops').delete().eq('id', createdPendingOpId)
  }
}
