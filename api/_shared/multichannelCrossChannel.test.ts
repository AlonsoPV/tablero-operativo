/**
 * Pruebas de integración cruzada Multicanal Fase 1 (Web <-> WhatsApp sobre R1/R2/R3 unificado).
 *
 * Cubre exclusivamente los 6 riesgos nuevos de la integración multicanal:
 * 1. Consulta iniciada en Web y seguimiento desde WhatsApp (mismo usuario y fingerprint).
 * 2. Propuesta R2 originada desde WhatsApp usando el mismo motor R2 que Web.
 * 3. Aprobación explícita y ejecución controlada (sin bypass).
 * 4. Nota de voz con instrucciones ambiguas (sin ejecución ni escritura).
 * 5. Bloqueo de acceso cruzado entre identidades distintas (continuidad y confirmación).
 * 6. Ausencia de ejecución duplicada entre canales (Web y WhatsApp sobre la misma op).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { confirmPendingOp, dispatchCopilotTool } from './assistantOpsRuntime.js'
import { runChannelTurn } from './orchestrator/channelAdapters.js'
import { createMemorySessionContextStore } from './orchestrator/sessionContext.js'
import { memoryQueryAuditSink } from './query/queryAudit.js'
import { R1_NOW_ISO, R1_TODAY, R1_USERS } from './orchestrator/testing/r1Fixture.js'
import { createR2Db, r2Actor, simulatedExecutorFor } from './orchestrator/testing/r2Fixture.js'
import {
  buildProposalBinding,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
} from './whatsappR2Adapter.js'
import { processWhatsAppVoiceNote } from './whatsappVoiceNotes.js'
import { buildSyntheticOggOpusFixture } from './audioTranscription.js'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Multichannel Phase 1 — integración cruzada Web <-> WhatsApp', () => {
  it('1) Consulta iniciada en Web y seguimiento desde WhatsApp para el mismo usuario (sin mezclar identidades)', async () => {
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const lead = await r2Actor(db, R1_USERS.lead)

    const webTurn = await runChannelTurn(
      {
        identity: {
          supabase: lead.copilot.supabase,
          authUserId: lead.copilot.authUserId,
          usuarioId: lead.usuarioId,
          rol: lead.rol,
          active: true,
        },
        channel: 'web',
        sessionId: 'web-conv-mc-1',
        utterance: 'Muéstrame la acción Auditoria de Jorge',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: lead.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(webTurn.handled).toBe(true)
    expect(webTurn.response.references.some((r) => r.id === 'a8')).toBe(true)

    // Turno 2 en WhatsApp con sesión nueva del MISMO usuario: hereda lastEntity por usuarioId + fingerprint
    const waTurn = await runChannelTurn(
      {
        identity: {
          supabase: lead.copilot.supabase,
          authUserId: lead.copilot.authUserId,
          usuarioId: lead.usuarioId,
          rol: lead.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215511112222',
        utterance: '¿Cuál es el detalle de esa acción?',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: lead.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(waTurn.handled).toBe(true)
    expect(waTurn.text.length).toBeLessThanOrEqual(900)
    expect(waTurn.response.references.some((r) => r.id === 'a8')).toBe(true)
  })

  it('2 & 3) Propuesta R2 originada desde WhatsApp + aprobación explícita vinculada por versión', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const jorge = await r2Actor(db, R1_USERS.jorge1)

    await runChannelTurn(
      {
        identity: {
          supabase: jorge.copilot.supabase,
          authUserId: jorge.copilot.authUserId,
          usuarioId: jorge.usuarioId,
          rol: jorge.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215511112222',
        utterance: 'Muéstrame la acción Auditoria de Jorge',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: jorge.capabilities,
        today: () => R1_TODAY,
      }
    )

    const proposed = await runChannelTurn(
      {
        identity: {
          supabase: jorge.copilot.supabase,
          authUserId: jorge.copilot.authUserId,
          usuarioId: jorge.usuarioId,
          rol: jorge.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215511112222',
        utterance: 'Agrega un comentario a esa acción: confirmado desde WhatsApp',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: jorge.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(proposed.handled).toBe(true)
    expect(proposed.intent).toBe('write_request')
    expect(proposed.proposal && 'id' in proposed.proposal).toBe(true)
    const op = proposed.proposal as { id: string; tool: string; title: string; summary: string; expiresAt: string }
    expect(op.tool).toBe('agent_add_comment')

    const binding = buildProposalBinding({
      proposalId: op.id,
      usuarioId: jorge.usuarioId,
      operation: op.tool,
      scope: op.tool,
      summary: op.summary || op.title,
      payload: null,
      expiresAt: op.expiresAt,
    })

    // Confirmación ambigua rechazada; confirmación explícita con código aprobada
    const ambiguous = resolveWhatsAppProposalApproval({
      actorUsuarioId: jorge.usuarioId,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: 'sí' }),
      executionMode: 'qa',
    })
    expect(ambiguous.status).toBe('ambiguous')

    const explicit = resolveWhatsAppProposalApproval({
      actorUsuarioId: jorge.usuarioId,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: `confirmar ${binding.version}` }),
      executionMode: 'qa',
    })
    expect(explicit.status).toBe('ready_to_execute')

    const logsBefore = db.tables.assistant_op_log?.length ?? 0
    const res = await confirmPendingOp(jorge.copilot, op.id, {
      r2: { mode: 'simulated', executor: simulatedExecutorFor(jorge) },
    })
    expect(res.status).toBe('confirmed')
    expect((db.tables.assistant_op_log?.length ?? 0) - logsBefore).toBe(1)
  })

  it('4) Nota de voz con instrucciones ambiguas rechaza ejecución sin escribir en el tablero', async () => {
    const db = createR2Db()
    const jorge = await r2Actor(db, R1_USERS.jorge1)
    const b1 = buildProposalBinding({
      proposalId: 'op-voice-1',
      usuarioId: jorge.usuarioId,
      operation: 'agent_set_action_status',
      scope: 'agent_set_action_status',
      summary: 'Marcar A como Hecho',
      payload: { accionId: 'a8', estado: 'Hecho' },
    })
    const b2 = buildProposalBinding({
      proposalId: 'op-voice-2',
      usuarioId: jorge.usuarioId,
      operation: 'agent_add_comment',
      scope: 'agent_add_comment',
      summary: 'Comentar en B',
      payload: { accionId: 'a8', contenido: 'Listo' },
    })
    const oggBytes = buildSyntheticOggOpusFixture({ durationSec: 3 })
    const commentsBefore = db.tables.accion_comentarios?.length ?? 0

    const voiceRes = await processWhatsAppVoiceNote(
      {
        waId: '5215511112222',
        usuarioId: jorge.usuarioId,
        active: true,
        aiAuthorized: true,
        replyAudioMode: 'text',
      },
      { mediaId: 'media-ambig-1', mimeType: 'audio/ogg', durationSeconds: 3 },
      {
        fetchMetaMedia: async () => ({
          bytes: oggBytes,
          mimeType: 'audio/ogg',
          fileSize: oggBytes.byteLength,
        }),
        transcribe: async () => ({
          ok: true,
          transcript: 'confirma eso y además crea una acción para él luego y márcala como hecha',
          model: 'simulated-qa',
          latencyMs: 10,
        }),
        runAssistant: async ({ transcript, safety }) => {
          expect(safety.executionBlockedFromVoice).toBe(true)
          expect(safety.multipleInstructions).toBe(true)
          expect(safety.ambiguities.length).toBeGreaterThan(0)
          const decision = parseWhatsAppApprovalIntent({ text: transcript })
          const res = resolveWhatsAppProposalApproval({
            actorUsuarioId: jorge.usuarioId,
            actorActive: true,
            pending: [b1, b2],
            decision,
            executionMode: 'qa',
          })
          expect(res.status).not.toBe('ready_to_execute')
          return { text: safety.clarificationPrompt || res.message }
        },
        voiceReplyEnabled: false,
      }
    )

    expect(voiceRes.ok).toBe(true)
    expect(voiceRes.audioRetained).toBe(false)
    expect(voiceRes.replyText.toLowerCase()).toMatch(/código|confirmar|ambigu|explícit|voz/)
    expect(db.tables.accion_comentarios?.length ?? 0).toBe(commentsBefore)
  })

  it('5) Bloqueo de acceso cruzado: otro usuario no hereda contexto ajeno ni puede aprobar propuesta ajena', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const lead = await r2Actor(db, R1_USERS.lead)
    const jorge = await r2Actor(db, R1_USERS.jorge1)

    // Líder enfoca acción a2 (ajena a Jorge) y genera propuesta en Web
    await runChannelTurn(
      {
        identity: {
          supabase: lead.copilot.supabase,
          authUserId: lead.copilot.authUserId,
          usuarioId: lead.usuarioId,
          rol: lead.rol,
          active: true,
        },
        channel: 'web',
        sessionId: 'web-lead-mc',
        utterance: 'Muéstrame la acción Revisar presupuesto',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: lead.capabilities,
        today: () => R1_TODAY,
      }
    )

    const leadProp = await runChannelTurn(
      {
        identity: {
          supabase: lead.copilot.supabase,
          authUserId: lead.copilot.authUserId,
          usuarioId: lead.usuarioId,
          rol: lead.rol,
          active: true,
        },
        channel: 'web',
        sessionId: 'web-lead-mc',
        utterance: 'Agrega un comentario a esa acción: nota privada líder',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: lead.capabilities,
        today: () => R1_TODAY,
      }
    )
    const op = leadProp.proposal as { id: string; tool: string; title: string; summary: string; expiresAt: string }
    expect(op?.id).toBeTruthy()

    // Jorge en WhatsApp NO hereda la acción ajena (a2) del líder
    const crossTurn = await runChannelTurn(
      {
        identity: {
          supabase: jorge.copilot.supabase,
          authUserId: jorge.copilot.authUserId,
          usuarioId: jorge.usuarioId,
          rol: jorge.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215599998888',
        utterance: '¿Cuál es el detalle de esa acción?',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: jorge.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(crossTurn.response.references.some((r) => r.id === 'a2')).toBe(false)

    // Y NO puede aprobar la propuesta del líder desde WhatsApp
    const binding = buildProposalBinding({
      proposalId: op.id,
      usuarioId: lead.usuarioId,
      operation: op.tool,
      scope: op.tool,
      summary: op.summary || op.title,
      payload: null,
      expiresAt: op.expiresAt,
    })
    const crossApproval = resolveWhatsAppProposalApproval({
      actorUsuarioId: jorge.usuarioId,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: `confirmar ${binding.version}` }),
      executionMode: 'qa',
    })
    expect(crossApproval.status).not.toBe('ready_to_execute')
  })

  it('6) Ausencia de ejecución duplicada entre canales (confirmación Web + replay WhatsApp ejecuta una sola vez)', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const jorge = await r2Actor(db, R1_USERS.jorge1)

    await runChannelTurn(
      {
        identity: {
          supabase: jorge.copilot.supabase,
          authUserId: jorge.copilot.authUserId,
          usuarioId: jorge.usuarioId,
          rol: jorge.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215511112222',
        utterance: 'Muéstrame la acción Auditoria de Jorge',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: jorge.capabilities,
        today: () => R1_TODAY,
      }
    )

    const proposed = await runChannelTurn(
      {
        identity: {
          supabase: jorge.copilot.supabase,
          authUserId: jorge.copilot.authUserId,
          usuarioId: jorge.usuarioId,
          rol: jorge.rol,
          active: true,
        },
        channel: 'whatsapp',
        sessionId: '5215511112222',
        utterance: 'Agrega un comentario a esa acción: idempotente multicanal',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: jorge.capabilities,
        today: () => R1_TODAY,
      }
    )
    const op = proposed.proposal as { id: string }
    const logsBefore = db.tables.assistant_op_log?.length ?? 0

    // Canal 1 (Web) confirma la operación
    const first = await confirmPendingOp(jorge.copilot, op.id, {
      r2: { mode: 'simulated', executor: simulatedExecutorFor(jorge) },
    })
    expect(first.status).toBe('confirmed')
    expect((db.tables.assistant_op_log?.length ?? 0) - logsBefore).toBe(1)

    // Canal 2 (WhatsApp) reintenta confirmar la misma operación: cero duplicación
    const second = await confirmPendingOp(jorge.copilot, op.id, {
      r2: { mode: 'simulated', executor: simulatedExecutorFor(jorge) },
    })
    expect(second.status).toBe('confirmed')
    expect((db.tables.assistant_op_log?.length ?? 0) - logsBefore).toBe(1)
  })
})
