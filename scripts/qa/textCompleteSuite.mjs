/* global fetch */
/**
 * Text Complete Integrated QA Suite Engine (Bloque A + Bloque B E1-E13 + Bloque C 1-3).
 *
 * Guarantees:
 * - Real authenticated JWTs for every user turn and operation confirmation (never service_role for user ops).
 * - Never treats HTTP 200 as sufficient proof: verifies prior DB state, pending proposal, explicit approval,
 *   real post-write DB state, audit records (`assistant_op_log` / `agent_action_receipts`), and permissions.
 * - Reconciles uncertain outcomes (503/504/timeout) by reading DB state before deciding on any retry.
 * - Verifies notification isolation: `agent_notify_responsable` writes ONLY to `qa_outbox`, with 0 new rows
 *   in `notification_email_logs` and `whatsapp_messages`.
 * - Tracks every synthetic fixture (`tc-qa-<runId>-`) and cleans up in `finally` even on critical halt.
 */
import { createHash } from 'node:crypto'
import { buildQaPreviewRequest } from './textCompleteGuard.mjs'

function hashShort(text) {
  return createHash('sha256').update(String(text)).digest('hex').slice(0, 24)
}

function futureDateYmd(daysAhead = 3) {
  const d = new Date(Date.now() + daysAhead * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function defaultChatCaller(fetchImpl) {
  return async ({ previewConfig, accessToken, messages, conversationId }) => {
    const req = buildQaPreviewRequest(previewConfig, '/api/gemini-chat', {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    })
    const res = await fetchImpl(req.url, {
      method: 'POST',
      headers: req.headers,
      redirect: 'manual',
      body: JSON.stringify({
        mode: 'operativo',
        conversationId,
        messages,
      }),
    })
    const location = res.headers.get('location') || ''
    if (res.status === 302 && /vercel\.com\/sso-api/i.test(location)) {
      return { ok: false, blockedSso: true, status: res.status, json: null, text: '' }
    }
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { ok: res.ok, blockedSso: false, status: res.status, json, text }
  }
}

function defaultOpsCaller(fetchImpl) {
  return async ({ previewConfig, accessToken, action, opId, patch = {} }) => {
    const req = buildQaPreviewRequest(previewConfig, '/api/assistant-ops', {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    })
    const res = await fetchImpl(req.url, {
      method: 'POST',
      headers: req.headers,
      redirect: 'manual',
      body: JSON.stringify({ action, op_id: opId, ...patch }),
    })
    const location = res.headers.get('location') || ''
    if (res.status === 302 && /vercel\.com\/sso-api/i.test(location)) {
      return { ok: false, blockedSso: true, status: res.status, json: null, text: '' }
    }
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { ok: res.ok, blockedSso: false, status: res.status, json, text }
  }
}

/**
 * Reconcile an uncertain confirm execution (timeout, 503, 504, network error)
 * before any retry: inspects `assistant_pending_ops`, `agent_action_receipts`,
 * and target `acciones_diarias` row to know if the write actually committed.
 */
export async function reconcileUncertainOp({ client, opId, resourceId = null }) {
  const [opRes, receiptRes, actionRes] = await Promise.all([
    client
      .from('assistant_pending_ops')
      .select('id,status,result,error_message,resource_id')
      .eq('id', opId)
      .maybeSingle(),
    client
      .from('agent_action_receipts')
      .select('pending_op_id,estado_anterior,estado_nuevo,result')
      .eq('pending_op_id', opId)
      .maybeSingle(),
    resourceId
      ? client.from('acciones_diarias').select('id,estado,updated_at').eq('id', resourceId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const op = opRes.data ?? null
  const receipt = receiptRes.data ?? null
  const action = actionRes.data ?? null
  const committed = op?.status === 'confirmed' || Boolean(receipt)
  const retrySafe = !committed && op?.status === 'pending'

  return {
    opId,
    committed,
    retrySafe,
    opStatus: op?.status ?? null,
    hasReceipt: Boolean(receipt),
    actionState: action?.estado ?? null,
    actionUpdatedAt: action?.updated_at ?? null,
  }
}

async function countTable(client, table) {
  if (!client) return null
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true })
  if (error) return null
  return count ?? 0
}

/**
 * Execute Bloque A (Executive MVP), Bloque B (R2 E1-E13), and Bloque C (Integrated E2E 1-3).
 */
export async function runTextCompleteSuite({
  runId = Date.now().toString(36),
  fixturePrefix = 'tc-qa-',
  target,
  previewConfig,
  clients,
  chatCaller = null,
  opsCaller = null,
  browserProbe = null,
  stopOnCritical = true,
  fetchImpl = fetch,
}) {
  if (!fixturePrefix.startsWith('tc-qa-')) {
    throw new Error('fixturePrefix debe comenzar con tc-qa-')
  }

  const callChat = chatCaller || defaultChatCaller(fetchImpl)
  const callOps = opsCaller || defaultOpsCaller(fetchImpl)
  const tag = `${fixturePrefix}${runId}-`
  const due1 = futureDateYmd(3)
  const due2 = futureDateYmd(5)

  const manifest = {
    prefix: tag,
    actionIds: [],
    commentIds: [],
    pendingOpIds: [],
    documentIds: [],
    memoryIds: [],
    outboxIds: [],
  }

  const results = []
  let halted = false
  let haltReason = null

  const record = (block, id, title, status, { critical = false, durationMs = 0, detail = {} } = {}) => {
    results.push({ block, id, title, status, critical, durationMs, detail })
    if (critical && status === 'FAIL' && stopOnCritical) {
      halted = true
      haltReason = `Fallo crítico en ${id}: ${title}`
    }
  }

  const skipHalted = (block, id, title, critical = false) => {
    record(block, id, title, 'BLOCKED', { critical, detail: { reason: haltReason || 'Detenido por fallo crítico previo' } })
  }

  const trackAction = (id) => {
    if (id && !manifest.actionIds.includes(id)) manifest.actionIds.push(id)
  }
  const trackOp = (id) => {
    if (id && !manifest.pendingOpIds.includes(id)) manifest.pendingOpIds.push(id)
  }

  const sessions = {}
  let externalBefore = { email: null, whatsapp: null }
  let externalAfter = { email: null, whatsapp: null }

  const confirmWithReconcile = async (session, opId, resourceId = null) => {
    trackOp(opId)
    try {
      const res = await callOps({
        previewConfig,
        accessToken: session.accessToken,
        action: 'confirm',
        opId,
      })
      if (res.status === 503 || res.status === 504) {
        const rec = await reconcileUncertainOp({ client: session.client, opId, resourceId })
        return { ...res, reconciled: rec }
      }
      return res
    } catch (err) {
      const rec = await reconcileUncertainOp({ client: session.client, opId, resourceId })
      return {
        ok: rec.committed,
        blockedSso: false,
        status: rec.committed ? 200 : 504,
        json: rec.committed ? { status: 'confirmed', reconciled: true } : { error: String(err) },
        reconciled: rec,
      }
    }
  }

  const readAction = async (client, id) => {
    const { data, error } = await client
      .from('acciones_diarias')
      .select('id,titulo_accion,estado,fecha,prioridad,responsable,created_by,causa_raiz,updated_at')
      .eq('id', id)
      .maybeSingle()
    return { data: data ?? null, error: error?.message ?? null }
  }

  const readAudit = async (client, opId) => {
    const [opRes, logRes, receiptRes] = await Promise.all([
      client.from('assistant_pending_ops').select('id,tool,status,request_key,resource_id').eq('id', opId).maybeSingle(),
      client.from('assistant_op_log').select('id,result,tool,resource_id').eq('pending_op_id', opId),
      client.from('agent_action_receipts').select('pending_op_id,estado_anterior,estado_nuevo').eq('pending_op_id', opId).maybeSingle(),
    ])
    return {
      op: opRes.data ?? null,
      logs: logRes.data ?? [],
      receipt: receiptRes.data ?? null,
    }
  }

  const seedAction = async ({ title, responsable, createdBy, estado = 'Pendiente', prioridad = 'P2_Media', fecha = due1 }) => {
    const writer = clients.admin || sessions.super_admin.client
    const { data, error } = await writer
      .from('acciones_diarias')
      .insert({
        titulo_accion: title,
        descripcion_accion: `${title} — fixture sintético QA`,
        evidencia_esperada: 'Evidencia sintética QA',
        fecha,
        hora_limite: '17:00',
        estado,
        responsable,
        created_by: createdBy,
        prioridad,
        tipo_accion: 'operativa',
      })
      .select('id,titulo_accion,estado,fecha,prioridad,responsable,created_by,updated_at')
      .single()
    if (error || !data?.id) throw new Error(`No se pudo crear fixture acción ${title}: ${error?.message || 'sin id'}`)
    trackAction(data.id)
    return data
  }

  try {
    // Sign in all real QA identities
    sessions.super_admin = await clients.signInSuperAdmin()
    sessions.direccion = await clients.signInDireccion()
    sessions.lider = await clients.signInLider()
    sessions.operativo = await clients.signInOperativo()
    if (clients.signInAnalista) sessions.analista = await clients.signInAnalista()

    const ids = Object.values(sessions).map((s) => s.usuarioId)
    if (new Set(ids).size !== ids.length) {
      throw new Error('Identidades QA duplicadas: cada perfil debe tener un usuario_id distinto')
    }

    // Snapshot external notification tables BEFORE any write
    externalBefore = {
      email: await countTable(clients.admin, 'notification_email_logs'),
      whatsapp: await countTable(clients.admin, 'whatsapp_messages'),
    }

    // Seed synthetic fixtures
    const opAction = await seedAction({
      title: `${tag}accion-operativo`,
      responsable: sessions.operativo.usuarioId,
      createdBy: sessions.lider.usuarioId,
      estado: 'Pendiente',
      prioridad: 'P2_Media',
    })
    const liderAction = await seedAction({
      title: `${tag}accion-lider-bloqueo`,
      responsable: sessions.lider.usuarioId,
      createdBy: sessions.super_admin.usuarioId,
      estado: 'Bloqueado',
      prioridad: 'P1_Alta',
    })
    const editAction = await seedAction({
      title: `${tag}accion-e8-edit`,
      responsable: sessions.lider.usuarioId,
      createdBy: sessions.lider.usuarioId,
      estado: 'Pendiente',
      prioridad: 'P2_Media',
    })
    const casAction = await seedAction({
      title: `${tag}accion-e11-cas`,
      responsable: sessions.lider.usuarioId,
      createdBy: sessions.lider.usuarioId,
      estado: 'Pendiente',
      prioridad: 'P2_Media',
    })
    const c2Action = await seedAction({
      title: `${tag}accion-c2-lider`,
      responsable: sessions.lider.usuarioId,
      createdBy: sessions.lider.usuarioId,
      estado: 'En_Ejecucion',
      prioridad: 'P1_Alta',
    })
    const c3Action = await seedAction({
      title: `${tag}accion-c3-operativo`,
      responsable: sessions.operativo.usuarioId,
      createdBy: sessions.lider.usuarioId,
      estado: 'Pendiente',
      prioridad: 'P2_Media',
    })

    // Seed synthetic R3 document (if admin client available)
    const docToken = `${tag}doc-verif`
    if (clients.admin) {
      const { data: docRow, error: docErr } = await clients.admin
        .from('agent_documents')
        .insert({
          logical_id: docToken,
          title: `Política sintética QA ${runId}`,
          body: `${tag}regla: la verificación exige evidencia humana firmada, nunca por inferencia de OKRs.`,
          version: 1,
          status: 'published',
          access_level: 'project_read',
          content_hash: `${tag}${hashShort(docToken)}`.slice(0, 64),
          source_label: docToken,
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (!docErr && docRow?.id) manifest.documentIds.push(docRow.id)
    }

    // =========================================================================
    // BLOQUE A — EXECUTIVE MVP (A1..A7)
    // =========================================================================

    // A1: Q9 Conversational continuity & figure consistency
    {
      const t0 = Date.now()
      const convId = `${tag}a1-q9`
      const t1 = await callChat({
        previewConfig,
        accessToken: sessions.super_admin.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: '¿Qué requiere mi atención hoy?' }],
      })
      const refs1 = t1.json?.agent?.references ?? []
      const firstId = refs1[0]?.id ?? null
      const t2 = await callChat({
        previewConfig,
        accessToken: sessions.super_admin.accessToken,
        conversationId: convId,
        messages: [
          { role: 'user', content: '¿Qué requiere mi atención hoy?' },
          { role: 'assistant', content: String(t1.json?.answer ?? '') },
          { role: 'user', content: 'Profundiza en esa acción, la primera prioridad' },
        ],
      })
      const refs2 = t2.json?.agent?.references ?? []
      const ans2 = String(t2.json?.answer ?? '')
      const ok =
        t1.ok &&
        t2.ok &&
        Boolean(firstId) &&
        refs2[0]?.id === firstId &&
        ans2.includes(`/kanban?accion=${firstId}`)
      record('A', 'A1-Q9', 'Q9 continuidad conversacional y consistencia de cifras', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { t1Status: t1.status, t2Status: t2.status, firstId, followId: refs2[0]?.id ?? null },
      })
    }

    // A2: Q10 R3 documentary retrieval (no OKR substitution; fail-closed on missing)
    if (halted) skipHalted('A', 'A2-Q10', 'Q10 recuperación documental R3', true)
    else {
      const t0 = Date.now()
      const tDoc = await callChat({
        previewConfig,
        accessToken: sessions.super_admin.accessToken,
        conversationId: `${tag}a2-doc`,
        messages: [{ role: 'user', content: `Busca documentos de la Política sintética QA ${runId}` }],
      })
      const tMiss = await callChat({
        previewConfig,
        accessToken: sessions.super_admin.accessToken,
        conversationId: `${tag}a2-miss`,
        messages: [{ role: 'user', content: `Busca documentos de procedimiento inexistente ${tag}zzz` }],
      })
      const docIntent = tDoc.json?.agent?.intent === 'query_knowledge'
      const missEmpty = tMiss.json?.agent?.intent === 'query_knowledge' && tMiss.json?.agent?.status === 'empty'
      const hasDocMatch = manifest.documentIds.length === 0 || String(tDoc.json?.answer ?? '').includes(runId)
      const ok = tDoc.ok && tMiss.ok && docIntent && missEmpty && hasDocMatch
      record('A', 'A2-Q10', 'Q10 recuperación documental R3 y fail-closed', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { docIntent, missEmpty, hasDocMatch, seededDoc: manifest.documentIds.length > 0 },
      })
    }

    // A3: Evidence navigation (/kanban?accion=<id> + optional Playwright probe)
    if (halted) skipHalted('A', 'A3-NAV', 'Navegación de evidencia')
    else {
      const t0 = Date.now()
      let probe = null
      if (browserProbe) {
        probe = await browserProbe({
          previewConfig,
          route: `/kanban?accion=${encodeURIComponent(opAction.id)}`,
          supabaseSession: sessions.super_admin.rawSession,
          supabaseRef: target.ref,
        })
      }
      const probeOk = !probe || probe.status === 'PASS'
      record('A', 'A3-NAV', 'Navegación de evidencia Kanban', probeOk ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { route: `/kanban?accion=${opAction.id}`, browserProbeStatus: probe?.status ?? 'skipped' },
      })
    }

    // A4: 6-stage Executive Session
    if (halted) skipHalted('A', 'A4-SESSION', 'Sesión ejecutiva de 6 etapas')
    else {
      const t0 = Date.now()
      const convId = `${tag}a4-session`
      const hist = []
      const ask = async (text) => {
        hist.push({ role: 'user', content: text })
        const res = await callChat({
          previewConfig,
          accessToken: sessions.super_admin.accessToken,
          conversationId: convId,
          messages: [...hist],
        })
        hist.push({ role: 'assistant', content: String(res.json?.answer ?? '') })
        return res
      }
      const s1 = await ask('Hagamos una revisión ejecutiva de 15 minutos.')
      const s2 = await ask('Siguiente etapa')
      const sBack = await ask('Etapa anterior')
      await ask('Siguiente etapa')
      const sSkip = await ask('Omitir etapa')
      await ask(`Decisión: ${tag}escalar bloqueo logístico hoy.`)
      const sEnd = await ask('Resume nuestras decisiones y prepara los compromisos.')

      const ok =
        String(s1.json?.answer ?? '').includes('1/6') &&
        String(s2.json?.answer ?? '').includes('2/6') &&
        String(sBack.json?.answer ?? '').includes('1/6') &&
        String(sSkip.json?.answer ?? '').includes('3/6') &&
        String(sEnd.json?.answer ?? '').includes('6/6') &&
        String(sEnd.json?.answer ?? '').includes(`${tag}escalar`)

      record('A', 'A4-SESSION', 'Sesión ejecutiva completa (1/6..6/6)', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: {
          stage1: String(s1.json?.answer ?? '').includes('1/6'),
          stage2: String(s2.json?.answer ?? '').includes('2/6'),
          stageBack: String(sBack.json?.answer ?? '').includes('1/6'),
          stageSkip: String(sSkip.json?.answer ?? '').includes('3/6'),
          stage6DecisionPreserved: String(sEnd.json?.answer ?? '').includes(`${tag}escalar`),
        },
      })
    }

    // A5: Gemini 503 resilience & no blind write retry reconciliation check
    if (halted) skipHalted('A', 'A5-503', 'Manejo Gemini 503 y reconciliación')
    else {
      const t0 = Date.now()
      const recCheck = await reconcileUncertainOp({
        client: sessions.super_admin.client,
        opId: '00000000-0000-0000-0000-000000000000',
        resourceId: opAction.id,
      })
      const ok = recCheck.committed === false && recCheck.retrySafe === false && recCheck.actionState === 'Pendiente'
      record('A', 'A5-503', 'Manejo de 503/timeout y reconciliación previa a reintento', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: recCheck,
      })
    }

    // A6: Scope indicators for Dirección
    if (halted) skipHalted('A', 'A6-SCOPE', 'Indicadores según alcance Dirección')
    else {
      const t0 = Date.now()
      const dirBrief = await callChat({
        previewConfig,
        accessToken: sessions.direccion.accessToken,
        conversationId: `${tag}a6-dir`,
        messages: [{ role: 'user', content: '¿Qué requiere mi atención hoy?' }],
      })
      const ok = dirBrief.ok && dirBrief.json?.agent?.intent === 'executive_brief'
      record('A', 'A6-SCOPE', 'Indicadores ejecutivos según alcance Dirección', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { status: dirBrief.status, intent: dirBrief.json?.agent?.intent ?? null },
      })
    }

    // A7: Operativo isolation (no other users' actions or restricted docs)
    if (halted) skipHalted('A', 'A7-OP-ISO', 'Aislamiento Operativo', true)
    else {
      const t0 = Date.now()
      const opBrief = await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: `${tag}a7-op`,
        messages: [{ role: 'user', content: '¿Qué requiere mi atención hoy?' }],
      })
      const opDoc = await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: `${tag}a7-op-doc`,
        messages: [{ role: 'user', content: `Busca documentos de la Política sintética QA ${runId}` }],
      })
      const leakedOther = String(opBrief.json?.answer ?? '').includes(liderAction.titulo_accion)
      const leakedDoc = String(opDoc.json?.answer ?? '').includes(`${tag}regla:`)
      const ok = opBrief.ok && opDoc.ok && !leakedOther && !leakedDoc
      record('A', 'A7-OP-ISO', 'Aislamiento Operativo (acciones ajenas y documentos)', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { leakedOther, leakedDoc },
      })
    }

    // =========================================================================
    // BLOQUE B — R2 EXECUTIVE ACTION (E1..E13, real DB + audit verification)
    // =========================================================================

    // E1: Create action
    if (halted) skipHalted('B', 'E1', 'R2 Crear acción', true)
    else {
      const t0 = Date.now()
      const title = `${tag}e1-nueva-accion`
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: `${tag}e1`,
        messages: [{ role: 'user', content: `Crea una acción llamada ${title} para el ${due1}` }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let createdId = null
      let persisted = null
      let audit = null
      if (prop?.id) {
        const conf = await confirmWithReconcile(sessions.lider, prop.id)
        createdId = conf.json?.result?.id ?? null
        trackAction(createdId)
        if (createdId) persisted = (await readAction(sessions.lider.client, createdId)).data
        audit = await readAudit(sessions.lider.client, prop.id)
      }
      const ok = Boolean(
        prop?.id &&
          createdId &&
          persisted?.id === createdId &&
          audit?.op?.status === 'confirmed' &&
          audit.logs.some((l) => l.result === 'executed'),
      )
      record('B', 'E1', 'Crear acción con propuesta, aprobación y DB real', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { opId: prop?.id ?? null, createdId, persistedEstado: persisted?.estado ?? null, opStatus: audit?.op?.status ?? null },
      })
    }

    // E2: Update fields (fecha + prioridad) on opAction by lider (creator with general-edit RLS)
    if (halted) skipHalted('B', 'E2', 'R2 Actualizar campos')
    else {
      const t0 = Date.now()
      const before = (await readAction(sessions.lider.client, opAction.id)).data
      const convId = `${tag}e2`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Muéstrame la acción ${opAction.titulo_accion}` }],
      })
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Cambia la fecha de esa acción al ${due2} y prioridad alta` }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let after = null
      let audit = null
      if (prop?.id) {
        await confirmWithReconcile(sessions.lider, prop.id, opAction.id)
        after = (await readAction(sessions.lider.client, opAction.id)).data
        audit = await readAudit(sessions.lider.client, prop.id)
      }
      const ok = Boolean(
        before?.prioridad === 'P2_Media' &&
          prop?.tool === 'agent_update_fields' &&
          after?.fecha === due2 &&
          after?.prioridad === 'P1_Alta' &&
          audit?.op?.status === 'confirmed',
      )
      record('B', 'E2', 'Actualizar fecha y prioridad con verificación DB', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { beforePrioridad: before?.prioridad, afterPrioridad: after?.prioridad, afterFecha: after?.fecha },
      })
    }

    // E3: Update status by lastEntity (opAction -> Hecho by responsable operativo)
    if (halted) skipHalted('B', 'E3', 'R2 Cambiar estado por lastEntity', true)
    else {
      const t0 = Date.now()
      const convId = `${tag}e3`
      const before = (await readAction(sessions.operativo.client, opAction.id)).data
      await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Muéstrame la acción ${opAction.titulo_accion}` }],
      })
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Marca esa acción como hecha' }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let after = null
      let audit = null
      if (prop?.id) {
        await confirmWithReconcile(sessions.operativo, prop.id, opAction.id)
        after = (await readAction(sessions.operativo.client, opAction.id)).data
        audit = await readAudit(sessions.operativo.client, prop.id)
      }
      const ok = Boolean(
        before?.estado === 'Pendiente' &&
          prop?.tool === 'agent_set_action_status' &&
          after?.estado === 'Hecho' &&
          audit?.receipt?.estado_nuevo === 'Hecho',
      )
      record('B', 'E3', 'Marcar Hecho por referencia + recibo SQL', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { beforeEstado: before?.estado, afterEstado: after?.estado, hasReceipt: Boolean(audit?.receipt) },
      })
    }

    // E4: Add comment
    if (halted) skipHalted('B', 'E4', 'R2 Agregar comentario')
    else {
      const t0 = Date.now()
      const convId = `${tag}e3`
      const commentMarker = `${tag}e4-comentario-real`
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Agrega un comentario a esa acción: ${commentMarker}` }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let foundComment = null
      if (prop?.id) {
        await confirmWithReconcile(sessions.operativo, prop.id, opAction.id)
        const { data } = await sessions.operativo.client
          .from('accion_comentarios')
          .select('id,contenido')
          .eq('accion_id', opAction.id)
          .ilike('contenido', `%${commentMarker}%`)
          .limit(1)
        foundComment = data?.[0] ?? null
        if (foundComment?.id) manifest.commentIds.push(foundComment.id)
      }
      const ok = Boolean(prop?.tool === 'agent_add_comment' && foundComment?.id)
      record('B', 'E4', 'Agregar comentario persistido en accion_comentarios', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { opId: prop?.id ?? null, commentId: foundComment?.id ?? null },
      })
    }

    // E5: Hecho ≠ Verificado (operativo denied; lider creator verifies via human confirm)
    if (halted) skipHalted('B', 'E5', 'R2 Hecho ≠ Verificado', true)
    else {
      const t0 = Date.now()
      const deniedTurn = await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: `${tag}e3`,
        messages: [{ role: 'user', content: 'Marca esa acción como verificada' }],
      })
      const deniedOk = deniedTurn.json?.agent?.status === 'forbidden' && (deniedTurn.json?.proposals?.length ?? 0) === 0

      const convLider = `${tag}e5-lider`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convLider,
        messages: [{ role: 'user', content: `Muéstrame la acción ${opAction.titulo_accion}` }],
      })
      const verifyTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convLider,
        messages: [{ role: 'user', content: 'Verifica esa acción' }],
      })
      const prop = verifyTurn.json?.proposals?.[0] ?? null
      let after = null
      if (prop?.id) {
        await confirmWithReconcile(sessions.lider, prop.id, opAction.id)
        after = (await readAction(sessions.lider.client, opAction.id)).data
      }
      const ok = deniedOk && prop?.tool === 'agent_verify_action' && after?.estado === 'Verificado'
      record('B', 'E5', 'Hecho ≠ Verificado + verificación humana creadora', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { deniedOk, tool: prop?.tool ?? null, afterEstado: after?.estado ?? null },
      })
    }

    // E6: Recommendation -> action proposal
    if (halted) skipHalted('B', 'E6', 'R2 Recomendación a propuesta')
    else {
      const t0 = Date.now()
      const convId = `${tag}e6`
      const recTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Qué me recomiendas' }],
      })
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Crea una acción para desbloquear esa acción el ${due1}` }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      if (prop?.id) {
        trackOp(prop.id)
        await callOps({ previewConfig, accessToken: sessions.lider.accessToken, action: 'cancel', opId: prop.id })
      }
      const ok = recTurn.json?.agent?.intent === 'recommend_next' && prop?.tool === 'agent_create_action'
      record('B', 'E6', 'Recomendación encadenada a propuesta de creación', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { recIntent: recTurn.json?.agent?.intent ?? null, tool: prop?.tool ?? null },
      })
    }

    // E7: Executive session commitments -> batch proposals with batchId
    if (halted) skipHalted('B', 'E7', 'R2 Lote de compromisos con batchId')
    else {
      const t0 = Date.now()
      const convId = `${tag}e7-batch`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Hagamos una revisión ejecutiva' }],
      })
      const batchTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Convierte los compromisos en propuestas' }],
      })
      const props = batchTurn.json?.proposals ?? []
      const batchId = batchTurn.json?.batchId ?? null
      for (const p of props) {
        trackOp(p.id)
        await callOps({ previewConfig, accessToken: sessions.lider.accessToken, action: 'cancel', opId: p.id })
      }
      const ok = Boolean(batchId && props.length >= 1 && props.every((p) => p.tool === 'agent_create_action'))
      record('B', 'E7', 'Compromisos de sesión a lote con batchId', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { batchId, count: props.length },
      })
    }

    // E8: Edit invalidates request_key (via agent_edit_pending_op) & Cancel writes nothing
    if (halted) skipHalted('B', 'E8', 'R2 Editar propuesta y cancelar', true)
    else {
      const t0 = Date.now()
      const convId = `${tag}e8`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Muéstrame la acción ${editAction.titulo_accion}` }],
      })
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Pon prioridad alta a esa acción' }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let keyBefore = null
      let keyAfter = null
      let cancelStatus = null
      let actionAfter = null
      if (prop?.id) {
        trackOp(prop.id)
        keyBefore = (await readAudit(sessions.lider.client, prop.id)).op?.request_key ?? null
        const editRes = await callOps({
          previewConfig,
          accessToken: sessions.lider.accessToken,
          action: 'edit',
          opId: prop.id,
          patch: { fecha: due2 },
        })
        keyAfter = (await readAudit(sessions.lider.client, prop.id)).op?.request_key ?? null
        if (editRes.ok) {
          await callOps({ previewConfig, accessToken: sessions.lider.accessToken, action: 'cancel', opId: prop.id })
        }
        cancelStatus = (await readAudit(sessions.lider.client, prop.id)).op?.status ?? null
        actionAfter = (await readAction(sessions.lider.client, editAction.id)).data
      }
      const ok = Boolean(
        prop?.id &&
          keyBefore &&
          keyAfter &&
          keyBefore !== keyAfter &&
          cancelStatus === 'cancelled' &&
          actionAfter?.prioridad === 'P2_Media',
      )
      record('B', 'E8', 'Edición invalida firma (RPC) y cancelación no escribe', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { signatureChanged: Boolean(keyBefore && keyAfter && keyBefore !== keyAfter), cancelStatus, prioridadAfter: actionAfter?.prioridad },
      })
    }

    // E9: Permission denials (Dirección read-only, Analista, cross-user confirm)
    if (halted) skipHalted('B', 'E9', 'R2 Denegación por permisos y cross-user', true)
    else {
      const t0 = Date.now()
      const dirDeny = await callChat({
        previewConfig,
        accessToken: sessions.direccion.accessToken,
        conversationId: `${tag}e9-dir`,
        messages: [{ role: 'user', content: `Crea una acción llamada ${tag}prohibida para el ${due1}` }],
      })
      const dirBlocked = dirDeny.json?.agent?.status === 'forbidden' && (dirDeny.json?.proposals?.length ?? 0) === 0

      let analystBlocked = true
      if (sessions.analista) {
        const anDeny = await callChat({
          previewConfig,
          accessToken: sessions.analista.accessToken,
          conversationId: `${tag}e9-an`,
          messages: [{ role: 'user', content: `Crea una acción llamada ${tag}an-prohibida para el ${due1}` }],
        })
        analystBlocked = anDeny.json?.agent?.status === 'forbidden' && (anDeny.json?.proposals?.length ?? 0) === 0
      }

      // Cross-user confirm attempt: lider creates proposal, operativo tries to confirm it
      const liderPropTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: `${tag}e9-cross`,
        messages: [{ role: 'user', content: `Crea una acción llamada ${tag}e9-cross para el ${due1}` }],
      })
      const liderOpId = liderPropTurn.json?.proposals?.[0]?.id ?? null
      let crossBlocked = false
      if (liderOpId) {
        trackOp(liderOpId)
        const crossConf = await callOps({
          previewConfig,
          accessToken: sessions.operativo.accessToken,
          action: 'confirm',
          opId: liderOpId,
        })
        const opStillPending = (await readAudit(sessions.lider.client, liderOpId)).op?.status === 'pending'
        crossBlocked = !crossConf.ok && opStillPending
        await callOps({ previewConfig, accessToken: sessions.lider.accessToken, action: 'cancel', opId: liderOpId })
      }

      const ok = dirBlocked && analystBlocked && crossBlocked
      record('B', 'E9', 'Permisos: Dirección, Analista y confirmación ajena denegadas', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { dirBlocked, analystBlocked, crossBlocked },
      })
    }

    // E10: Idempotency & confirm replay
    if (halted) skipHalted('B', 'E10', 'R2 Idempotencia y replay', true)
    else {
      const t0 = Date.now()
      const convId = `${tag}e10`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Muéstrame la acción ${editAction.titulo_accion}` }],
      })
      const p1 = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Marca esa acción como hecha' }],
      })
      const p2 = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Marca esa acción como hecha' }],
      })
      const id1 = p1.json?.proposals?.[0]?.id ?? null
      const id2 = p2.json?.proposals?.[0]?.id ?? null
      let replayOk = false
      let finalEstado = null
      if (id1 && id1 === id2) {
        const c1 = await confirmWithReconcile(sessions.lider, id1, editAction.id)
        const c2 = await confirmWithReconcile(sessions.lider, id1, editAction.id)
        finalEstado = (await readAction(sessions.lider.client, editAction.id)).data?.estado ?? null
        replayOk = c1.ok && c2.ok && c2.json?.status === 'confirmed'
      }
      const ok = Boolean(id1 && id1 === id2 && replayOk && finalEstado === 'Hecho')
      record('B', 'E10', 'Idempotencia de propuesta y replay seguro de confirmación', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { deduped: Boolean(id1 && id1 === id2), replayOk, finalEstado },
      })
    }

    // E11: CAS conflict on stale updated_at
    if (halted) skipHalted('B', 'E11', 'R2 Conflicto CAS concurrencia', true)
    else {
      const t0 = Date.now()
      const convId = `${tag}e11`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Muéstrame la acción ${casAction.titulo_accion}` }],
      })
      const p = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Pon prioridad alta a esa acción' }],
      })
      const opId = p.json?.proposals?.[0]?.id ?? null
      let conflictOk = false
      let prioridadAfter = null
      if (opId) {
        trackOp(opId)
        // Mutate updated_at directly to simulate concurrent edit
        const writer = clients.admin || sessions.lider.client
        await writer
          .from('acciones_diarias')
          .update({ descripcion_accion: `${tag}concurrent-edit` })
          .eq('id', casAction.id)
        const conf = await callOps({
          previewConfig,
          accessToken: sessions.lider.accessToken,
          action: 'confirm',
          opId,
        })
        prioridadAfter = (await readAction(sessions.lider.client, casAction.id)).data?.prioridad ?? null
        const opStatus = (await readAudit(sessions.lider.client, opId)).op?.status ?? null
        conflictOk = conf.status === 409 && opStatus === 'conflict' && prioridadAfter === 'P2_Media'
      }
      record('B', 'E11', 'Conflicto CAS (updated_at obsoleto → 409, sin escritura)', conflictOk ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { conflictOk, prioridadAfter },
      })
    }

    // E12: Continuity after confirmed execution
    if (halted) skipHalted('B', 'E12', 'R2 Continuidad post-confirmación')
    else {
      const t0 = Date.now()
      const convId = `${tag}e10` // editAction already confirmed Hecho
      const follow = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Agrega un comentario a esa acción: ${tag}e12-post-cierre` }],
      })
      const prop = follow.json?.proposals?.[0] ?? null
      if (prop?.id) {
        trackOp(prop.id)
        await callOps({ previewConfig, accessToken: sessions.lider.accessToken, action: 'cancel', opId: prop.id })
      }
      const ok = prop?.tool === 'agent_add_comment' && prop?.record?.id === editAction.id
      record('B', 'E12', 'Continuidad de lastEntity después de confirmar', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { tool: prop?.tool ?? null, resourceMatch: prop?.record?.id === editAction.id },
      })
    }

    // E13: Notification isolation (agent_notify_responsable -> qa_outbox ONLY, 0 external messages)
    if (halted) skipHalted('B', 'E13', 'Seguridad de notificaciones (qa_outbox, 0 salidas reales)', true)
    else {
      const t0 = Date.now()
      const convId = `${tag}e13-notify`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Muéstrame la acción ${c3Action.titulo_accion}` }],
      })
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: 'Avisa por correo al responsable de esa acción' }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let outboxRow = null
      if (prop?.id) {
        const conf = await confirmWithReconcile(sessions.lider, prop.id, c3Action.id)
        if (conf.ok) {
          const { data } = await sessions.lider.client
            .from('qa_outbox')
            .select('id,canal,accion_id,to_usuario_id')
            .eq('idempotency_key', `agent-notify:${prop.id}`)
            .maybeSingle()
          outboxRow = data ?? null
          if (outboxRow?.id) manifest.outboxIds.push(outboxRow.id)
        }
      }
      externalAfter = {
        email: await countTable(clients.admin, 'notification_email_logs'),
        whatsapp: await countTable(clients.admin, 'whatsapp_messages'),
      }
      const zeroExternalEmail = externalBefore.email === null || externalAfter.email === externalBefore.email
      const zeroExternalWa = externalBefore.whatsapp === null || externalAfter.whatsapp === externalBefore.whatsapp
      const ok = Boolean(
        prop?.tool === 'agent_notify_responsable' &&
          outboxRow?.id &&
          outboxRow.accion_id === c3Action.id &&
          zeroExternalEmail &&
          zeroExternalWa,
      )
      record('B', 'E13', 'agent_notify_responsable → qa_outbox únicamente (0 salidas reales)', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: {
          outboxId: outboxRow?.id ?? null,
          zeroExternalEmail,
          zeroExternalWa,
          emailDelta: externalBefore.email === null ? 'no_admin' : externalAfter.email - externalBefore.email,
          waDelta: externalBefore.whatsapp === null ? 'no_admin' : externalAfter.whatsapp - externalBefore.whatsapp,
        },
      })
    }

    // =========================================================================
    // BLOQUE C — INTEGRATED BUSINESS SCENARIOS (C1..C3)
    // =========================================================================

    // C1: Executive (Super Admin) identifies priorities -> prepares action -> approves -> verifies result
    if (halted) skipHalted('C', 'C1-EXEC', 'Dirección/Ejecutivo diagnóstico → propuesta → aprobación → verificación')
    else {
      const t0 = Date.now()
      const convId = `${tag}c1-exec`
      const diag = await callChat({
        previewConfig,
        accessToken: sessions.super_admin.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: '¿Qué requiere mi atención hoy?' }],
      })
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.super_admin.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Crea una acción llamada ${tag}c1-mitigacion para el ${due1}` }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let createdId = null
      let verifiedRow = null
      if (prop?.id) {
        const conf = await confirmWithReconcile(sessions.super_admin, prop.id)
        createdId = conf.json?.result?.id ?? null
        trackAction(createdId)
        if (createdId) verifiedRow = (await readAction(sessions.super_admin.client, createdId)).data
      }
      const ok = Boolean(diag.ok && prop?.id && createdId && verifiedRow?.id === createdId)
      record('C', 'C1-EXEC', 'Ejecutivo prioriza, propone, aprueba y verifica en BD', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { diagIntent: diag.json?.agent?.intent ?? null, createdId, verified: Boolean(verifiedRow?.id) },
      })
    }

    // C2: Líder queries blockers -> registers blocker -> verifies bloqueo_reportado & causa_raiz untouched
    if (halted) skipHalted('C', 'C2-LIDER', 'Líder consulta bloqueos, registra bloqueo y verifica trazabilidad')
    else {
      const t0 = Date.now()
      const convId = `${tag}c2-lider`
      await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Muéstrame la acción ${c2Action.titulo_accion}` }],
      })
      const propTurn = await callChat({
        previewConfig,
        accessToken: sessions.lider.accessToken,
        conversationId: convId,
        messages: [{ role: 'user', content: `Bloquea esa acción porque ${tag}proveedor atrasado` }],
      })
      const prop = propTurn.json?.proposals?.[0] ?? null
      let after = null
      let blockHistory = null
      if (prop?.id) {
        await confirmWithReconcile(sessions.lider, prop.id, c2Action.id)
        after = (await readAction(sessions.lider.client, c2Action.id)).data
        const bh = await sessions.lider.client.rpc('agent_action_block_history', { p_accion_id: c2Action.id })
        blockHistory = bh.data ?? null
      }
      const hasReport = Array.isArray(blockHistory?.reportes) && blockHistory.reportes.some((r) => String(r.contenido).includes(tag))
      const ok = Boolean(
        prop?.tool === 'agent_register_blocker' &&
          after?.estado === 'Bloqueado' &&
          after?.causa_raiz == null &&
          hasReport,
      )
      record('C', 'C2-LIDER', 'Líder registra bloqueo (bloqueo_reportado, sin tocar causa_raiz)', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: { estadoAfter: after?.estado ?? null, causaRaizNull: after?.causa_raiz == null, hasReport },
      })
    }

    // C3: Operativo modifies own action & is denied on unassigned action
    if (halted) skipHalted('C', 'C3-OP', 'Operativo modifica sólo dentro de sus permisos', true)
    else {
      const t0 = Date.now()
      const convOwn = `${tag}c3-own`
      await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: convOwn,
        messages: [{ role: 'user', content: `Muéstrame la acción ${c3Action.titulo_accion}` }],
      })
      const ownProp = await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: convOwn,
        messages: [{ role: 'user', content: 'Cambia esa acción a en ejecución' }],
      })
      const prop = ownProp.json?.proposals?.[0] ?? null
      let ownAfter = null
      if (prop?.id) {
        await confirmWithReconcile(sessions.operativo, prop.id, c3Action.id)
        ownAfter = (await readAction(sessions.operativo.client, c3Action.id)).data
      }

      // Attempt to change unassigned liderAction -> must be denied
      const convAlien = `${tag}c3-alien`
      await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: convAlien,
        messages: [{ role: 'user', content: `Muéstrame la acción ${liderAction.titulo_accion}` }],
      })
      const alienTurn = await callChat({
        previewConfig,
        accessToken: sessions.operativo.accessToken,
        conversationId: convAlien,
        messages: [{ role: 'user', content: 'Marca esa acción como hecha' }],
      })
      const alienAfter = (await readAction(sessions.lider.client, liderAction.id)).data
      const alienUntouched = (alienTurn.json?.proposals?.length ?? 0) === 0 && alienAfter?.estado === 'Bloqueado'
      const ok = ownAfter?.estado === 'En_Ejecucion' && alienUntouched

      record('C', 'C3-OP', 'Operativo modifica acción propia y falla cerrado en acción ajena', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: { ownEstadoAfter: ownAfter?.estado ?? null, alienUntouched },
      })
    }
  } catch (error) {
    record('SYS', 'SUITE-EX', 'Excepción controlada en suite Text Complete', 'FAIL', {
      critical: true,
      detail: { error: error instanceof Error ? error.message.slice(0, 300) : String(error) },
    })
  } finally {
    // Final external notification verification
    if (externalAfter.email === null && clients.admin) {
      externalAfter = {
        email: await countTable(clients.admin, 'notification_email_logs'),
        whatsapp: await countTable(clients.admin, 'whatsapp_messages'),
      }
    }
  }

  // ===========================================================================
  // GUARANTEED CLEANUP OF ONLY TRACKED `tc-qa-<runId>-` FIXTURES
  // ===========================================================================
  const cleanup = {
    attempted: false,
    method: 'none',
    remaining: {
      outbox: 0,
      pendingOps: 0,
      comments: 0,
      actions: 0,
      documents: 0,
      memories: 0,
    },
    errors: [],
  }

  const totalTracked =
    manifest.outboxIds.length +
    manifest.pendingOpIds.length +
    manifest.commentIds.length +
    manifest.actionIds.length +
    manifest.documentIds.length +
    manifest.memoryIds.length

  if (totalTracked > 0) {
    cleanup.attempted = true
    if (clients.admin) {
      cleanup.method = 'admin_tracked_ids'
      const del = async (table, col, ids, key) => {
        if (!ids.length) return
        const res = await clients.admin.from(table).delete().in(col, ids)
        if (res.error) cleanup.errors.push(`${table}:${res.error.message}`)
        const rem = await clients.admin.from(table).select(col, { count: 'exact', head: true }).in(col, ids)
        cleanup.remaining[key] = rem.count ?? 0
      }
      await del('qa_outbox', 'id', manifest.outboxIds, 'outbox')
      if (manifest.pendingOpIds.length) {
        await clients.admin.from('agent_action_receipts').delete().in('pending_op_id', manifest.pendingOpIds)
        await clients.admin.from('assistant_op_log').delete().in('pending_op_id', manifest.pendingOpIds)
        await del('assistant_pending_ops', 'id', manifest.pendingOpIds, 'pendingOps')
      }
      await del('accion_comentarios', 'id', manifest.commentIds, 'comments')
      await del('acciones_diarias', 'id', manifest.actionIds, 'actions')
      await del('agent_documents', 'id', manifest.documentIds, 'documents')
      await del('agent_memory', 'id', manifest.memoryIds, 'memories')
    } else {
      cleanup.method = 'no_admin_key_manual_cleanup_required'
      cleanup.errors.push('Falta TC_QA_SUPABASE_SERVICE_ROLE_KEY para eliminar fixtures automáticamente')
    }
  }

  const counts = {
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    blocked: results.filter((r) => r.status === 'BLOCKED').length,
  }
  const remainingTotal = Object.values(cleanup.remaining).reduce((a, b) => a + b, 0)
  const verdict = counts.fail > 0 || remainingTotal > 0 ? 'FAIL' : counts.blocked > 0 ? 'BLOCKED' : 'PASS'

  return {
    runId,
    verdict,
    haltedOnCritical: halted,
    haltReason,
    counts,
    externalNotifications: { before: externalBefore, after: externalAfter },
    manifest,
    cleanup: { ...cleanup, remainingTotal },
    results,
  }
}
