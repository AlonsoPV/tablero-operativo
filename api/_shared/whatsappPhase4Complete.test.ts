import { describe, expect, it, vi } from 'vitest'
import {
  resolveServerSttProvider,
  transcribeAudioBase64WithWhisperHttp,
  transcribeAudioServerSide,
} from './audioTranscription.js'
import {
  buildProposalConfirmButtonId,
  buildProposalEditButtonId,
  buildWhatsAppInteractiveProposalButtons,
  buildProposalBinding,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
} from './whatsappR2Adapter.js'
import {
  PROACTIVE_CATEGORIES,
  planGroupedProactiveDigest,
  type ProactiveCandidate,
  type ProactiveUserPreferences,
} from './whatsappProactive.js'

describe('WhatsApp Phase 4 — Server-side STT, R2 Interactive Buttons & Prioritized Proactive Digest', () => {
  it('resolves server-side STT without browser SpeechRecognition and enforces $0 fail-closed guard', () => {
    const blockedRemote = resolveServerSttProvider({
      AI_ZERO_COST_ONLY: '1',
      WHATSAPP_STT_URL: 'https://api.groq.com/openai/v1/audio/transcriptions',
      WHATSAPP_STT_API_KEY: 'gsk-unverified-key-1234567890',
    })
    expect(blockedRemote.provider).toBe('unavailable')
    expect(blockedRemote.zeroCostSafe).toBe(true)

    const confirmedFreeRemote = resolveServerSttProvider({
      AI_ZERO_COST_ONLY: '1',
      WHATSAPP_STT_URL: 'https://api.groq.com/openai/v1/audio/transcriptions',
      WHATSAPP_STT_API_KEY: 'gsk-confirmed-free-1234567890',
      WHATSAPP_STT_FREE_TIER_CONFIRMED: '1',
      WHATSAPP_STT_MODEL: 'whisper-large-v3-turbo',
    })
    expect(confirmedFreeRemote.provider).toBe('whisper_http')
    expect(confirmedFreeRemote.model).toBe('whisper-large-v3-turbo')

    const localLoopback = resolveServerSttProvider({
      AI_ZERO_COST_ONLY: '1',
      LOCAL_STT_URL: 'http://127.0.0.1:8765/v1/audio/transcriptions',
    })
    expect(localLoopback.provider).toBe('whisper_http')
    expect(localLoopback.endpointUrl).toBe('http://127.0.0.1:8765/v1/audio/transcriptions')
  })

  it('transcribes OGG/Opus audio via server-side Whisper HTTP endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ text: 'Qué bloqueos tenemos hoy en Monterrey' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as unknown as typeof fetch

    const result = await transcribeAudioBase64WithWhisperHttp({
      audioBase64: Buffer.from('OggS-synthetic-opus-audio').toString('base64'),
      mimeType: 'audio/ogg; codecs=opus',
      endpointUrl: 'http://127.0.0.1:8765/v1/audio/transcriptions',
      model: 'whisper-large-v3-turbo',
      fetchImpl: fetchMock,
    })

    expect(result).toEqual({
      ok: true,
      transcript: 'Qué bloqueos tenemos hoy en Monterrey',
      model: 'whisper-large-v3-turbo',
    })

    const unavailable = await transcribeAudioServerSide({
      audioBase64: Buffer.from('OggS').toString('base64'),
      mimeType: 'audio/ogg',
      env: { AI_ZERO_COST_ONLY: '1', GEMINI_API_KEY: 'DISABLED_PLACEHOLDER' },
      fetchImpl: fetchMock,
    })
    expect(unavailable.ok).toBe(false)
    if (!unavailable.ok) expect(unavailable.code).toBe('provider_unavailable')
  })

  it('builds Meta-compliant Confirmar/Editar/Cancelar buttons bound to proposal/version and omits them when R2 OFF', () => {
    const binding = buildProposalBinding({
      proposalId: 'op-123',
      usuarioId: 'user-owner',
      operation: 'agent_create_action',
      scope: 'agent_create_action',
      summary: 'Crear acción: Validar embarque Monterrey',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })

    expect(buildWhatsAppInteractiveProposalButtons(binding, 'disabled')).toEqual([])

    const buttons = buildWhatsAppInteractiveProposalButtons(binding, 'qa')
    expect(buttons).toHaveLength(3)
    expect(buttons.map((b) => b.reply.title)).toEqual(['Confirmar', 'Editar', 'Cancelar'])
    expect(buttons[0]!.reply.id).toBe(buildProposalConfirmButtonId(binding))
    expect(buttons[1]!.reply.id).toBe(buildProposalEditButtonId(binding))
    for (const btn of buttons) {
      expect(btn.reply.title.length).toBeLessThanOrEqual(20)
      expect(btn.reply.id.length).toBeLessThanOrEqual(256)
    }

    const parsedEditBtn = parseWhatsAppApprovalIntent({ buttonId: buttons[1]!.reply.id })
    expect(parsedEditBtn).toEqual({
      kind: 'edit_bound',
      proposalId: 'op-123',
      version: binding.version,
    })

    const resolvedEdit = resolveWhatsAppProposalApproval({
      actorUsuarioId: 'user-owner',
      actorActive: true,
      pending: [binding],
      decision: parsedEditBtn,
      executionMode: 'qa',
    })
    expect(resolvedEdit.status).toBe('edit_prompt')

    // Usuario ajeno no puede usar botón de edición de otra identidad
    const foreignEdit = resolveWhatsAppProposalApproval({
      actorUsuarioId: 'user-other',
      actorActive: true,
      pending: [binding],
      decision: parsedEditBtn,
      executionMode: 'qa',
    })
    expect(foreignEdit.status).toBe('forbidden')
  })

  it('prioritizes critical blockers, overdue actions, and OKRs at risk in anti-saturation grouped dry-run digest', () => {
    expect(PROACTIVE_CATEGORIES).toEqual(
      expect.arrayContaining([
        'daily_summary',
        'overdue_alert',
        'due_reminder',
        'stale_blocker',
        'pending_verification',
        'stale_commitment',
        'okr_risk_alert',
        'weekly_executive_summary',
      ])
    )

    const prefs: ProactiveUserPreferences = {
      usuarioId: 'user-dir',
      waId: '5215500000001',
      active: true,
      consent: true,
      timezone: 'America/Mexico_City',
      windowStartHour: 8,
      windowEndHour: 19,
      allowedWeekdays: [1, 2, 3, 4, 5],
      enabledCategories: new Set(PROACTIVE_CATEGORIES),
      maxPerDay: 3,
      minIntervalMinutes: 30,
    }

    const candidates: ProactiveCandidate[] = [
      {
        category: 'weekly_executive_summary',
        usuarioId: 'user-dir',
        entityId: 'week-1',
        title: 'Resumen semanal',
        detail: 'Avance general 74%.',
        dateBucket: '2026-11-24',
      },
      {
        category: 'daily_summary',
        usuarioId: 'user-dir',
        entityId: 'day-1',
        title: 'Resumen del día',
        detail: '6 acciones abiertas.',
        dateBucket: '2026-11-24',
      },
      {
        category: 'okr_risk_alert',
        usuarioId: 'user-dir',
        entityId: 'okr-1',
        title: 'Entregas puntuales Q4',
        detail: 'Ritmo por debajo de meta.',
        dateBucket: '2026-11-24',
      },
      {
        category: 'overdue_alert',
        usuarioId: 'user-dir',
        entityId: 'act-2',
        title: 'Conciliación Bajío',
        detail: 'Vencida hace 2 días.',
        dateBucket: '2026-11-24',
      },
      {
        category: 'stale_blocker',
        usuarioId: 'user-dir',
        entityId: 'act-1',
        title: 'Validación fiscal Monterrey',
        detail: 'Bloqueo crítico >36h.',
        dateBucket: '2026-11-24',
      },
    ]

    const digest = planGroupedProactiveDigest(
      candidates,
      prefs,
      {
        nowIso: '2026-11-24T16:00:00Z', // 10:00 AM CDMX Martes
        lastInboundAt: '2026-11-24T12:00:00Z', // dentro de ventana 24h
        sentTodayCount: 0,
        sentDedupeKeys: new Set(),
        costControl: { zeroCostOnly: true },
      },
      3
    )

    expect(digest.dryRun).toBe(true)
    expect(digest.allowed).toBe(true)
    expect(digest.includedCount).toBe(3)
    expect(digest.suppressedCount).toBe(2)
    // Deben quedar las 3 más críticas en orden de prioridad: bloqueo -> vencida -> OKR en riesgo
    expect(digest.dedupeKeys[0]).toContain('stale_blocker')
    expect(digest.dedupeKeys[1]).toContain('overdue_alert')
    expect(digest.dedupeKeys[2]).toContain('okr_risk_alert')
    expect(digest.bodyText).toContain('2 aviso(s) adicional(es)')
  })
})
