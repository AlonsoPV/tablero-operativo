/* global fetch */
/**
 * Executable R3-I0..R3-I7 integrated test suite engine.
 *
 * Rules enforced:
 * - Real RLS validation using `anon` and authenticated user JWT clients ONLY (never simulates RLS with service_role).
 * - Synthetic fixtures strictly prefixed with `r3-int-<runId>-` and recorded for controlled cleanup.
 * - Stops immediately on critical failure (e.g. cross-user isolation breach or RLS failure) while still cleaning up created fixtures.
 * - Never modifies Vercel flags or triggers deployments.
 */
import { createHash } from 'node:crypto'
import { buildPreviewRequest, isFlagOn } from './r3DevGuard.mjs'

function hashBody(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

function makeContentHash(prefix, runId, label, body) {
  const raw = `${prefix}${runId}-${label}-${hashBody(body)}`
  return raw.slice(0, 64)
}

function defaultPreviewTurn(fetchImpl) {
  return async ({ previewConfig, accessToken, prompt }) => {
    const req = buildPreviewRequest(previewConfig, '/api/gemini-chat', {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    })
    const res = await fetchImpl(req.url, {
      method: 'POST',
      headers: req.headers,
      redirect: 'manual',
      body: JSON.stringify({
        mode: 'operativo',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const location = res.headers.get('location') || ''
    if (res.status === 302 && /vercel\.com\/sso-api/i.test(location)) {
      return { ok: false, blockedSso: true, status: res.status, text: '', json: null }
    }
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { ok: res.ok, blockedSso: false, status: res.status, text, json }
  }
}

/**
 * Run R3-I0..R3-I7 against injectable clients (real DEV+Preview or Vitest mocks).
 *
 * @param {object} opts
 * @param {'ON'|'OFF'} opts.windowMode - Whether the target Preview currently has R1+R3 flags ON or OFF.
 * @param {string} opts.runId - Unique short run identifier (alphanumeric).
 * @param {string} opts.fixturePrefix - Must start with `r3-int-`.
 * @param {object} opts.target - Output of resolveR3DevTarget().
 * @param {object} opts.previewConfig - Output of resolvePreviewConfig().
 * @param {object} opts.clients - { anon, signInDireccion, signInLider, admin (optional, cleanup/seed docs only) }
 * @param {function} [opts.previewTurn] - Optional override for POST /api/gemini-chat.
 * @param {function} [opts.browserProbe] - Optional Playwright probe function.
 * @param {boolean} [opts.stopOnCritical=true]
 * @param {object} [opts.env]
 * @param {function} [opts.fetchImpl]
 */
export async function runR3IntegratedSuite({
  windowMode = 'ON',
  runId = `${Date.now().toString(36)}`,
  fixturePrefix = 'r3-int-',
  target,
  previewConfig,
  clients,
  previewTurn = null,
  browserProbe = null,
  stopOnCritical = true,
  env = {},
  fetchImpl = fetch,
}) {
  if (!fixturePrefix.startsWith('r3-int-')) {
    throw new Error('fixturePrefix debe comenzar con r3-int-')
  }

  const callTurn = previewTurn || defaultPreviewTurn(fetchImpl)
  const results = []
  const createdFixtures = {
    prefix: `${fixturePrefix}${runId}-`,
    memoryIds: [],
    documentIds: [],
    contentHashes: [],
    logicalIds: [],
  }

  let halted = false
  let haltReason = null

  const record = (id, title, status, { critical = false, durationMs = 0, detail = {} } = {}) => {
    results.push({ id, title, status, critical, durationMs, detail })
    if (critical && status === 'FAIL' && stopOnCritical) {
      halted = true
      haltReason = `Fallo crítico en ${id}: ${title}`
    }
  }

  const recordHalted = (id, title, critical = false) => {
    record(id, title, 'BLOCKED', { critical, detail: { reason: haltReason || 'Detenido por fallo crítico previo' } })
  }

  let dirSession1 = null
  let liderSession = null
  let createdMemId = null
  let createdMemHash = null

  try {
    // Authenticate real QA identities via Supabase Auth (never service_role for user ops)
    dirSession1 = await clients.signInDireccion()
    liderSession = await clients.signInLider()

    if (!dirSession1?.usuarioId || !liderSession?.usuarioId || dirSession1.usuarioId === liderSession.usuarioId) {
      throw new Error('Identidades QA inválidas o idénticas (usuario_id debe ser distinto para Dirección y Líder)')
    }

    // ------------------------------------------------------------------
    // R3-I0: Memoria OFF — sin lecturas ni escrituras de memoria
    // ------------------------------------------------------------------
    {
      const t0 = Date.now()
      const flagOffContract =
        isFlagOn(undefined) === false &&
        isFlagOn('') === false &&
        isFlagOn('0') === false &&
        isFlagOn('true') === false &&
        isFlagOn('1') === true

      if (windowMode === 'OFF') {
        const before = await dirSession1.client
          .from('agent_memory')
          .select('id', { count: 'exact', head: true })
        const turn = await callTurn({
          previewConfig,
          accessToken: dirSession1.accessToken,
          prompt: '¿Qué acuerdo previo tenemos registrado sobre preferencias del tablero?',
        })
        const after = await dirSession1.client
          .from('agent_memory')
          .select('id', { count: 'exact', head: true })

        let probe = null
        if (browserProbe) {
          probe = await browserProbe({
            previewConfig,
            route: '/',
            supabaseSession: dirSession1.rawSession,
            supabaseRef: target.ref,
          })
        }

        if (turn.blockedSso) {
          record('R3-I0', 'Memoria OFF — sin lecturas ni escrituras', 'BLOCKED', {
            critical: true,
            durationMs: Date.now() - t0,
            detail: { reason: 'SSO wall en /api/gemini-chat' },
          })
        } else {
          const replyText = String(turn.json?.reply || turn.json?.text || turn.text || '')
          const noMemoryCitation = !/agent_memory|r3-int-/i.test(replyText)
          const unchangedCount = (before.count ?? 0) === (after.count ?? 0)
          const noBrowserMemoryTraffic = !probe || (probe.status !== 'FAIL' && (probe.memoryRequests?.length ?? 0) === 0)
          const ok = flagOffContract && turn.ok && noMemoryCitation && unchangedCount && noBrowserMemoryTraffic
          record('R3-I0', 'Memoria OFF — sin lecturas ni escrituras', ok ? 'PASS' : 'FAIL', {
            critical: true,
            durationMs: Date.now() - t0,
            detail: {
              windowMode,
              httpStatus: turn.status,
              countBefore: before.count ?? null,
              countAfter: after.count ?? null,
              noMemoryCitation,
              browserProbeStatus: probe?.status ?? 'skipped',
              browserMemoryRequests: probe?.memoryRequests?.length ?? 0,
            },
          })
        }
      } else {
        // In ON window, validate fail-closed flag semantics (actual OFF turn runs in OFF window / R3-I7)
        record('R3-I0', 'Memoria OFF — contrato fail-closed (ventana ON)', flagOffContract ? 'PASS' : 'FAIL', {
          critical: false,
          durationMs: Date.now() - t0,
          detail: {
            windowMode,
            flagOffContract,
            note: 'Verificación de tráfico OFF en vivo se ejecuta en ventana OFF / post-rollback',
          },
        })
      }
    }

    // ------------------------------------------------------------------
    // R3-I1: Memoria ON — persistencia entre sesiones (Dirección)
    // ------------------------------------------------------------------
    if (halted) {
      recordHalted('R3-I1', 'Memoria ON — persistencia entre sesiones', true)
    } else if (windowMode === 'OFF') {
      record('R3-I1', 'Memoria ON — persistencia entre sesiones', 'BLOCKED', {
        critical: false,
        detail: { reason: 'Ventana en modo OFF; requiere ventana ON para persistencia R3' },
      })
    } else {
      const t0 = Date.now()
      const body1 = `${fixturePrefix}${runId} acuerdo sintetico QA: revisar entregas logisticas los viernes.`
      const hash1 = makeContentHash(fixturePrefix, runId, 'persist', body1)
      createdMemHash = hash1

      const { data: created, error: createErr } = await dirSession1.client
        .from('agent_memory')
        .insert({
          usuario_id: dirSession1.usuarioId,
          memory_type: 'agreement',
          body: body1,
          source_kind: 'manual',
          source_ref: `${fixturePrefix}${runId}`,
          content_hash: hash1,
          validation_status: 'confirmed',
          access_level: 'owner',
          confirmed_by: dirSession1.usuarioId,
          confirmed_at: new Date().toISOString(),
        })
        .select('id,usuario_id,body,content_hash,validation_status')
        .single()

      if (created?.id) {
        createdMemId = created.id
        createdFixtures.memoryIds.push(created.id)
        createdFixtures.contentHashes.push(hash1)
      }

      let recalled = null
      let recallErr = null
      if (!createErr && created?.id) {
        // Fresh second authenticated session for same user (real cross-session persistence)
        const dirSession2 = await clients.signInDireccion()
        const res = await dirSession2.client
          .from('agent_memory')
          .select('id,usuario_id,body,content_hash,validation_status')
          .eq('id', created.id)
          .maybeSingle()
        recalled = res.data
        recallErr = res.error
      }

      const ok = Boolean(
        !createErr &&
          !recallErr &&
          created?.id &&
          recalled?.id === created.id &&
          recalled?.content_hash === hash1 &&
          recalled?.usuario_id === dirSession1.usuarioId,
      )

      record('R3-I1', 'Memoria ON — persistencia entre sesiones', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: {
          createdId: created?.id ?? null,
          recalledId: recalled?.id ?? null,
          hashMatch: recalled?.content_hash === hash1,
          createError: createErr?.message ?? null,
          recallError: recallErr?.message ?? null,
        },
      })
    }

    // ------------------------------------------------------------------
    // R3-I2: Aislamiento usuario / organización (Líder no ve memoria Dirección)
    // ------------------------------------------------------------------
    if (halted) {
      recordHalted('R3-I2', 'Aislamiento usuario / organización', true)
    } else if (!createdMemId) {
      record('R3-I2', 'Aislamiento usuario / organización', 'BLOCKED', {
        critical: true,
        detail: { reason: 'Sin fixture de memoria creada en R3-I1' },
      })
    } else {
      const t0 = Date.now()
      const { data: byId, error: byIdErr } = await liderSession.client
        .from('agent_memory')
        .select('id,body,content_hash')
        .eq('id', createdMemId)

      const { data: byPrefix, error: byPrefixErr } = await liderSession.client
        .from('agent_memory')
        .select('id,body,content_hash')
        .like('content_hash', `${fixturePrefix}${runId}%`)

      const serialized = JSON.stringify({ byId, byPrefix })
      const leakedBody = /entregas logisticas los viernes/i.test(serialized)
      const ok =
        !byIdErr &&
        !byPrefixErr &&
        (byId?.length ?? 0) === 0 &&
        (byPrefix?.length ?? 0) === 0 &&
        !leakedBody

      record('R3-I2', 'Aislamiento usuario / organización', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: {
          liderRowsById: byId?.length ?? null,
          liderRowsByPrefix: byPrefix?.length ?? null,
          leakedBody,
          error: byIdErr?.message ?? byPrefixErr?.message ?? null,
        },
      })
    }

    // ------------------------------------------------------------------
    // R3-I3: RLS real (anon + cross-user INSERT/UPDATE + agent_documents)
    // ------------------------------------------------------------------
    if (halted) {
      recordHalted('R3-I3', 'RLS real (anon, cross-user, agent_documents)', true)
    } else {
      const t0 = Date.now()
      // 1) anon SELECT agent_memory must be denied (error OR 0 rows, never returning createdMemId)
      const anonRes = await clients.anon.from('agent_memory').select('id').limit(5)
      const anonDenied = Boolean(anonRes.error) || (anonRes.data?.length ?? 0) === 0

      // 2) Dirección cross-user INSERT as Líder must fail (RLS 42501)
      const crossInsert = await dirSession1.client.from('agent_memory').insert({
        usuario_id: liderSession.usuarioId,
        memory_type: 'preference',
        body: `${fixturePrefix}${runId} intento cross-user`,
        source_kind: 'manual',
        content_hash: makeContentHash(fixturePrefix, runId, 'cross', 'cross-user'),
        validation_status: 'confirmed',
        access_level: 'owner',
      })
      const crossInsertDenied = Boolean(crossInsert.error)

      // 3) Líder cross-user UPDATE on Dirección's memory must fail or update 0 rows
      let crossUpdateDenied = true
      let crossUpdateDetail = 'skipped_no_mem'
      if (createdMemId) {
        const crossUpd = await liderSession.client
          .from('agent_memory')
          .update({ body: `${fixturePrefix}${runId} tampered` })
          .eq('id', createdMemId)
          .select('id')
        crossUpdateDenied = Boolean(crossUpd.error) || (crossUpd.data?.length ?? 0) === 0
        crossUpdateDetail = crossUpd.error ? `error:${crossUpd.error.code || crossUpd.error.message}` : `rows:${crossUpd.data?.length ?? 0}`
      }

      // 4) Authenticated Dirección INSERT into agent_documents must be denied
      const authDocInsert = await dirSession1.client.from('agent_documents').insert({
        logical_id: `${fixturePrefix}${runId}-auth-doc-deny`,
        title: 'Intento no autorizado',
        body: 'No permitido para authenticated',
        version: 1,
        status: 'published',
        access_level: 'project_read',
        content_hash: makeContentHash(fixturePrefix, runId, 'authdoc', 'deny'),
        source_label: 'r3-int-runner',
      })
      const authDocInsertDenied = Boolean(authDocInsert.error)

      // 5) Optional published vs withdrawn document visibility check (seeded via admin, read via real Líder JWT)
      let docVisibilityOk = true
      let docVisibilityNote = 'admin_not_provided_skipped'
      if (clients.admin && windowMode === 'ON') {
        const logicalId = `${fixturePrefix}${runId}-doc`
        createdFixtures.logicalIds.push(logicalId)

        const { data: pubDoc, error: pubErr } = await clients.admin
          .from('agent_documents')
          .insert({
            logical_id: logicalId,
            title: 'Procedimiento QA R3 v2',
            body: `${fixturePrefix}${runId} pasos publicados v2`,
            version: 2,
            status: 'published',
            access_level: 'project_read',
            content_hash: makeContentHash(fixturePrefix, runId, 'docv2', 'published'),
            source_label: 'r3-int-runner',
            published_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (pubDoc?.id) createdFixtures.documentIds.push(pubDoc.id)

        const { data: wdDoc, error: wdErr } = await clients.admin
          .from('agent_documents')
          .insert({
            logical_id: logicalId,
            title: 'Procedimiento QA R3 v1 retirada',
            body: `${fixturePrefix}${runId} version retirada v1`,
            version: 1,
            status: 'withdrawn',
            access_level: 'project_read',
            content_hash: makeContentHash(fixturePrefix, runId, 'docv1', 'withdrawn'),
            source_label: 'r3-int-runner',
            withdrawn_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (wdDoc?.id) createdFixtures.documentIds.push(wdDoc.id)

        if (pubErr || wdErr) {
          docVisibilityOk = false
          docVisibilityNote = `seed_error:${pubErr?.message || wdErr?.message}`
        } else {
          const seen = await liderSession.client
            .from('agent_documents')
            .select('id,version,status')
            .eq('logical_id', logicalId)
          const versions = (seen.data || []).map((r) => r.version)
          docVisibilityOk = !seen.error && versions.includes(2) && !versions.includes(1)
          docVisibilityNote = `visible_versions:${versions.join(',') || 'none'}`
        }
      }

      const ok = anonDenied && crossInsertDenied && crossUpdateDenied && authDocInsertDenied && docVisibilityOk
      record('R3-I3', 'RLS real (anon, cross-user, agent_documents)', ok ? 'PASS' : 'FAIL', {
        critical: true,
        durationMs: Date.now() - t0,
        detail: {
          anonDenied,
          anonErrorCode: anonRes.error?.code ?? null,
          crossInsertDenied,
          crossInsertCode: crossInsert.error?.code ?? null,
          crossUpdateDenied,
          crossUpdateDetail,
          authDocInsertDenied,
          authDocInsertCode: authDocInsert.error?.code ?? null,
          docVisibilityOk,
          docVisibilityNote,
        },
      })
    }

    // ------------------------------------------------------------------
    // R3-I4: Idempotencia (supersede sin duplicados vigentes)
    // ------------------------------------------------------------------
    if (halted) {
      recordHalted('R3-I4', 'Idempotencia / cadena sin duplicados vigentes', false)
    } else if (windowMode === 'OFF') {
      record('R3-I4', 'Idempotencia / cadena sin duplicados vigentes', 'BLOCKED', {
        detail: { reason: 'Ventana en modo OFF' },
      })
    } else {
      const t0 = Date.now()
      const idemBody = `${fixturePrefix}${runId} preferencia idempotente: resumen matutino 8am.`
      const idemHash = makeContentHash(fixturePrefix, runId, 'idem', idemBody)
      createdFixtures.contentHashes.push(idemHash)

      const first = await dirSession1.client
        .from('agent_memory')
        .insert({
          usuario_id: dirSession1.usuarioId,
          memory_type: 'preference',
          body: idemBody,
          source_kind: 'manual',
          source_ref: `${fixturePrefix}${runId}-idem`,
          content_hash: idemHash,
          validation_status: 'confirmed',
          access_level: 'owner',
          version: 1,
          confirmed_by: dirSession1.usuarioId,
          confirmed_at: new Date().toISOString(),
        })
        .select('id,version')
        .single()

      if (first.data?.id) createdFixtures.memoryIds.push(first.data.id)

      // Supersede first with v2 rather than duplicating two active confirmed rows
      let supersedeErr = null
      let second = { data: null, error: null }
      if (!first.error && first.data?.id) {
        const upd = await dirSession1.client
          .from('agent_memory')
          .update({ validation_status: 'superseded' })
          .eq('id', first.data.id)
        supersedeErr = upd.error

        second = await dirSession1.client
          .from('agent_memory')
          .insert({
            usuario_id: dirSession1.usuarioId,
            memory_type: 'preference',
            body: idemBody,
            source_kind: 'manual',
            source_ref: `${fixturePrefix}${runId}-idem`,
            content_hash: idemHash,
            validation_status: 'confirmed',
            access_level: 'owner',
            version: 2,
            supersedes_id: first.data.id,
            confirmed_by: dirSession1.usuarioId,
            confirmed_at: new Date().toISOString(),
          })
          .select('id,version,supersedes_id')
          .single()
        if (second.data?.id) createdFixtures.memoryIds.push(second.data.id)
      }

      const active = await dirSession1.client
        .from('agent_memory')
        .select('id,version,validation_status,supersedes_id')
        .eq('content_hash', idemHash)
        .eq('validation_status', 'confirmed')

      const ok = Boolean(
        !first.error &&
          !supersedeErr &&
          !second.error &&
          !active.error &&
          (active.data?.length ?? 0) === 1 &&
          active.data[0].version === 2 &&
          active.data[0].supersedes_id === first.data.id,
      )

      record('R3-I4', 'Idempotencia / cadena sin duplicados vigentes', ok ? 'PASS' : 'FAIL', {
        durationMs: Date.now() - t0,
        detail: {
          activeCount: active.data?.length ?? null,
          activeVersion: active.data?.[0]?.version ?? null,
          supersedesMatch: active.data?.[0]?.supersedes_id === first.data?.id,
          error: first.error?.message || supersedeErr?.message || second.error?.message || active.error?.message || null,
        },
      })
    }

    // ------------------------------------------------------------------
    // R3-I5: Fail-closed ante errores / sin memoria inventada
    // ------------------------------------------------------------------
    if (halted) {
      recordHalted('R3-I5', 'Fail-closed errores y sin memoria inventada', false)
    } else {
      const t0 = Date.now()
      // 1) Invalid memory_type must be rejected by DB check constraint
      const invalidIns = await dirSession1.client.from('agent_memory').insert({
        usuario_id: dirSession1.usuarioId,
        memory_type: 'invalid_type_fail_closed',
        body: `${fixturePrefix}${runId} invalido`,
        source_kind: 'manual',
        content_hash: makeContentHash(fixturePrefix, runId, 'invalid', 'bad'),
        validation_status: 'confirmed',
        access_level: 'owner',
      })
      const invalidRejected = Boolean(invalidIns.error)

      // 2) Query for non-existent synthetic topic returns 0 rows
      const missingRes = await dirSession1.client
        .from('agent_memory')
        .select('id')
        .eq('content_hash', `${fixturePrefix}${runId}-never-exists-0000`)
      const emptyWhenMissing = !missingRes.error && (missingRes.data?.length ?? 0) === 0

      // 3) Preview assistant turn on unknown topic does not fail or hallucinate synthetic marker
      const turn = await callTurn({
        previewConfig,
        accessToken: dirSession1.accessToken,
        prompt: `¿Existe algún acuerdo registrado con código ${fixturePrefix}${runId}-inexistente?`,
      })

      if (turn.blockedSso) {
        record('R3-I5', 'Fail-closed errores y sin memoria inventada', 'BLOCKED', {
          durationMs: Date.now() - t0,
          detail: { invalidRejected, emptyWhenMissing, reason: 'SSO wall en /api/gemini-chat' },
        })
      } else {
        const replyText = String(turn.json?.reply || turn.json?.text || turn.text || '')
        const noInventedAgreement = !/entregas logisticas los viernes/i.test(replyText)
        const ok = invalidRejected && emptyWhenMissing && turn.ok && noInventedAgreement
        record('R3-I5', 'Fail-closed errores y sin memoria inventada', ok ? 'PASS' : 'FAIL', {
          durationMs: Date.now() - t0,
          detail: {
            invalidRejected,
            emptyWhenMissing,
            turnStatus: turn.status,
            noInventedAgreement,
          },
        })
      }
    }

    // ------------------------------------------------------------------
    // R3-I6: Compatibilidad R1 / R2 (sin escrituras R2 ni contaminación)
    // ------------------------------------------------------------------
    if (halted) {
      recordHalted('R3-I6', 'Compatibilidad R1/R2 sin escrituras operativas', false)
    } else {
      const t0 = Date.now()
      const r2Safe =
        !isFlagOn(env.COPILOT_R2_GATE) &&
        !isFlagOn(env.R1_EXECUTION_ENABLED) &&
        !['live', 'qa'].includes(String(env.R2_EXECUTION_MODE || '').toLowerCase())

      const turn = await callTurn({
        previewConfig,
        accessToken: dirSession1.accessToken,
        prompt: 'Muéstrame un resumen breve de las acciones abiertas actuales.',
      })

      let probe = null
      if (browserProbe) {
        probe = await browserProbe({
          previewConfig,
          route: '/',
          supabaseSession: dirSession1.rawSession,
          supabaseRef: target.ref,
        })
      }

      if (turn.blockedSso) {
        record('R3-I6', 'Compatibilidad R1/R2 sin escrituras operativas', 'BLOCKED', {
          durationMs: Date.now() - t0,
          detail: { r2Safe, reason: 'SSO wall en /api/gemini-chat' },
        })
      } else {
        const probeOk = !probe || probe.status === 'PASS'
        const ok = r2Safe && turn.ok && probeOk
        record('R3-I6', 'Compatibilidad R1/R2 sin escrituras operativas', ok ? 'PASS' : 'FAIL', {
          durationMs: Date.now() - t0,
          detail: {
            r2Safe,
            turnStatus: turn.status,
            browserProbeStatus: probe?.status ?? 'skipped',
            browserConsoleErrors: probe?.consoleErrors?.length ?? 0,
          },
        })
      }
    }

    // ------------------------------------------------------------------
    // R3-I7: Verificación contrato Rollback OFF (runner nunca cambia flags)
    // ------------------------------------------------------------------
    if (halted) {
      recordHalted('R3-I7', 'Rollback OFF verificable (sin mutar flags desde runner)', false)
    } else {
      const t0 = Date.now()
      const failClosedOff =
        isFlagOn('0') === false &&
        isFlagOn('') === false &&
        isFlagOn(undefined) === false &&
        isFlagOn('true') === false

      if (windowMode === 'OFF') {
        const turn = await callTurn({
          previewConfig,
          accessToken: dirSession1.accessToken,
          prompt: 'Recuerda el último acuerdo guardado en memoria.',
        })
        if (turn.blockedSso) {
          record('R3-I7', 'Rollback OFF verificable (post-rollback)', 'BLOCKED', {
            durationMs: Date.now() - t0,
            detail: { reason: 'SSO wall en /api/gemini-chat' },
          })
        } else {
          const replyText = String(turn.json?.reply || turn.json?.text || turn.text || '')
          const memoryUnread = !/r3-int-|entregas logisticas los viernes/i.test(replyText)
          const ok = failClosedOff && turn.ok && memoryUnread
          record('R3-I7', 'Rollback OFF verificable (post-rollback)', ok ? 'PASS' : 'FAIL', {
            durationMs: Date.now() - t0,
            detail: { failClosedOff, turnStatus: turn.status, memoryUnread },
          })
        }
      } else {
        record('R3-I7', 'Rollback OFF verificable (ejecución delegada a script independiente)', failClosedOff ? 'PASS' : 'FAIL', {
          durationMs: Date.now() - t0,
          detail: {
            failClosedOff,
            runnerMutatedFlags: false,
            runnerDeployed: false,
            rollbackCommand: 'npm run qa:r3:rollback -- --apply',
          },
        })
      }
    }
  } catch (error) {
    record('R3-SUITE-EX', 'Excepción controlada en suite R3', 'FAIL', {
      critical: true,
      detail: { error: error instanceof Error ? error.message.slice(0, 300) : String(error) },
    })
  }

  // --------------------------------------------------------------------
  // Controlled cleanup of ONLY fixtures created & tracked in this run
  // --------------------------------------------------------------------
  const cleanup = {
    attempted: false,
    method: 'none',
    deletedMemoryIds: [],
    deletedDocumentIds: [],
    remainingMemory: 0,
    remainingDocuments: 0,
    errors: [],
  }

  if (createdFixtures.memoryIds.length > 0 || createdFixtures.documentIds.length > 0) {
    cleanup.attempted = true
    if (clients.admin) {
      cleanup.method = 'admin_tracked_ids'
      if (createdFixtures.memoryIds.length > 0) {
        const delM = await clients.admin.from('agent_memory').delete().in('id', createdFixtures.memoryIds)
        if (delM.error) cleanup.errors.push(`memory_delete:${delM.error.message}`)
        else cleanup.deletedMemoryIds = [...createdFixtures.memoryIds]

        const remM = await clients.admin
          .from('agent_memory')
          .select('id', { count: 'exact', head: true })
          .in('id', createdFixtures.memoryIds)
        cleanup.remainingMemory = remM.count ?? 0
      }
      if (createdFixtures.documentIds.length > 0) {
        const delD = await clients.admin.from('agent_documents').delete().in('id', createdFixtures.documentIds)
        if (delD.error) cleanup.errors.push(`documents_delete:${delD.error.message}`)
        else cleanup.deletedDocumentIds = [...createdFixtures.documentIds]

        const remD = await clients.admin
          .from('agent_documents')
          .select('id', { count: 'exact', head: true })
          .in('id', createdFixtures.documentIds)
        cleanup.remainingDocuments = remD.count ?? 0
      }
    } else if (dirSession1 && createdFixtures.memoryIds.length > 0) {
      // Without admin key, authenticated owner marks created memory rows deleted (RLS grants SELECT/INSERT/UPDATE, not DELETE)
      cleanup.method = 'owner_soft_delete_no_service_key'
      const upd = await dirSession1.client
        .from('agent_memory')
        .update({ validation_status: 'deleted' })
        .in('id', createdFixtures.memoryIds)
      if (upd.error) cleanup.errors.push(`owner_soft_delete:${upd.error.message}`)
      else cleanup.deletedMemoryIds = [...createdFixtures.memoryIds]
    }
  }

  const counts = {
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    blocked: results.filter((r) => r.status === 'BLOCKED').length,
  }

  let verdict = 'PASS'
  if (counts.fail > 0) verdict = 'FAIL'
  else if (counts.blocked > 0) verdict = 'BLOCKED'

  return {
    runId,
    windowMode,
    verdict,
    haltedOnCritical: halted,
    haltReason,
    counts,
    createdFixtures,
    cleanup,
    results,
  }
}
