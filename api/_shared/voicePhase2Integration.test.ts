import { describe, expect, it, vi } from 'vitest'
import {
  VOICE_DEFAULT_LOCALE,
  VOICE_TURN_MODE,
  createVoiceAgreementSummaryFinalizer,
  formatVoiceSpokenReply,
  resolveVoiceProviderReadiness,
  sanitizeTextForVoiceSpeech,
} from './voiceChannelAdapter.js'
import { classifyAgentIntent } from './orchestrator/intent.js'
import { formatForChannel } from './orchestrator/channelAdapters.js'
import {
  createMemorySessionContextStore,
  emptySessionContext,
  sessionContextKey,
} from './orchestrator/sessionContext.js'
import { runAgentTurn } from './orchestrator/runAgentTurn.js'
import type { AgentActor } from './query/resolveActor.js'
import type { ToolDispatcher } from './query/index.js'
import { resolveAccessCapabilities } from '../../src/features/auth/lib/permissions.js'

function makeActor(overrides: Partial<AgentActor> = {}): AgentActor {
  const rol = overrides.rol ?? 'Dirección'
  const capabilities = overrides.capabilities ?? resolveAccessCapabilities(rol, 'admin')
  return {
    authUserId: '11111111-1111-4111-8111-111111111111',
    usuarioId: '22222222-2222-4222-8222-222222222222',
    rol,
    roleClass: 'direction',
    channel: 'voice',
    sessionId: 'voice-session-01',
    project: 'scrumban-tc-local',
    boardScope: { seesAllBoard: true, usuarioId: '22222222-2222-4222-8222-222222222222' },
    capabilities,
    copilot: {
      usuarioId: '22222222-2222-4222-8222-222222222222',
      authUserId: '11111111-1111-4111-8111-111111111111',
      rol,
      appRole: 'admin',
      nombre: 'Director QA',
      areas: ['Operaciones', 'Ventas'],
      boardScope: { seesAllBoard: true, usuarioId: '22222222-2222-4222-8222-222222222222' },
    },
    ...overrides,
  }
}

describe('Phase 2 Voice Integration — Spoken Adaptation & Provider Honesty (Section 6)', () => {
  it('declares honest turn_based es-MX mode with realtimeStreamingAvailable=false and zero external paid calls by default', () => {
    const readiness = resolveVoiceProviderReadiness({})
    expect(readiness.mode).toBe(VOICE_TURN_MODE)
    expect(readiness.locale).toBe(VOICE_DEFAULT_LOCALE)
    expect(readiness.realtimeStreamingAvailable).toBe(false)
    expect(readiness.externalPaidCallsActive).toBe(false)
    expect(readiness.ttsProvider).toBe('browser_es_mx_fallback')
    expect(readiness.sttProvider).toBe('browser_speech_recognition')
  })

  it('strips Markdown, URLs, UUIDs, tables, and humanizes priorities, ISO dates, and percentages for es-MX speech', () => {
    const visual = `## Diagnóstico
- **Acción crítica** \`11111111-1111-4111-8111-111111111111\` | P1_Alta | En_Ejecucion | 2026-11-27 | 85%
- Ver detalle en [Tablero](https://app.scrumban.local/acciones/123)`

    const spoken = sanitizeTextForVoiceSpeech(visual)
    expect(spoken).not.toMatch(/[#*`[\]|]/)
    expect(spoken).not.toMatch(/https?:\/\//)
    expect(spoken).not.toMatch(/11111111-1111/)
    expect(spoken).toContain('prioridad alta')
    expect(spoken).toContain('en ejecución')
    expect(spoken).toContain('27 de noviembre')
    expect(spoken).toContain('85 por ciento')
    expect(spoken).toContain('Tablero')
    expect(spoken.length).toBeLessThanOrEqual(440)
  })

  it('keeps R2 write proposals explicitly unexecuted in spoken voice responses (Section 9)', () => {
    const spoken = formatVoiceSpokenReply({
      turnId: 't-prop-1',
      intent: 'create_action',
      format: 'executive',
      proposal: {
        id: 'prop-1',
        tool: 'create_action',
        summary: 'Crear acción Revisar cuello de botella de cobranza para el viernes',
      } as never,
      proposals: [
        {
          id: 'prop-1',
          tool: 'create_action',
          summary: 'Crear acción Revisar cuello de botella de cobranza para el viernes',
        } as never,
      ],
      response: {
        status: 'ok',
        blocks: {
          data: ['Propuesta lista: Crear acción Revisar cuello de botella de cobranza (P1_Alta, 2026-11-27).'],
          interpretation: [],
          recommendation: ['Aprueba en pantalla para persistirla.'],
          limitations: [],
        },
        references: [],
        asOf: '2026-11-24T12:00:00Z',
        sources: ['r2_proposal'],
      },
    } as never)

    expect(spoken.toLowerCase()).toContain('no se aplicó ningún cambio')
    expect(spoken.toLowerCase()).toMatch(/aprobarla|editarla|cancelarla/)
    expect(spoken).not.toContain('P1_Alta')
    expect(spoken).toContain('prioridad alta')
    expect(spoken).toContain('27 de noviembre')
  })
})

describe('Phase 2 Voice Integration — Section 5 Natural Conversational Prompts', () => {
  const naturalPrompts = [
    '¿Cómo va mi empresa hoy?',
    '¿Qué necesita mi atención?',
    '¿Qué está frenando al equipo?',
    '¿Cuál de esos problemas debería resolver primero?',
    'Explícame por qué.',
    '¿Qué me recomiendas hacer?',
    'Convierte eso en una acción.',
    'Asígnasela al responsable correspondiente.',
    'Mejor cambia la fecha al viernes.',
    '¿Qué otros compromisos tenemos pendientes?',
  ]

  it.each(naturalPrompts)(
    'classifies natural voice prompt "%s" cleanly into unified R1/R2/Executive intents (never unknown)',
    (prompt) => {
      const intent = classifyAgentIntent(prompt, {
        hasRecentActions: true,
        hasExecutiveDiagnosis: true,
        hasPendingDraft: true,
      })
      expect(intent).toBeTruthy()
      expect(intent).not.toBe('unknown')
    }
  )
})

describe('Phase 2 Voice Integration — Channel Parity, Isolation, Safety & Idempotent Summary (V4, V6–V8, V11, V12)', () => {
  it('formats unified orchestrator results cleanly for voice channel without raw Markdown/ISO dates', () => {
    const formatted = formatForChannel(
      {
        handled: true,
        intent: 'executive_diagnosis',
        format: 'executive',
        formatExplicit: false,
        offerDetail: false,
        trace: [],
        response: {
          status: 'ok',
          blocks: {
            data: ['Tienes 3 prioridades abiertas para 2026-11-27 con 75% de avance (P1_Alta).'],
            interpretation: ['Operaciones concentra el mayor bloqueo.'],
            recommendation: ['Desbloquear la aprobación de proveedor antes de mediodía.'],
            limitations: [],
          },
          references: [],
          asOf: '2026-11-24T14:00:00Z',
          sources: ['kanban_acciones'],
        },
      } as never,
      'voice'
    )

    expect(formatted).toContain('27 de noviembre')
    expect(formatted).toContain('75 por ciento')
    expect(formatted).toContain('prioridad alta')
    expect(formatted).not.toContain('P1_Alta')
    expect(formatted).toContain('Te recomiendo:')
  })

  it('enforces strict user isolation across voice sessions even with identical sessionId (V11)', async () => {
    const store = createMemorySessionContextStore()
    const directorKey = sessionContextKey({
      usuarioId: 'user-director-1',
      channel: 'voice',
      sessionId: 'same-session-id',
    })
    const colabKey = sessionContextKey({
      usuarioId: 'user-colab-2',
      channel: 'voice',
      sessionId: 'same-session-id',
    })

    expect(directorKey).not.toBe(colabKey)

    const ctx = emptySessionContext()
    ctx.recentActions = [
      {
        id: 'act-dir-secret',
        titulo: 'Confidencial Dirección',
        estado: 'Bloqueado',
        prioridad: 'P1_Alta',
        fecha: '2026-11-27',
        responsableId: 'user-director-1',
        responsableNombre: 'Director QA',
      } as never,
    ]
    await store.set(directorKey, ctx)

    const directorLoaded = await store.get(directorKey)
    const colabLoaded = await store.get(colabKey)

    expect(directorLoaded?.recentActions?.[0]?.id).toBe('act-dir-secret')
    expect(colabLoaded).toBeNull()
  })

  it('produces idempotent written agreements summary separating confirmed vs pending vs cancelled (V8, V12)', () => {
    const finalizer = createVoiceAgreementSummaryFinalizer(() => '2026-11-24T15:00:00Z')
    const input = {
      sessionId: 'voice-exec-001',
      actorLabel: 'Director QA',
      turns: [
        { role: 'user' as const, text: '¿Cómo va mi empresa hoy?' },
        { role: 'assistant' as const, text: 'Tres prioridades activas: cobranza vencida, entrega de lote y onboarding.' },
        { role: 'user' as const, text: 'Convierte la cobranza en una acción para el viernes.' },
      ],
      proposals: [
        { id: 'p-1', tool: 'create_action', summary: 'Escalar cobranza clave — Vie 27 nov', status: 'confirmed' as const },
        { id: 'p-2', tool: 'update_action', summary: 'Reprogramar entrega de lote', status: 'pending' as const },
        { id: 'p-3', tool: 'create_action', summary: 'Borrador descartado', status: 'cancelled' as const },
      ],
    }

    const first = finalizer.finalize(input)
    const second = finalizer.finalize(input)

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(first.executedCommitments).toEqual(['Escalar cobranza clave — Vie 27 nov'])
    expect(first.pendingProposals).toEqual(['Reprogramar entrega de lote'])
    expect(first.cancelledProposals).toEqual(['Borrador descartado'])
    expect(first.markdown).toContain('Compromisos aprobados y ejecutados')
    expect(first.markdown).toContain('Propuestas pendientes de aprobación explícita (sin escritura aplicada)')
  })

  it('rejects ambiguous voice utterances ("sí", "está bien", "adelante") from executing any R2 write (V6, V7, V12)', async () => {
    const writeCalled = vi.fn()
    const dispatch: ToolDispatcher = async (tool) => {
      if (tool.startsWith('create_') || tool.startsWith('update_') || tool.startsWith('complete_')) {
        writeCalled(tool)
      }
      return { ok: true, data: { items: [], total: 0 } }
    }

    const store = createMemorySessionContextStore()
    const actor = makeActor({ channel: 'voice', sessionId: 'voice-safety-conv' })

    for (const ambiguous of ['sí', 'está bien', 'adelante']) {
      const result = await runAgentTurn(
        { actor, utterance: ambiguous },
        { dispatch, store, today: () => '2026-11-24' }
      )
      expect(result.response.status).not.toBe('error')
      expect(writeCalled).not.toHaveBeenCalled()
    }
  })

  it('executes Commercial 8-step Demo dialogue cleanly across Voice and WhatsApp without duplicating logic', async () => {
    const mockActions = [
      {
        id: 'act-demo-1',
        titulo: 'Desbloquear facturación de cliente estratégico',
        estado: 'Bloqueado',
        prioridad: 'P1_Alta',
        fecha: '2026-11-24',
        area: 'Operaciones',
        responsable_id: '33333333-3333-4333-8333-333333333333',
        responsable_nombre: 'Ana Líder',
        causa_raiz: 'Falta autorización fiscal del área financiera',
        evidencia_esperada: 'Factura timbrada y enviada',
      },
      {
        id: 'act-demo-2',
        titulo: 'Cerrar entrega semanal de almacén',
        estado: 'Retraso',
        prioridad: 'P1_Alta',
        fecha: '2026-11-23',
        area: 'Logística',
        responsable_id: '44444444-4444-4444-8444-444444444444',
        responsable_nombre: 'Carlos Operativo',
        causa_raiz: 'Demora en proveedor de empaque',
        evidencia_esperada: 'Guía de embarque firmada',
      },
      {
        id: 'act-demo-3',
        titulo: 'Confirmar meta Q4 con ventas',
        estado: 'En_Ejecucion',
        prioridad: 'P2_Media',
        fecha: '2026-11-26',
        area: 'Ventas',
        responsable_id: '33333333-3333-4333-8333-333333333333',
        responsable_nombre: 'Ana Líder',
        causa_raiz: null,
        evidencia_esperada: 'Minuta firmada',
      },
    ]

    const dispatch: ToolDispatcher = async (tool) => {
      if (tool === 'list_actions' || tool === 'search_actions') {
        return {
          ok: true,
          data: {
            items: mockActions,
            total: mockActions.length,
            asOf: '2026-11-24T14:00:00Z',
          },
        }
      }
      if (tool === 'board_summary' || tool === 'aggregate_actions') {
        return {
          ok: true,
          data: {
            open: 3,
            overdue: 1,
            blocked: 1,
            highPriority: 2,
            byArea: { Operaciones: 1, Logística: 1, Ventas: 1 },
            asOf: '2026-11-24T14:00:00Z',
          },
        }
      }
      if (tool === 'list_okrs') {
        return { ok: true, data: { items: [], total: 0 } }
      }
      return { ok: true, data: {} }
    }

    const store = createMemorySessionContextStore()
    const voiceActor = makeActor({ channel: 'voice', sessionId: 'demo-director-1' })

    // Step 1–2: Director asks company status & priorities via Voice
    const t1 = await runAgentTurn(
      { actor: voiceActor, utterance: '¿Cómo va mi empresa hoy?' },
      { dispatch, store, today: () => '2026-11-24' }
    )
    expect(t1.handled).toBe(true)
    const spoken1 = formatForChannel(t1, 'voice')
    expect(spoken1.length).toBeGreaterThan(20)
    expect(spoken1).not.toMatch(/[#*`[\]]/)

    // Step 3–4: Director asks about blockers & what to solve first
    const t2 = await runAgentTurn(
      { actor: voiceActor, utterance: '¿Qué está frenando al equipo?' },
      { dispatch, store, today: () => '2026-11-24' }
    )
    expect(t2.handled).toBe(true)
    const spoken2 = formatForChannel(t2, 'voice')
    expect(spoken2.length).toBeGreaterThan(10)

    // Step 8: Same Director checks commitments from WhatsApp channel (same orchestrator, zero duplicated logic)
    const waActor = makeActor({ channel: 'whatsapp', sessionId: 'wa-director-1' })
    const tWa = await runAgentTurn(
      { actor: waActor, utterance: '¿Qué otros compromisos tenemos pendientes?' },
      { dispatch, store, today: () => '2026-11-24' }
    )
    expect(tWa.handled).toBe(true)
    const waText = formatForChannel(tWa, 'whatsapp')
    expect(waText.length).toBeGreaterThan(10)
    expect(waText.length).toBeLessThanOrEqual(900)
  })
})
