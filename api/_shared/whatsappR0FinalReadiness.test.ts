/**
 * SCRUMBAN — R0 | FINAL INTEGRATION READINESS
 * Suite integral local para:
 * - Compatibilidad definitiva con R2 (feature/r2-executive-action @ 345c2b6) y cierre de rutas legacy.
 * - Endurecimiento completo de notas de voz (OGG/Opus, magic bytes, SSRF, 503, ambigüedades, bloqueo de escritura).
 * - Modalidades de respuesta por audio (text | audio | smart) con fallback y verdad en entrega.
 * - Harness QA multicanal de 11 escenarios con transporte simulado y guardia de número único QA.
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
  buildSyntheticOggOpusFixture,
  sniffAudioMimeFromBytes,
  transcribeAudioBase64WithGemini,
  validateAudioPayload,
} from './audioTranscription.js'
import {
  analyzeVoiceTranscript,
  fetchWhatsAppMediaFromGraph,
  processWhatsAppVoiceNote,
  validateMetaMediaDownloadUrl,
} from './whatsappVoiceNotes.js'
import {
  decideWhatsAppReplyModality,
  prepareWhatsAppAudioReply,
} from './whatsappAudioReply.js'
import {
  buildProposalBinding,
  buildProposalCancelButtonId,
  buildProposalConfirmButtonId,
  DEFINITIVE_R2_AGENT_TOOLS,
  executeWhatsAppR2Decision,
  formatWhatsAppBatchProposalPrompt,
  formatWhatsAppR2ExecutionResult,
  isBoardWriteToolGatedByR2,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
  type WhatsAppProposalBinding,
} from './whatsappR2Adapter.js'
import {
  classifyProviderOutcome,
  deduplicateInboundEvents,
  evaluateEventOrdering,
  reconcileReviewJob,
  type InboundJobRecord,
} from './whatsappReconciliation.js'
import {
  evaluateProactiveFollowup,
  PROACTIVE_CATEGORIES,
  type ProactiveCandidate,
  type ProactiveUserPreferences,
} from './whatsappProactive.js'
// @ts-expect-error JS QA harness module
import {
  assertRecipientAllowedForQa,
  createSimulatedWhatsAppTransport,
  resolveQaWhatsAppSingleNumberTarget,
  runR0MultichannelQaSuite,
} from '../../scripts/qa/r0MultichannelHarness.mjs'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})

afterAll(() => {
  vi.useRealTimers()
})

describe('R0 Final Readiness — 2. Compatibilidad con R2 definitivo (345c2b6) y cierre legacy', () => {
  const nowMs = Date.parse(R1_NOW_ISO)

  it('soporta las 7 herramientas R2 definitivas, propuestas múltiples, edición que invalida versión y cancelación', async () => {
    expect(Object.keys(DEFINITIVE_R2_AGENT_TOOLS).sort()).toEqual([
      'agent_add_comment',
      'agent_create_action',
      'agent_notify_responsable',
      'agent_register_blocker',
      'agent_set_action_status',
      'agent_update_fields',
      'agent_verify_action',
    ])

    const p1 = buildProposalBinding({
      proposalId: 'op-update-1',
      usuarioId: R1_USERS.lead.id,
      operation: 'agent_update_fields',
      scope: 'accion:a1',
      summary: 'Actualizar fecha de "Cerrar inventario" a 2026-11-25',
      payload: { accionId: 'a1', campos: ['fecha'], fecha: '2026-11-25', expectedUpdatedAt: '2026-11-18T10:00:00Z' },
      batchId: 'batch-1',
      nowMs,
    })
    const p2 = buildProposalBinding({
      proposalId: 'op-verify-2',
      usuarioId: R1_USERS.lead.id,
      operation: 'agent_verify_action',
      scope: 'accion:a2',
      summary: 'Verificar "Aprobar póliza"',
      payload: { accionId: 'a2', expectedUpdatedAt: '2026-11-18T10:05:00Z' },
      batchId: 'batch-1',
      nowMs,
    })

    const batchPrompt = formatWhatsAppBatchProposalPrompt([p1, p2], { executionMode: 'simulated' })
    expect(batchPrompt).toContain(p1.version)
    expect(batchPrompt).toContain(p2.version)
    expect(batchPrompt).toContain('Un "sí" suelto no aprueba ninguna')

    // Editar p1 (editable) genera una versión nueva e invalida la anterior.
    const editDecision = parseWhatsAppApprovalIntent({
      text: `editar ${p1.version} fecha=2026-11-28 prioridad=P1_Alta`,
    })
    const edited = await executeWhatsAppR2Decision({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1, p2],
      decision: editDecision,
      executionMode: 'simulated',
      nowMs,
      executor: {
        revalidatePermission: async () => ({ allowed: true }),
        claimAndExecute: async () => ({ ok: true, result: {} }),
        cancelOp: async () => {},
        editOp: async (b, patch) => ({
          proposalId: b.proposalId,
          summary: `Actualizar fecha a ${patch.fecha} y prioridad ${patch.prioridad}`,
          payload: {
            accionId: 'a1',
            campos: ['fecha', 'prioridad'],
            fecha: patch.fecha,
            prioridad: patch.prioridad,
            expectedUpdatedAt: '2026-11-18T10:00:00Z',
          },
        }),
      },
    })
    expect(edited.status).toBe('edited')
    if (edited.status === 'edited') {
      expect(edited.binding.version).not.toBe(p1.version)
      // Intentar aprobar con la versión vieja falla por version_mismatch.
      const staleConfirm = resolveWhatsAppProposalApproval({
        actorUsuarioId: R1_USERS.lead.id,
        actorActive: true,
        pending: [edited.binding, p2],
        decision: parseWhatsAppApprovalIntent({ text: `confirmar ${p1.version}` }),
        executionMode: 'simulated',
        nowMs,
      })
      expect(staleConfirm.status).toBe('version_mismatch')
    }

    // Intentar editar una herramienta no editable (agent_verify_action) se rechaza.
    const nonEditable = resolveWhatsAppProposalApproval({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1, p2],
      decision: parseWhatsAppApprovalIntent({ text: `editar ${p2.version} fecha=2026-11-28` }),
      executionMode: 'simulated',
      nowMs,
    })
    expect(nonEditable.status).toBe('not_editable')

    // Cancelación explícita por botón vinculado.
    let canceledId = ''
    const canceled = await executeWhatsAppR2Decision({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [p1, p2],
      decision: parseWhatsAppApprovalIntent({ buttonId: buildProposalCancelButtonId(p2) }),
      executionMode: 'simulated',
      nowMs,
      executor: {
        revalidatePermission: async () => ({ allowed: true }),
        claimAndExecute: async () => ({ ok: true, result: {} }),
        cancelOp: async (b) => {
          canceledId = b.proposalId
        },
      },
    })
    expect(canceled.status).toBe('canceled')
    expect(canceledId).toBe('op-verify-2')
  })

  it('revalida permisos al ejecutar, bloquea concurrencia doble, formatea resultados y cierra R2 OFF', async () => {
    const binding = buildProposalBinding({
      proposalId: 'op-status-1',
      usuarioId: R1_USERS.lead.id,
      operation: 'agent_set_action_status',
      scope: 'accion:a1',
      summary: 'Cambiar estado a Hecho',
      payload: { accionId: 'a1', estado: 'Hecho', expectedUpdatedAt: '2026-11-18T10:00:00Z' },
      nowMs,
    })
    const confirmDecision = parseWhatsAppApprovalIntent({
      buttonId: buildProposalConfirmButtonId(binding),
    })

    // 1) Revalidación de permisos revocados -> no ejecuta.
    const execSpy = vi.fn(async () => ({ ok: true as const, result: { estado: 'Hecho' } }))
    const revoked = await executeWhatsAppR2Decision({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [binding],
      decision: confirmDecision,
      executionMode: 'simulated',
      nowMs,
      executor: {
        revalidatePermission: async () => ({ allowed: false, reason: 'Permiso revocado por cambio de rol.' }),
        claimAndExecute: execSpy,
        cancelOp: async () => {},
      },
    })
    expect(revoked.status).toBe('permission_revoked')
    expect(execSpy).not.toHaveBeenCalled()

    // 2) Concurrencia: doble confirmación en vuelo bloquea la segunda antes de ejecutar.
    const inFlightLocks = new Set<string>([`${binding.usuarioId}:${binding.proposalId}`])
    const concurrent = await executeWhatsAppR2Decision({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [binding],
      decision: confirmDecision,
      executionMode: 'simulated',
      nowMs,
      inFlightLocks,
      executor: {
        revalidatePermission: async () => ({ allowed: true }),
        claimAndExecute: execSpy,
        cancelOp: async () => {},
      },
    })
    expect(concurrent.status).toBe('concurrency_conflict')
    expect(execSpy).not.toHaveBeenCalled()

    // 3) Conflicto CAS en base de datos (40001) propagado limpiamente.
    const dbConflict = await executeWhatsAppR2Decision({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [binding],
      decision: confirmDecision,
      executionMode: 'simulated',
      nowMs,
      executor: {
        revalidatePermission: async () => ({ allowed: true }),
        claimAndExecute: async () => ({
          ok: false,
          code: 'concurrency_conflict',
          message: 'conflict: la acción cambió después de la confirmación.',
        }),
        cancelOp: async () => {},
      },
    })
    expect(dbConflict.status).toBe('concurrency_conflict')

    // 4) Ejecución aprobada + confirmación de resultado (incl. replay idempotente).
    const executed = await executeWhatsAppR2Decision({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [binding],
      decision: confirmDecision,
      executionMode: 'simulated',
      nowMs,
      executor: {
        revalidatePermission: async () => ({ allowed: true }),
        claimAndExecute: async () => ({
          ok: true,
          result: { ok: true, estado: 'Hecho', href: '/acciones/a1' },
        }),
        cancelOp: async () => {},
      },
    })
    expect(executed.status).toBe('executed')
    if (executed.status === 'executed') {
      expect(executed.message).toContain('Estado actual: Hecho')
      expect(executed.message).toContain('/acciones/a1')
    }
    expect(formatWhatsAppR2ExecutionResult(binding, { replayed: true, estado: 'Hecho' })).toContain('sin duplicar')

    // 5) R2 OFF (disabled): nunca invoca claimAndExecute.
    const r2Off = await executeWhatsAppR2Decision({
      actorUsuarioId: R1_USERS.lead.id,
      actorActive: true,
      pending: [binding],
      decision: confirmDecision,
      executionMode: 'disabled',
      nowMs,
      executor: {
        revalidatePermission: async () => ({ allowed: true }),
        claimAndExecute: execSpy,
        cancelOp: async () => {},
      },
    })
    expect(r2Off.status).toBe('rejected')
    expect(execSpy).not.toHaveBeenCalled()
  })

  it('cierra rutas legacy de WhatsApp para que ninguna escritura evada compuertas R2 ni "sí" suelto', () => {
    const src = readFileSync('api/whatsapp-assistant.ts', 'utf8')
    expect(src).toContain('r2OptionsFromServerEnv(')
    expect(src).toContain('isBoardWriteToolGatedByR2')
    expect(src).toContain('R2_EXECUTION_DISABLED_MESSAGE')
    expect(src).not.toContain('Escribe si para crearla o no para cancelar.')
    expect(src).not.toContain('if (activeRows.length > 1 || r2Decision.kind === \'confirm_code\')')
    expect(isBoardWriteToolGatedByR2('create_action')).toBe(true)
    expect(isBoardWriteToolGatedByR2('agent_update_fields')).toBe(true)
    expect(isBoardWriteToolGatedByR2('agent_verify_action')).toBe(true)
  })
})

describe('R0 Final Readiness — 3. Notas de voz (OGG/Opus, magic bytes, SSRF, 503 y seguridad)', () => {
  it('valida OGG/Opus sintético, rechaza MIME falsificado, corrupto, vacío, duración excesiva y descarga incompleta', async () => {
    const ogg = buildSyntheticOggOpusFixture({ durationSec: 5 })
    const sniffed = sniffAudioMimeFromBytes(ogg)
    expect(sniffed).toEqual({ mimeType: 'audio/ogg', codec: 'opus', estimatedDurationSec: 5 })
    expect(validateAudioPayload({ mimeType: 'audio/ogg; codecs=opus', bytes: ogg }).ok).toBe(true)

    // MIME declarado audio/ogg pero bytes reales AMR -> rechazado.
    const fakeAmr = new Uint8Array(80)
    fakeAmr.set(Buffer.from('#!AMR\n'), 0)
    const amrSpoof = validateAudioPayload({ mimeType: 'audio/ogg', bytes: fakeAmr })
    expect(amrSpoof.ok).toBe(false)
    if (!amrSpoof.ok) expect(amrSpoof.code).toBe('unsupported_format')

    // MIME declarado audio/ogg pero bytes reales WAV -> mime_mismatch.
    const fakeWav = new Uint8Array(80)
    fakeWav.set(Buffer.from('RIFF'), 0)
    fakeWav.set(Buffer.from('WAVE'), 8)
    const wavMismatch = validateAudioPayload({ mimeType: 'audio/ogg', bytes: fakeWav })
    expect(wavMismatch.ok).toBe(false)
    if (!wavMismatch.ok) expect(wavMismatch.code).toBe('mime_mismatch')

    // Audio vacío / corrupto (HTML o bytes aleatorios).
    const corrupt = validateAudioPayload({
      mimeType: 'audio/ogg',
      bytes: Buffer.from('<html>not audio payload at all 1234567890123456789012345678901234567890</html>'),
    })
    expect(corrupt.ok).toBe(false)
    if (!corrupt.ok) expect(corrupt.code).toBe('corrupt_audio')

    // Duración mayor a 300s rechazada.
    const tooLong = buildSyntheticOggOpusFixture({ durationSec: 420 })
    const longRes = validateAudioPayload({ mimeType: 'audio/ogg', bytes: tooLong })
    expect(longRes.ok).toBe(false)
    if (!longRes.ok) expect(longRes.code).toBe('audio_too_long')

    // Descarga incompleta (expectedByteLength > bytes recibidos).
    const incomplete = await processWhatsAppVoiceNote(
      { waId: '5215550001111', usuarioId: R1_USERS.lead.id, active: true, aiAuthorized: true },
      { mediaId: 'media-inc', mimeType: 'audio/ogg' },
      {
        fetchMetaMedia: async () => ({
          bytes: buildSyntheticOggOpusFixture({ durationSec: 3 }),
          mimeType: 'audio/ogg',
          fileSize: 100,
          expectedByteLength: 2048,
        }),
        runAssistant: async () => ({ text: 'unused' }),
      }
    )
    expect(incomplete.ok).toBe(false)
    if (!incomplete.ok) expect(incomplete.code).toBe('incomplete_download')
  })

  it('bloquea SSRF y exposición de tokens en URLs de descarga y redirects', async () => {
    expect(validateMetaMediaDownloadUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1').ok).toBe(true)
    expect(validateMetaMediaDownloadUrl('https://mmg.whatsapp.net/v/t62.7117-24/abc').ok).toBe(true)
    expect(validateMetaMediaDownloadUrl('http://lookaside.fbsbx.com/audio.ogg').ok).toBe(false)
    expect(validateMetaMediaDownloadUrl('https://169.254.169.254/latest/meta-data').ok).toBe(false)
    expect(validateMetaMediaDownloadUrl('https://127.0.0.1/internal').ok).toBe(false)
    expect(validateMetaMediaDownloadUrl('https://evil.example.com/steal-token').ok).toBe(false)
    expect(validateMetaMediaDownloadUrl('https://user:pass@lookaside.fbsbx.com/a').ok).toBe(false)

    // Simular Meta Graph devolviendo URL atacante (SSRF) -> rechazado sin enviar Bearer token al atacante.
    const seenUrls: string[] = []
    const ssrfFetch = (async (url: string | URL) => {
      const s = String(url)
      seenUrls.push(s)
      if (s.startsWith('https://graph.facebook.com/')) {
        return new Response(
          JSON.stringify({ url: 'https://169.254.169.254/latest/meta-data', mime_type: 'audio/ogg', file_size: 120 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      throw new Error('should_not_fetch_disallowed_host')
    }) as typeof fetch

    await expect(
      fetchWhatsAppMediaFromGraph({ mediaId: 'media1234', accessToken: 'SECRET_WA_TOKEN', fetchImpl: ssrfFetch })
    ).rejects.toThrow('media_url_rejected')
    expect(seenUrls).toHaveLength(1)

    // Simular redirect cross-origin a host no permitido -> rechazado sin fuga de token.
    const redirectFetch = (async (url: string | URL) => {
      const s = String(url)
      if (s.startsWith('https://graph.facebook.com/')) {
        return new Response(
          JSON.stringify({ url: 'https://lookaside.fbsbx.com/media/1', mime_type: 'audio/ogg', file_size: 80 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(null, { status: 302, headers: { location: 'https://attacker.invalid/leak' } })
    }) as typeof fetch

    await expect(
      fetchWhatsAppMediaFromGraph({ mediaId: 'media1234', accessToken: 'SECRET_WA_TOKEN', fetchImpl: redirectFetch })
    ).rejects.toThrow('media_url_rejected')
  })

  it('maneja transcripción vacía, Gemini 503, instrucciones múltiples, ambigüedades, continuidad texto↔audio y bloquea escrituras inciertas', async () => {
    // Gemini 503 en todos los candidatos -> provider_unavailable (retryable).
    const g503 = await transcribeAudioBase64WithGemini({
      audioBase64: Buffer.from(buildSyntheticOggOpusFixture()).toString('base64'),
      mimeType: 'audio/ogg',
      apiKey: 'fake-key-local',
      fetchImpl: (async () => new Response('Service Unavailable', { status: 503 })) as typeof fetch,
    })
    expect(g503.ok).toBe(false)
    if (!g503.ok) {
      expect(g503.status).toBe(503)
      expect(g503.code).toBe('provider_unavailable')
    }

    // Transcripción vacía rechazada limpiamente.
    const emptyRes = await processWhatsAppVoiceNote(
      { waId: '5215550001111', usuarioId: R1_USERS.lead.id, active: true, aiAuthorized: true },
      { mediaId: 'media-empty', mimeType: 'audio/ogg' },
      {
        fetchMetaMedia: async () => {
          const bytes = buildSyntheticOggOpusFixture({ durationSec: 2 })
          return { bytes, mimeType: 'audio/ogg', fileSize: bytes.byteLength }
        },
        transcribe: async () => ({ ok: true, transcript: '   ', model: 'gemini-2.5-flash' }),
        runAssistant: async () => ({ text: 'unused' }),
      }
    )
    expect(emptyRes.ok).toBe(false)
    if (!emptyRes.ok) expect(emptyRes.code).toBe('empty_transcript')

    // Instrucciones múltiples + nombre/fecha/referencia ambigua -> NO llama runAssistant ni ejecuta escrituras.
    const assistantSpy = vi.fn(async () => ({ text: 'should not run' }))
    const riskyVoice = await processWhatsAppVoiceNote(
      { waId: '5215550001111', usuarioId: R1_USERS.lead.id, active: true, aiAuthorized: true },
      { mediaId: 'media-risky', mimeType: 'audio/ogg' },
      {
        fetchMetaMedia: async () => {
          const bytes = buildSyntheticOggOpusFixture({ durationSec: 6 })
          return { bytes, mimeType: 'audio/ogg', fileSize: bytes.byteLength }
        },
        transcribe: async () => ({
          ok: true,
          transcript: 'Cierra esa tarea y también pásaselo a Juan para el viernes [inaudible]',
          model: 'gemini-2.5-flash',
        }),
        runAssistant: assistantSpy,
      }
    )
    expect(riskyVoice.ok).toBe(true)
    expect(assistantSpy).not.toHaveBeenCalled()
    if (riskyVoice.ok) {
      expect(riskyVoice.safety.multipleInstructions).toBe(true)
      expect(riskyVoice.safety.ambiguities).toEqual(
        expect.arrayContaining(['ambiguous_reference', 'ambiguous_date', 'ambiguous_person'])
      )
      expect(riskyVoice.safety.executionBlockedFromVoice).toBe(true)
      expect(riskyVoice.replyText).toContain('No se aplicó ningún cambio')
    }

    // Continuidad texto -> audio: con contexto activo previo, la referencia no se marca ambigua.
    const withCtx = analyzeVoiceTranscript('¿Cómo va esa tarea?', {
      activeSubject: 'Cerrar inventario mensual',
      recentTurns: [{ role: 'user', content: 'Muéstrame Cerrar inventario mensual', modality: 'text' }],
    })
    expect(withCtx.ambiguities).not.toContain('ambiguous_reference')
    expect(withCtx.clarificationPrompt).toBeNull()
  })
})

describe('R0 Final Readiness — 4. Modalidades de respuesta por audio (text | audio | smart)', () => {
  it('en modo smart prioriza audio para respuestas breves y texto para indicadores, propuestas, links y datos estructurados', () => {
    expect(
      decideWhatsAppReplyModality('Todo al día hoy, no tienes bloqueos urgentes.', { mode: 'smart' })
    ).toMatchObject({ selectedModality: 'audio', reason: 'smart_brief_conversational' })

    expect(
      decideWhatsAppReplyModality('Avance OKR: 72%. Vencidas: 2, Bloqueadas: 1.', { mode: 'smart' })
    ).toMatchObject({ selectedModality: 'text', reason: 'smart_indicators_require_text' })

    expect(
      decideWhatsAppReplyModality('Propuesta preparada. Código: ABCD1234. Responde confirmar ABCD1234.', {
        mode: 'smart',
      })
    ).toMatchObject({ selectedModality: 'text', reason: 'smart_proposal_requires_text' })

    expect(
      decideWhatsAppReplyModality('1. Revisar póliza\n2. Cerrar inventario\n3. Validar reporte', { mode: 'smart' })
    ).toMatchObject({ selectedModality: 'text', reason: 'smart_structured_requires_text' })

    expect(
      decideWhatsAppReplyModality('Consulta el detalle en https://app.scrumban.local/acciones/a1', { mode: 'smart' })
    ).toMatchObject({ selectedModality: 'text', reason: 'smart_links_require_text' })
  })

  it('nunca afirma que el audio se envió si sólo fue generado, y hace fallback limpio a texto cuando TTS está OFF o falla', async () => {
    // 1) TTS deshabilitado (ElevenLabs nunca activado remotamente) -> fallback a texto.
    const disabled = await prepareWhatsAppAudioReply({
      replyText: 'Listo, todo está en orden hoy.',
      preference: { mode: 'audio', ttsEnabled: false },
    })
    expect(disabled).toMatchObject({
      selectedModality: 'text',
      audioGenerated: false,
      audioSent: false,
      fallbackUsed: true,
      fallbackReason: 'tts_disabled',
      audioRetained: false,
    })

    // 2) Audio generado en memoria SIN transporte de entrega -> audioGenerated=true, audioSent=FALSE.
    const synthBuf = new Uint8Array([0x49, 0x44, 0x33, 10, 20, 30])
    const generatedOnly = await prepareWhatsAppAudioReply({
      replyText: 'Todo en orden hoy.',
      preference: { mode: 'smart', ttsEnabled: true },
      synthesize: async () => ({ audioBytes: synthBuf, mimeType: 'audio/mpeg' }),
    })
    expect(generatedOnly.audioGenerated).toBe(true)
    expect(generatedOnly.audioSent).toBe(false)
    expect(generatedOnly.audioRetained).toBe(false)
    expect(synthBuf.every((b) => b === 0)).toBe(true)

    // 3) Error en transporte de entrega -> fallback a texto y audioSent=false.
    const deliveryFailed = await prepareWhatsAppAudioReply({
      replyText: 'Todo en orden hoy.',
      preference: { mode: 'audio', ttsEnabled: true },
      synthesize: async () => ({ audioBytes: new Uint8Array([0x49, 0x44, 0x33, 1]), mimeType: 'audio/mpeg' }),
      deliverAudio: async () => ({ delivered: false, messageId: null }),
    })
    expect(deliveryFailed).toMatchObject({
      selectedModality: 'text',
      audioGenerated: true,
      audioSent: false,
      fallbackUsed: true,
      fallbackReason: 'audio_delivery_failed',
    })
  })
})

describe('R0 Final Readiness — 5. Harness QA Multicanal (11 escenarios simulados + guardia QA 1 número)', () => {
  it('aprueba los 11 escenarios multicanal R0 en transporte simulado aislado', async () => {
    const transport = createSimulatedWhatsAppTransport()
    const db = createR1Db()
    const store = r1Store()
    const memoryStore = createMemoryStore({
      memories: [
        {
          id: 'mem-web-1',
          usuario_id: R1_USERS.lead.id,
          area_id: R1_USERS.lead.area,
          memory_type: 'preference',
          body: 'Seguir prioridad de inventario antes de cobranza en cierre mensual',
          source_kind: 'session',
          source_ref: 'web-tab-1',
          content_hash: 'hash-mem-web-1',
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
      documents: [
        {
          id: 'doc-ops-1',
          logical_id: 'politica-cierres-operativos',
          title: 'Política de cierres operativos',
          body: 'Toda acción en Hecho requiere evidencia antes de pasar a Verificado.',
          version: 1,
          status: 'published',
          access_level: 'area',
          area_id: R1_USERS.lead.area,
          content_hash: 'hash-doc-ops-1',
          source_label: 'Manual Operativo v1',
          published_at: R1_NOW_ISO,
          withdrawn_at: null,
        },
      ],
    })
    const nowMs = Date.parse(R1_NOW_ISO)

    const report = await runR0MultichannelQaSuite({
      scenarios: {
        'R0-MC-01': async () => {
          const turn = await runChannelTurn(
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
            { dispatch: (a, n, args) => dispatchCopilotTool(a, n, args), store, audit: memoryQueryAuditSink([]), today: () => R1_TODAY }
          )
          expect(turn.handled).toBe(true)
          expect(turn.text.length).toBeLessThanOrEqual(900)
          expect(turn.text).not.toMatch(/[#*]/)
          await transport.sendText({ to: '5215550002222', body: turn.text })
          return { chars: turn.text.length }
        },

        'R0-MC-02': async () => {
          const voice = await processWhatsAppVoiceNote(
            { waId: '5215550001111', usuarioId: R1_USERS.lead.id, active: true, aiAuthorized: true, replyAudioMode: 'smart' },
            { mediaId: 'media-qa-1', mimeType: 'audio/ogg; codecs=opus' },
            {
              fetchMetaMedia: async () => {
                const bytes = buildSyntheticOggOpusFixture({ durationSec: 3 })
                return { bytes, mimeType: 'audio/ogg', fileSize: bytes.byteLength }
              },
              transcribe: async () => ({ ok: true, transcript: '¿Qué tengo pendiente hoy?', model: 'gemini-2.5-flash' }),
              runAssistant: async ({ transcript }) => {
                const turn = await runChannelTurn(
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
                    utterance: transcript,
                  },
                  { dispatch: (a, n, args) => dispatchCopilotTool(a, n, args), store, audit: memoryQueryAuditSink([]), today: () => R1_TODAY }
                )
                return { text: turn.text }
              },
              voiceReplyEnabled: false,
            }
          )
          expect(voice.ok).toBe(true)
          expect(voice.audioRetained).toBe(false)
          return { transcript: voice.ok ? voice.transcript : null }
        },

        'R0-MC-03': async () => {
          // Conversación iniciada en web -> continuada por el mismo usuario corporativo en WhatsApp.
          const webTurn = await runChannelTurn(
            {
              identity: {
                supabase: createFakeSupabase(db),
                authUserId: R1_USERS.lead.user_id,
                usuarioId: R1_USERS.lead.id,
                rol: R1_USERS.lead.rol,
                active: true,
              },
              channel: 'web',
              sessionId: 'web-tab-1',
              utterance: '¿Qué pendientes tiene Carlos?',
            },
            { dispatch: (a, n, args) => dispatchCopilotTool(a, n, args), store, audit: memoryQueryAuditSink([]), today: () => R1_TODAY, memoryStore }
          )
          expect(webTurn.handled).toBe(true)
          const waTurn = await runChannelTurn(
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
            { dispatch: (a, n, args) => dispatchCopilotTool(a, n, args), store, audit: memoryQueryAuditSink([]), today: () => R1_TODAY, memoryStore }
          )
          expect(waTurn.handled).toBe(true)
          expect(waTurn.text).toContain('Cerrar inventario')
          return { channels: ['web', 'whatsapp'] }
        },

        'R0-MC-04': async () => {
          const allowedRecall = memoryStore.recall(
            {
              usuarioId: R1_USERS.lead.id,
              areaId: R1_USERS.lead.area,
              canReadProject: false,
              visibleAreaIds: [R1_USERS.lead.area],
            },
            'cierres operativos evidencia'
          )
          expect(allowedRecall.ok).toBe(true)
          if (allowedRecall.ok) {
            expect(allowedRecall.hits.some((h) => h.kind === 'document' && h.body.includes('evidencia'))).toBe(true)
          }
          // Usuario de otra área no accede al documento privado del área del lead.
          const deniedRecall = memoryStore.recall(
            {
              usuarioId: R1_USERS.analyst.id,
              areaId: 'area-other',
              canReadProject: false,
              visibleAreaIds: ['area-other'],
            },
            'cierres operativos evidencia'
          )
          expect(deniedRecall.ok).toBe(true)
          if (deniedRecall.ok) {
            expect(deniedRecall.hits).toHaveLength(0)
          }
          return { retrievedDocs: allowedRecall.ok ? allowedRecall.hits.length : 0 }
        },

        'R0-MC-05': async () => {
          const p = buildProposalBinding({
            proposalId: 'qa-prop-1',
            usuarioId: R1_USERS.lead.id,
            operation: 'agent_update_fields',
            scope: 'accion:a1',
            summary: 'Actualizar fecha de cierre',
            payload: { accionId: 'a1', campos: ['fecha'], fecha: '2026-11-26' },
            nowMs,
          })
          const r2Off = resolveWhatsAppProposalApproval({
            actorUsuarioId: R1_USERS.lead.id,
            actorActive: true,
            pending: [p],
            decision: parseWhatsAppApprovalIntent({ text: `confirmar ${p.version}` }),
            executionMode: 'disabled',
            nowMs,
          })
          expect(r2Off.status).toBe('draft_only_r2_off')
          return { version: p.version, r2OffBlocked: true }
        },

        'R0-MC-06': async () => {
          const p: WhatsAppProposalBinding = buildProposalBinding({
            proposalId: 'qa-prop-2',
            usuarioId: R1_USERS.lead.id,
            operation: 'agent_set_action_status',
            scope: 'accion:a1',
            summary: 'Marcar como Hecho',
            payload: { accionId: 'a1', estado: 'Hecho', expectedUpdatedAt: '2026-11-18T10:00:00Z' },
            nowMs,
          })
          const outcome = await executeWhatsAppR2Decision({
            actorUsuarioId: R1_USERS.lead.id,
            actorActive: true,
            pending: [p],
            decision: parseWhatsAppApprovalIntent({ buttonId: buildProposalConfirmButtonId(p) }),
            executionMode: 'simulated',
            nowMs,
            executor: {
              revalidatePermission: async () => ({ allowed: true }),
              claimAndExecute: async () => ({ ok: true, result: { ok: true, estado: 'Hecho' } }),
              cancelOp: async () => {},
            },
          })
          expect(outcome.status).toBe('executed')
          return { status: outcome.status }
        },

        'R0-MC-07': async () => {
          const uncertain = classifyProviderOutcome({ timedOut: true, attempts: 1 })
          expect(uncertain.nextStatus).toBe('review')
          expect(uncertain.retryableWithoutReplay).toBe(false)
          const g503 = await transcribeAudioBase64WithGemini({
            audioBase64: Buffer.from(buildSyntheticOggOpusFixture()).toString('base64'),
            mimeType: 'audio/ogg',
            apiKey: 'local-test',
            fetchImpl: (async () => new Response('503', { status: 503 })) as typeof fetch,
          })
          expect(g503.ok).toBe(false)
          return { whatsappReview: true, gemini503Handled: true }
        },

        'R0-MC-08': async () => {
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
          const cand: ProactiveCandidate = {
            category: 'due_reminder',
            usuarioId: R1_USERS.lead.id,
            entityId: 'a1',
            title: 'Cerrar inventario',
            detail: 'Vence hoy',
            dateBucket: '2026-11-18',
          }
          const evalRes = evaluateProactiveFollowup(cand, prefs, {
            nowIso: '2026-11-18T16:00:00.000Z',
            lastInboundAt: '2026-11-18T12:00:00.000Z',
            sentTodayCount: 0,
            sentDedupeKeys: new Set(),
          })
          expect(evalRes).toMatchObject({ allowed: true, dryRun: true })
          return { dryRun: true }
        },

        'R0-MC-09': async () => {
          const foreign = resolveWhatsAppProposalApproval({
            actorUsuarioId: R1_USERS.carlos.id,
            actorActive: true,
            pending: [
              buildProposalBinding({
                proposalId: 'qa-private-1',
                usuarioId: R1_USERS.lead.id,
                operation: 'agent_set_action_status',
                scope: 'accion:a1',
                summary: 'Privada',
                nowMs,
              }),
            ],
            decision: parseWhatsAppApprovalIntent({ buttonId: 'r2_confirm:qa-private-1:AAAAAAAA' }),
            executionMode: 'simulated',
            nowMs,
          })
          expect(foreign.status).toBe('forbidden')
          return { isolated: true }
        },

        'R0-MC-10': async () => {
          const dedup = deduplicateInboundEvents([
            { eventKey: 'msg:qa-1', phoneId: 'p1', sender: '5215550001111', kind: 'message' },
            { eventKey: 'msg:qa-1', phoneId: 'p1', sender: '5215550001111', kind: 'message' },
          ])
          expect(dedup.accepted).toHaveLength(1)
          expect(dedup.duplicates).toHaveLength(1)
          expect(
            evaluateEventOrdering({ kind: 'status', incomingStatus: 'sent', currentStatus: 'read' }).action
          ).toBe('ignore_stale')
          return { duplicatesSuppressed: dedup.duplicates.length }
        },

        'R0-MC-11': async () => {
          const job: InboundJobRecord = {
            id: 'qa-job-1',
            eventKey: 'msg:qa-uncertain',
            phoneId: 'p1',
            sender: '5215550001111',
            kind: 'message',
            status: 'review',
            attempts: 2,
            effectStarted: true,
            stage: 'provider_request',
            errorCode: 'provider_outcome_unknown',
            availableAt: R1_NOW_ISO,
            leaseToken: null,
            leaseUntil: null,
            createdAt: R1_NOW_ISO,
            updatedAt: R1_NOW_ISO,
            trace: [],
          }
          expect(
            reconcileReviewJob(job, {
              expectedAttempts: 2,
              decision: 'requeue',
              reason: 'Unsafe retry',
              actorUsuarioId: R1_USERS.superAdmin.id,
              nowIso: R1_NOW_ISO,
            })
          ).toEqual({ ok: false, code: 'cannot_replay_uncertain_effect' })
          const rec = reconcileReviewJob(job, {
            expectedAttempts: 2,
            decision: 'reconciled_no_replay',
            reason: 'Verificado en bitácora del proveedor; no reenviar.',
            actorUsuarioId: R1_USERS.superAdmin.id,
            nowIso: R1_NOW_ISO,
          })
          expect(rec.ok).toBe(true)
          return { reconciled: rec.ok }
        },
      },
    })

    expect(report.results.filter((r: { status: string }) => r.status !== 'PASS')).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.passed).toBe(11)
    expect(report.failed).toBe(0)
    expect(transport.outbound.every((m: { simulated: boolean }) => m.simulated === true)).toBe(true)
  })

  it('guardia de prueba real futura: bloquea sin autorización y restringe estrictamente a 1 solo número QA', () => {
    // Sin autorización explícita -> simulated_only.
    const defaultTarget = resolveQaWhatsAppSingleNumberTarget({}, [])
    expect(defaultTarget.liveSendAllowed).toBe(false)
    expect(assertRecipientAllowedForQa('5215550001111', defaultTarget).allowed).toBe(false)

    // Múltiples números rechazados.
    const multiRejected = resolveQaWhatsAppSingleNumberTarget(
      { QA_WHATSAPP_AUTH: 'AUTH-R0-WHATSAPP-QA', QA_WHATSAPP_ALLOWED_NUMBER: '5215550001111,5215550002222' },
      ['--execute-qa-whatsapp']
    )
    expect(multiRejected.liveSendAllowed).toBe(false)

    // Un solo número autorizado -> sólo ese número pasa el filtro.
    const single = resolveQaWhatsAppSingleNumberTarget(
      { QA_WHATSAPP_AUTH: 'AUTH-R0-WHATSAPP-QA', QA_WHATSAPP_ALLOWED_NUMBER: '5215550001111' },
      ['--execute-qa-whatsapp']
    )
    expect(single.liveSendAllowed).toBe(true)
    expect(assertRecipientAllowedForQa('5215550001111', single).allowed).toBe(true)
    expect(assertRecipientAllowedForQa('5215559999999', single).allowed).toBe(false)
  })
})
