/**
 * R0 WhatsApp Connected Management — Suite integral de validación local (12 escenarios).
 * 100% local y simulado: cero envíos reales, cero acceso a DEV/Production, cero migraciones remotas.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { dispatchCopilotTool } from './assistantOpsRuntime.js'
import { memoryQueryAuditSink } from './query/queryAudit.js'
import { createMemoryStore } from './memory/store.js'
import { runChannelTurn } from './orchestrator/channelAdapters.js'
import { createFakeSupabase } from './orchestrator/testing/fakeSupabase.js'
import {
  createR1Db,
  r1Store,
  R1_NOW_ISO,
  R1_TODAY,
  R1_USERS,
} from './orchestrator/testing/r1Fixture.js'
import {
  classifyProviderOutcome,
  deduplicateInboundEvents,
  evaluateEventOrdering,
  reconcileReviewJob,
  recoverExpiredLeases,
  type InboundJobRecord,
} from './whatsappReconciliation.js'
import {
  buildProposalBinding,
  buildProposalConfirmButtonId,
  formatWhatsAppProposalPrompt,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
} from './whatsappR2Adapter.js'
import { processWhatsAppVoiceNote } from './whatsappVoiceNotes.js'
import { buildSyntheticOggOpusFixture } from './audioTranscription.js'
import {
  evaluateProactiveFollowup,
  planProactiveBatch,
  PROACTIVE_CATEGORIES,
  type ProactiveCandidate,
  type ProactiveUserPreferences,
} from './whatsappProactive.js'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})

afterAll(() => {
  vi.useRealTimers()
})

describe('R0 WhatsApp Connected — 12 escenarios locales', () => {
  it('1. preserva autorización can_use_ai_whatsapp_for_usuario y fail-closed en webhook/dispatcher', () => {
    const assistantSrc = readFileSync('api/whatsapp-assistant.ts', 'utf8')
    const webhookSrc = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8')
    const dispatcherSrc = readFileSync('supabase/functions/whatsapp-followup-dispatcher/index.ts', 'utf8')

    expect(assistantSrc).toContain("'can_use_ai_whatsapp_for_usuario'")
    expect(assistantSrc).not.toContain("'can_query_ai_whatsapp_for_usuario'")
    expect(webhookSrc).toContain("'can_use_ai_whatsapp_for_usuario'")
    expect(dispatcherSrc).not.toContain('missing WHATSAPP_DISPATCHER_SECRET; allowing request')
  })

  it('2. usuario activo vs inactivo: el teléfono nunca basta sin revalidar identidad y estado activo', async () => {
    const db = createR1Db()
    const store = r1Store()

    const inactiveTurn = await runChannelTurn(
      {
        identity: {
          supabase: createFakeSupabase(db),
          authUserId: R1_USERS.inactive.user_id,
          usuarioId: R1_USERS.inactive.id,
          rol: R1_USERS.inactive.rol,
          active: false,
        },
        channel: 'whatsapp',
        sessionId: '5215550009999',
        utterance: '¿Qué tengo pendiente?',
      },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )

    expect(inactiveTurn.response.status).toBe('forbidden')
    expect(inactiveTurn.text).not.toContain('Cerrar inventario')

    const activeTurn = await runChannelTurn(
      {
        identity: {
          supabase: createFakeSupabase(db),
          authUserId: R1_USERS.lead.user_id,
          usuarioId: R1_USERS.lead.id,
          rol: R1_USERS.lead.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215550001111',
        utterance: '¿Qué tengo pendiente?',
      },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )

    expect(activeTurn.handled).toBe(true)
    expect(activeTurn.response.status).toBe('ok')
    expect(activeTurn.text).toContain('Cerrar inventario')
  })

  it('3. eventos duplicados y fuera de orden se suprimen sin regresar estados', () => {
    const dedup = deduplicateInboundEvents(
      [
        { eventKey: 'msg:wamid.1', phoneId: 'p1', sender: '521551', kind: 'message' },
        { eventKey: 'msg:wamid.1', phoneId: 'p1', sender: '521551', kind: 'message' },
        { eventKey: 'msg:wamid.2', phoneId: 'p1', sender: '521551', kind: 'message' },
      ],
      new Set(['msg:wamid.0'])
    )
    expect(dedup.accepted.map((e) => e.eventKey)).toEqual(['msg:wamid.1', 'msg:wamid.2'])
    expect(dedup.duplicates).toHaveLength(1)

    // Status fuera de orden: sent después de delivered se ignora.
    expect(
      evaluateEventOrdering({
        kind: 'status',
        incomingStatus: 'sent',
        currentStatus: 'delivered',
      })
    ).toEqual({ action: 'ignore_stale', reason: 'older_delivery_status' })

    // Status en orden: delivered -> read se aplica.
    expect(
      evaluateEventOrdering({
        kind: 'status',
        incomingStatus: 'read',
        currentStatus: 'delivered',
      })
    ).toEqual({ action: 'apply', reason: 'in_order' })

    // Mensaje viejo fuera de orden se detecta.
    expect(
      evaluateEventOrdering({
        kind: 'message',
        incomingTimestampMs: 1_700_000_000_000,
        latestProcessedTimestampMs: 1_700_000_060_000,
      })
    ).toEqual({ action: 'ignore_stale', reason: 'older_message_timestamp' })
  })

  it('4. defecto P0001 corregido en migración local, recuperación de leases y reconciliación CAS segura', () => {
    const sql = readFileSync(
      'supabase/migrations/20261124120000_whatsapp_r0_checkpoint_p0001_and_reconciliation.sql',
      'utf8'
    )
    expect(sql).toContain('whatsapp_internal_actor_context')
    expect(sql).toContain("auth.role() = 'service_role'")
    expect(sql).toContain('new.checked_by := me')
    expect(sql).toContain('cannot_replay_uncertain_effect')

    const jobs: InboundJobRecord[] = [
      {
        id: 'job-uncertain',
        eventKey: 'msg:1',
        phoneId: 'p1',
        sender: '521551',
        kind: 'message',
        status: 'processing',
        attempts: 1,
        effectStarted: true,
        stage: 'provider_request',
        errorCode: 'database_P0001',
        availableAt: R1_NOW_ISO,
        leaseToken: 'lease-1',
        leaseUntil: '2026-11-18T11:50:00.000Z',
        createdAt: '2026-11-18T11:40:00.000Z',
        updatedAt: '2026-11-18T11:45:00.000Z',
        trace: [],
      },
      {
        id: 'job-safe-retry',
        eventKey: 'msg:2',
        phoneId: 'p1',
        sender: '521552',
        kind: 'message',
        status: 'processing',
        attempts: 1,
        effectStarted: false,
        stage: 'claimed',
        errorCode: null,
        availableAt: R1_NOW_ISO,
        leaseToken: 'lease-2',
        leaseUntil: '2026-11-18T11:50:00.000Z',
        createdAt: '2026-11-18T11:40:00.000Z',
        updatedAt: '2026-11-18T11:45:00.000Z',
        trace: [],
      },
    ]

    const recovered = recoverExpiredLeases(jobs, '2026-11-18T12:00:00.000Z')
    expect(recovered.heldForReviewIds).toEqual(['job-uncertain'])
    expect(recovered.recoveredIds).toEqual(['job-safe-retry'])

    const uncertainReview = recovered.jobs.find((j) => j.id === 'job-uncertain')!
    expect(uncertainReview.status).toBe('review')

    // Nunca reencolar un trabajo con effectStarted=true.
    expect(
      reconcileReviewJob(uncertainReview, {
        expectedAttempts: 1,
        decision: 'requeue',
        reason: 'Intento inseguro de reenvío',
        actorUsuarioId: R1_USERS.superAdmin.id,
        nowIso: '2026-11-18T12:05:00.000Z',
      })
    ).toEqual({ ok: false, code: 'cannot_replay_uncertain_effect' })

    // Reconciliación CAS válida sin reenvío.
    const reconciled = reconcileReviewJob(uncertainReview, {
      expectedAttempts: 1,
      decision: 'reconciled_no_replay',
      reason: 'Confirmado en auditoría que el aviso se entregó; sin replay.',
      actorUsuarioId: R1_USERS.superAdmin.id,
      nowIso: '2026-11-18T12:05:00.000Z',
    })
    expect(reconciled.ok).toBe(true)
    if (reconciled.ok) {
      expect(reconciled.job.status).toBe('failed')
      expect(reconciled.job.stage).toBe('reconciled_no_replay')
      expect(reconciled.job.trace.at(-1)?.event).toBe('JOB_RECONCILED')
    }
  })

  it('5. consultas operativas y ejecutivas por WhatsApp: breves, máx 3 prioridades, indicadores y seguimiento', async () => {
    const db = createR1Db()
    const store = r1Store()

    const execTurn = await runChannelTurn(
      {
        identity: {
          supabase: createFakeSupabase(db),
          authUserId: R1_USERS.direction.user_id,
          usuarioId: R1_USERS.direction.id,
          rol: R1_USERS.direction.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215550002222',
        utterance: '¿Qué requiere mi atención hoy?',
      },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )

    expect(execTurn.handled).toBe(true)
    expect(execTurn.text.length).toBeLessThanOrEqual(900)
    expect(execTurn.text).not.toMatch(/[#*]/)
    // No más de 3 elementos numerados iniciales (1., 2., 3.).
    expect(execTurn.text).not.toMatch(/^4\.\s/m)
    // Incluye pregunta de seguimiento contextual.
    expect(execTurn.text).toMatch(/¿|Responde "/)
  })

  it('6. continuidad conversacional en WhatsApp y memoria R3 compartida web <-> WhatsApp por usuario corporativo', async () => {
    const db = createR1Db()
    const store = r1Store()
    const memoryStore = createMemoryStore({
      memories: [
        {
          id: 'mem-1',
          usuario_id: R1_USERS.lead.id,
          area_id: R1_USERS.lead.area,
          memory_type: 'preference',
          body: 'Priorizar cierres de inventario y cobranza',
          source_kind: 'session',
          source_ref: 'web',
          content_hash: 'hash-mem-1',
          validation_status: 'confirmed',
          access_level: 'owner',
          version: 1,
          supersedes_id: null,
          created_at: R1_NOW_ISO,
          updated_at: R1_NOW_ISO,
          expires_at: null,
          confirmed_by: R1_USERS.lead.id,
          confirmed_at: R1_NOW_ISO,
        },
      ],
      documents: [],
    })

    const first = await runChannelTurn(
      {
        identity: {
          supabase: createFakeSupabase(db),
          authUserId: R1_USERS.lead.user_id,
          usuarioId: R1_USERS.lead.id,
          rol: R1_USERS.lead.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215550001111',
        utterance: '¿Qué pendientes tiene Carlos?',
      },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
        memoryStore,
      }
    )
    expect(first.response.references.map((r) => r.id).sort()).toEqual(['a10', 'a9'])

    const followUp = await runChannelTurn(
      {
        identity: {
          supabase: createFakeSupabase(db),
          authUserId: R1_USERS.lead.user_id,
          usuarioId: R1_USERS.lead.id,
          rol: R1_USERS.lead.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215550001111',
        utterance: '¿Cuál es el más urgente?',
      },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
        memoryStore,
      }
    )
    expect(followUp.intent).toBe('who_most_urgent')
    expect(followUp.response.references.map((r) => r.id)).toEqual(['a9'])
  })

  it('7. notas de voz simuladas: auth, formato, tamaño, cero persistencia, texto inicial y TTS opcional', async () => {
    const rawBuffer = buildSyntheticOggOpusFixture({ durationSec: 4 })
    const okResult = await processWhatsAppVoiceNote(
      {
        waId: '5215550001111',
        usuarioId: R1_USERS.lead.id,
        active: true,
        aiAuthorized: true,
        replyAudioMode: 'audio',
      },
      { mediaId: 'media-123', mimeType: 'audio/ogg; codecs=opus' },
      {
        fetchMetaMedia: async () => ({ bytes: rawBuffer, mimeType: 'audio/ogg', fileSize: rawBuffer.byteLength }),
        transcribe: async () => ({ ok: true, transcript: '¿Cuáles acciones tengo atrasadas?', model: 'gemini-2.5-flash' }),
        runAssistant: async ({ transcript }) => ({ text: `Tienes 1 acción atrasada (${transcript}).` }),
        synthesizeAudio: async () => ({ audioBytes: new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), mimeType: 'audio/mpeg' }),
        deliverAudio: async () => ({ delivered: true, messageId: 'wamid.audio.1' }),
        voiceReplyEnabled: true,
      }
    )

    expect(okResult.ok).toBe(true)
    expect(okResult.audioRetained).toBe(false)
    // Buffer limpiado en memoria (todos ceros).
    expect(rawBuffer.every((byte) => byte === 0)).toBe(true)
    if (okResult.ok) {
      expect(okResult.transcript).toBe('¿Cuáles acciones tengo atrasadas?')
      expect(okResult.replyMode).toBe('text_and_audio')
      expect(okResult.audioDelivery.audioGenerated).toBe(true)
      expect(okResult.audioDelivery.audioSent).toBe(true)
      expect(okResult.optionalAudio?.mimeType).toBe('audio/mpeg')
    }

    // Formato no soportado (audio/amr) rechazado sin asumir soporte del proveedor.
    const amrRejected = await processWhatsAppVoiceNote(
      { waId: '5215550001111', usuarioId: R1_USERS.lead.id, active: true, aiAuthorized: true },
      { mediaId: 'media-amr', mimeType: 'audio/amr' },
      { runAssistant: async () => ({ text: 'unused' }) }
    )
    expect(amrRejected.ok).toBe(false)
    if (!amrRejected.ok) expect(amrRejected.code).toBe('unsupported_format')

    // Tamaño excesivo rechazado antes de descargar.
    const tooLarge = await processWhatsAppVoiceNote(
      { waId: '5215550001111', usuarioId: R1_USERS.lead.id, active: true, aiAuthorized: true },
      { mediaId: 'media-big', mimeType: 'audio/ogg', declaredByteLength: 5_000_000 },
      { runAssistant: async () => ({ text: 'unused' }) }
    )
    expect(tooLarge.ok).toBe(false)
    if (!tooLarge.ok) expect(tooLarge.code).toBe('audio_too_large')

    // Usuario inactivo rechazado.
    const inactive = await processWhatsAppVoiceNote(
      { waId: '5215550009999', usuarioId: R1_USERS.inactive.id, active: false, aiAuthorized: true },
      { mediaId: 'media-1', mimeType: 'audio/ogg' },
      { runAssistant: async () => ({ text: 'unused' }) }
    )
    expect(inactive.ok).toBe(false)
    if (!inactive.ok) expect(inactive.code).toBe('unlinked_or_inactive')
  })

  it('8 y 9. propuestas R2 con vínculo estricto, rechazo de "sí" ambiguo y modo R2 OFF sólo borradores', () => {
    const nowMs = Date.parse(R1_NOW_ISO)
    const p1 = buildProposalBinding({
      proposalId: 'op-1',
      usuarioId: R1_USERS.lead.id,
      operation: 'update_status',
      scope: 'accion:a1',
      summary: 'Marcar "Cerrar inventario" como Hecho',
      payload: { accionId: 'a1', estado: 'Hecho', expectedUpdatedAt: '2026-11-18T10:00:00Z' },
      nowMs,
    })
    const p2 = buildProposalBinding({
      proposalId: 'op-2',
      usuarioId: R1_USERS.lead.id,
      operation: 'register_blocker',
      scope: 'accion:a2',
      summary: 'Registrar bloqueo en "Revisar contratos"',
      payload: { accionId: 'a2', motivo: 'Falta firma' },
      nowMs,
    })

    // "sí" suelto jamás aprueba.
    const ambiguous = resolveWhatsAppProposalApproval({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1, p2],
      decision: parseWhatsAppApprovalIntent({ text: 'sí' }),
      executionMode: 'simulated',
      nowMs,
    })
    expect(ambiguous.status).toBe('ambiguous')

    // Botón exacto con proposalId + version aprueba en modo simulated.
    const buttonId = buildProposalConfirmButtonId(p1)
    const approved = resolveWhatsAppProposalApproval({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1, p2],
      decision: parseWhatsAppApprovalIntent({ buttonId }),
      executionMode: 'simulated',
      nowMs,
    })
    expect(approved.status).toBe('ready_to_execute')

    // Versión alterada rechazada.
    const mismatch = resolveWhatsAppProposalApproval({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1],
      decision: parseWhatsAppApprovalIntent({ buttonId: `r2_confirm:op-1:DEADBEEF` }),
      executionMode: 'simulated',
      nowMs,
    })
    expect(mismatch.status).toBe('version_mismatch')

    // Expirada rechazada.
    const expired = resolveWhatsAppProposalApproval({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1],
      decision: parseWhatsAppApprovalIntent({ buttonId }),
      executionMode: 'simulated',
      nowMs: nowMs + 60 * 60 * 1000,
    })
    expect(expired.status).toBe('expired')

    // Otro usuario intentando confirmar propuesta ajena es bloqueado.
    const foreign = resolveWhatsAppProposalApproval({
      actorUsuarioId: R1_USERS.carlos.id,
      actorActive: true,
      pending: [p1],
      decision: parseWhatsAppApprovalIntent({ buttonId }),
      executionMode: 'simulated',
      nowMs,
    })
    expect(foreign.status).toBe('forbidden')

    // R2 OFF (disabled): sólo borradores, jamás ejecuta.
    const r2Off = resolveWhatsAppProposalApproval({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1],
      decision: parseWhatsAppApprovalIntent({ buttonId }),
      executionMode: 'disabled',
      nowMs,
    })
    expect(r2Off.status).toBe('draft_only_r2_off')
    expect(formatWhatsAppProposalPrompt(p1, { executionMode: 'disabled' })).toContain('R2 deshabilitado')
  })

  it('10. fallos del proveedor: resultados inciertos van a review sin reenvío; 429 pre-efecto reintenta acotadamente', () => {
    const timeoutOutcome = classifyProviderOutcome({ timedOut: true, attempts: 1 })
    expect(timeoutOutcome).toMatchObject({
      ok: false,
      uncertain: true,
      retryableWithoutReplay: false,
      nextStatus: 'review',
      errorCode: 'provider_outcome_unknown',
    })

    const missingId = classifyProviderOutcome({ httpStatus: 200, hasMessageId: false, attempts: 1 })
    expect(missingId).toMatchObject({ uncertain: true, nextStatus: 'review', errorCode: 'provider_missing_message_id' })

    const http500 = classifyProviderOutcome({ httpStatus: 502, hasMessageId: false, attempts: 1 })
    expect(http500).toMatchObject({ uncertain: true, nextStatus: 'review', errorCode: 'provider_http_502' })

    const rateLimited = classifyProviderOutcome({
      httpStatus: 429,
      attempts: 1,
      effectStartedBeforeSend: false,
    })
    expect(rateLimited).toMatchObject({
      uncertain: false,
      retryableWithoutReplay: true,
      nextStatus: 'pending',
    })
  })

  it('11. recordatorios proactivos simulados: preferencias, horarios, consentimiento, dedup, topes y ventana 24h', () => {
    const prefs: ProactiveUserPreferences = {
      usuarioId: R1_USERS.lead.id,
      waId: '5215550001111',
      active: true,
      consent: true,
      timezone: 'America/Mexico_City',
      windowStartHour: 8,
      windowEndHour: 19,
      allowedWeekdays: [1, 2, 3, 4, 5],
      enabledCategories: new Set(PROACTIVE_CATEGORIES),
      maxPerDay: 2,
      minIntervalMinutes: 0,
    }

    const candidate: ProactiveCandidate = {
      category: 'due_reminder',
      usuarioId: R1_USERS.lead.id,
      entityId: 'a1',
      title: 'Cerrar inventario',
      detail: 'Vence hoy a las 17:00',
      dateBucket: '2026-11-18',
      href: '/acciones/a1',
    }

    // Dentro de ventana laboral (10:00 CDMX = 16:00 UTC) y ventana 24h abierta -> session_text dry-run.
    const allowedSession = evaluateProactiveFollowup(candidate, prefs, {
      nowIso: '2026-11-18T16:00:00.000Z',
      lastInboundAt: '2026-11-18T12:00:00.000Z',
      sentTodayCount: 0,
      sentDedupeKeys: new Set(),
    })
    expect(allowedSession).toMatchObject({ allowed: true, dryRun: true, transport: 'session_text' })

    // Fuera de ventana 24h sin plantilla aprobada -> bloqueado.
    const blockedNoTemplate = evaluateProactiveFollowup(candidate, prefs, {
      nowIso: '2026-11-18T16:00:00.000Z',
      lastInboundAt: '2026-11-16T10:00:00.000Z',
      sentTodayCount: 0,
      sentDedupeKeys: new Set(),
    })
    expect(blockedNoTemplate).toMatchObject({ allowed: false, reason: 'template_required_outside_24h' })

    // Fuera de ventana 24h CON plantilla aprobada -> approved_template dry-run.
    const allowedTemplate = evaluateProactiveFollowup(candidate, prefs, {
      nowIso: '2026-11-18T16:00:00.000Z',
      lastInboundAt: '2026-11-16T10:00:00.000Z',
      sentTodayCount: 0,
      sentDedupeKeys: new Set(),
      approvedTemplates: {
        due_reminder: { name: 'recordatorio_vencimiento_v1', language: 'es_MX' },
      },
    })
    expect(allowedTemplate).toMatchObject({ allowed: true, dryRun: true, transport: 'approved_template' })

    // Sin consentimiento -> bloqueado.
    expect(
      evaluateProactiveFollowup(candidate, { ...prefs, consent: false }, {
        nowIso: '2026-11-18T16:00:00.000Z',
        lastInboundAt: '2026-11-18T12:00:00.000Z',
        sentTodayCount: 0,
        sentDedupeKeys: new Set(),
      })
    ).toMatchObject({ allowed: false, reason: 'missing_consent' })

    // Horario de descanso (23:00 CDMX = 05:00 UTC) -> bloqueado.
    expect(
      evaluateProactiveFollowup(candidate, prefs, {
        nowIso: '2026-11-19T05:00:00.000Z',
        lastInboundAt: '2026-11-18T12:00:00.000Z',
        sentTodayCount: 0,
        sentDedupeKeys: new Set(),
      })
    ).toMatchObject({ allowed: false, reason: 'outside_schedule_window' })

    // Lote: deduplica repetidos y aplica tope diario (maxPerDay=2).
    const batch = planProactiveBatch(
      [
        candidate,
        candidate, // duplicado
        { ...candidate, category: 'pending_verification', entityId: 'a2', title: 'Validar cierre' },
        { ...candidate, category: 'daily_summary', entityId: 'summary', title: 'Resumen diario' },
      ],
      prefs,
      {
        nowIso: '2026-11-18T16:00:00.000Z',
        lastInboundAt: '2026-11-18T12:00:00.000Z',
        sentTodayCount: 0,
        sentDedupeKeys: new Set(),
      }
    )
    expect(batch[0]!.decision).toMatchObject({ allowed: true })
    expect(batch[1]!.decision).toMatchObject({ allowed: false, reason: 'duplicate_suppressed' })
    expect(batch[2]!.decision).toMatchObject({ allowed: true })
    expect(batch[3]!.decision).toMatchObject({ allowed: false, reason: 'daily_cap_reached' })
  })

  it('12. aislamiento estricto entre usuarios y sesiones concurrentes', async () => {
    const db = createR1Db()
    const store = r1Store()

    await runChannelTurn(
      {
        identity: {
          supabase: createFakeSupabase(db),
          authUserId: R1_USERS.lead.user_id,
          usuarioId: R1_USERS.lead.id,
          rol: R1_USERS.lead.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215550001111',
        utterance: '¿Qué pendientes tiene Carlos?',
      },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )

    // Un analista en otro hilo no hereda contexto ni ve datos privados del lead.
    const analystTurn = await runChannelTurn(
      {
        identity: {
          supabase: createFakeSupabase(db),
          authUserId: R1_USERS.analyst.user_id,
          usuarioId: R1_USERS.analyst.id,
          rol: R1_USERS.analyst.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215550003333',
        utterance: '¿Cuál es el más urgente?',
      },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )

    expect(analystTurn.text).not.toContain('Cerrar inventario')
    expect(analystTurn.text).not.toContain('Plan privado')
  })
})
