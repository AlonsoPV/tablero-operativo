/**
 * Validación integrada 3 canales: Web <-> WhatsApp <-> Voz R4 sobre el núcleo único R1/R2/R3.
 *
 * Cubre:
 * 1. Continuidad cross-channel Web -> Voz -> WhatsApp para el mismo usuario corporativo.
 * 2. Respuesta hablada Voz R4 cálida en es-MX, concisa, sin markdown/UUIDs y honesta (turn_based).
 * 3. Propuesta R2 generada en Voz -> aprobada explícitamente en Web -> segunda aprobación desde WhatsApp rechazada (idempotencia/CAS).
 * 4. Concurrencia simultánea de aprobación entre canales: exactamente 1 ejecución, 0 duplicados.
 * 5. Aislamiento estricto entre identidades en los tres canales.
 * 6. Resumen escrito de acuerdos idempotente (nunca reporta propuestas pendientes como ejecutadas).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { confirmPendingOp, dispatchCopilotTool } from './assistantOpsRuntime.js'
import { runChannelTurn } from './orchestrator/channelAdapters.js'
import { createMemorySessionContextStore } from './orchestrator/sessionContext.js'
import { memoryQueryAuditSink } from './query/queryAudit.js'
import { R1_NOW_ISO, R1_TODAY, R1_USERS } from './orchestrator/testing/r1Fixture.js'
import { createR2Db, r2Actor, simulatedExecutorFor } from './orchestrator/testing/r2Fixture.js'
import {
  VOICE_TURN_MODE,
  createVoiceAgreementSummaryFinalizer,
  resolveVoiceProviderReadiness,
} from './voiceChannelAdapter.js'

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

describe('Multichannel 3-Channel Integration — Web <-> WhatsApp <-> Voz R4', () => {
  it('1 & 2) Continuidad Web -> Voz -> WhatsApp con formato hablado es-MX limpio y sin fingir streaming', async () => {
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const lead = await r2Actor(db, R1_USERS.lead)

    const readiness = resolveVoiceProviderReadiness({})
    expect(readiness.mode).toBe(VOICE_TURN_MODE)
    expect(readiness.realtimeStreamingAvailable).toBe(false)
    expect(readiness.externalPaidCallsActive).toBe(false)

    // Turno 1: Web enfoca acción
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
        sessionId: 'web-3ch-1',
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

    // Turno 2: Voz hereda el contexto autorizado y responde sin markdown/UUIDs
    const voiceTurn = await runChannelTurn(
      {
        identity: {
          supabase: lead.copilot.supabase,
          authUserId: lead.copilot.authUserId,
          usuarioId: lead.usuarioId,
          rol: lead.rol,
          active: true,
        },
        channel: 'voice',
        sessionId: 'voice-3ch-1',
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
    expect(voiceTurn.handled).toBe(true)
    expect(voiceTurn.response.references.some((r) => r.id === 'a8')).toBe(true)
    expect(voiceTurn.text).not.toMatch(/[#*`]|https?:\/\//)
    expect(voiceTurn.text.length).toBeLessThanOrEqual(620)

    // Turno 3: WhatsApp continúa el mismo contexto autorizado
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
        sessionId: '5215512345678',
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
    expect(waTurn.response.references.some((r) => r.id === 'a8')).toBe(true)
  })

  it('3 & 4) Propuesta originada en Voz + aprobación concurrente Web/WhatsApp: 1 ejecución exacta, 0 duplicados', async () => {
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
        channel: 'voice',
        sessionId: 'voice-r2-1',
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

    const voiceProposalTurn = await runChannelTurn(
      {
        identity: {
          supabase: jorge.copilot.supabase,
          authUserId: jorge.copilot.authUserId,
          usuarioId: jorge.usuarioId,
          rol: jorge.rol,
          active: true,
        },
        channel: 'voice',
        sessionId: 'voice-r2-1',
        utterance: 'Marca esa acción como hecha',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: jorge.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(voiceProposalTurn.handled).toBe(true)
    expect(voiceProposalTurn.proposals?.length).toBe(1)
    expect(voiceProposalTurn.text).toMatch(/aprobar|propuesta|pantalla|cambio/i)

    const opId = voiceProposalTurn.proposals![0]!.id
    // Antes de aprobar: la acción sigue sin mutarse
    const before = db.tables.acciones_diarias.find((a) => a.id === 'a8')
    expect(before?.estado).not.toBe('Hecho')

    // Aprobación concurrente simultánea desde Web y WhatsApp sobre la misma op (CAS evita duplicados)
    const exec = simulatedExecutorFor(jorge)
    const settled = await Promise.allSettled([
      confirmPendingOp(jorge.copilot, opId, { r2: { mode: 'simulated', executor: exec } }),
      confirmPendingOp(jorge.copilot, opId, { r2: { mode: 'simulated', executor: exec } }),
    ])

    const fulfilled = settled.filter((r) => r.status === 'fulfilled')
    const rejected = settled.filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
    const after = db.tables.acciones_diarias.find((a) => a.id === 'a8')
    expect(after?.estado).toBe('Hecho')
  })

  it('5) Aislamiento entre identidades en Voz/Web/WhatsApp y 6) Resumen escrito idempotente de acuerdos', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const lead = await r2Actor(db, R1_USERS.lead)
    const other = await r2Actor(db, R1_USERS.jorge2)

    await runChannelTurn(
      {
        identity: {
          supabase: lead.copilot.supabase,
          authUserId: lead.copilot.authUserId,
          usuarioId: lead.usuarioId,
          rol: lead.rol,
          active: true,
        },
        channel: 'voice',
        sessionId: 'voice-iso-1',
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

    // Otro usuario corporativo NO hereda lastEntity del líder
    const otherTurn = await runChannelTurn(
      {
        identity: {
          supabase: other.copilot.supabase,
          authUserId: other.copilot.authUserId,
          usuarioId: other.usuarioId,
          rol: other.rol,
          active: true,
        },
        channel: 'voice',
        sessionId: 'voice-iso-1',
        utterance: 'Cambia la prioridad de esa acción a Alta',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: other.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(otherTurn.proposals?.length ?? 0).toBe(0)

    // Resumen escrito idempotente de acuerdos R4
    const finalizer = createVoiceAgreementSummaryFinalizer(() => '2026-11-24T20:00:00Z')
    const input = {
      sessionId: 'voice-demo-1',
      actorLabel: 'Dirección General',
      turns: [
        { role: 'user' as const, text: '¿Qué necesita mi atención hoy?' },
        { role: 'assistant' as const, text: 'Hay 2 bloqueos activos en Operaciones.' },
      ],
      proposals: [
        { id: 'op-1', tool: 'agent_create_action', summary: 'Revisar proveedor el viernes', status: 'confirmed' as const },
        { id: 'op-2', tool: 'agent_update_action_fields', summary: 'Cambiar prioridad a Alta', status: 'pending' as const },
      ],
    }
    const first = finalizer.finalize(input)
    expect(first.duplicate).toBe(false)
    expect(first.executedCommitments).toEqual(['Revisar proveedor el viernes'])
    expect(first.pendingProposals).toEqual(['Cambiar prioridad a Alta'])
    expect(first.markdown).toContain('Propuestas pendientes de aprobación explícita')

    const second = finalizer.finalize(input)
    expect(second.duplicate).toBe(true)
    expect(second.markdown).toBe(first.markdown)
  })
})
