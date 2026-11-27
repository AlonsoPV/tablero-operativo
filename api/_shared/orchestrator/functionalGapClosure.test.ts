import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyAgentIntent } from './intent.js'
import { applyCommunicationEdit } from './communicationComposer.js'
import { applyDraftPatch, emptyStructuredDraft, extractActionPatch, isStructuredFollowUpUtterance } from './structuredActionDraft.js'
import { composeSystemPrompt } from '../../../src/lib/assistantPrompts.js'
import { isAgentMemoryEnabled } from '../memory/flag.js'
import { createMemoryStore } from '../memory/store.js'
import { runAgentTurn } from './runAgentTurn.js'
import { createR1Db, r1Actor, r1Store, R1_USERS } from './testing/r1Fixture.js'
import { createR2Db, r2Actor } from './testing/r2Fixture.js'
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { capabilityFingerprint } from '../query/actorCapabilities.js'
import { createMemorySessionContextStore, emptySessionContext, sessionContextKey } from './sessionContext.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SCRUMBAN Functional Gap Closure — Scenarios A, B, C, D', () => {
  it('Escenario A: conocimiento empresarial (BPMN -> aplicación -> plan -> acciones) pasa limpio al modelo con Business Intelligence', () => {
    const prompt = composeSystemPrompt('operativo', { hasBoardContext: true, hasOkrContext: true })
    expect(prompt).toContain('BUSINESS KNOWLEDGE & DOMAIN INTELLIGENCE')
    expect(prompt).toContain('BPMN')
    expect(prompt).toContain('Conocimiento general')
    expect(prompt).toContain('Información real de la empresa')

    expect(classifyAgentIntent('¿Qué es BPMN?').kind).toBe('unknown')
    expect(classifyAgentIntent('¿Qué es EBITDA?').kind).toBe('unknown')
    expect(classifyAgentIntent('¿Cómo lo aplico a nuestra operación?').kind).toBe('unknown')
    expect(['unknown', 'recommend_next', 'prioritize_actions', 'executive_brief']).toContain(
      classifyAgentIntent('¿Qué problemas deberíamos resolver primero?').kind
    )
    expect(classifyAgentIntent('Genera un plan.').kind).toBe('unknown')
    const convert = classifyAgentIntent('Convierte el plan en acciones.')
    expect(convert.kind).toBe('write_request')
    if (convert.kind === 'write_request') {
      expect(convert.operation).toBe('create_action')
      expect(convert.batch).toBe('advisory_plan')
    }
  })

  it('Escenario A5: convierte el plan en propuestas R2 pendientes sin escribir el tablero', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const actor = await r2Actor(db, R1_USERS.lead)
    const before = db.tables.acciones_diarias!.length
    await store.set(sessionContextKey(actor), {
      ...emptySessionContext(),
      fingerprint: capabilityFingerprint(actor.capabilities),
      lastAdvisoryPlan: `1. Auditoría de inventario QA P0
   Responsable: Laura Lider
   Fecha límite: 2026-11-19
2. Comparar conteo físico vs sistema
   Responsable: Laura Lider
   Fecha límite: 2026-11-19`,
    })
    const turn = await runAgentTurn(
      { actor, utterance: 'Convierte el plan en acciones.' },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        today: () => '2026-11-19',
      }
    )
    expect(turn.handled).toBe(true)
    expect(turn.intent).toBe('write_request')
    expect((turn.proposals ?? []).length).toBeGreaterThanOrEqual(2)
    expect(db.tables.assistant_pending_ops!.every((op) => op.status === 'pending')).toBe(true)
    expect(db.tables.acciones_diarias).toHaveLength(before)
    expect(turn.response.blocks.limitations.join(' ')).toMatch(/confirma/i)
  })

  it('Escenario B: "Hazlo más directo." edita tono y brevedad sin sobreescribir el mensaje con la instrucción literal', () => {
    const gerardoQuery = classifyAgentIntent('¿Qué tiene pendiente Gerardo?')
    expect(gerardoQuery.kind).toBe('query_actions')
    if (gerardoQuery.kind === 'query_actions') {
      expect(gerardoQuery.personHint).toBe('gerardo')
      expect(gerardoQuery.scope).toBe('board_authorized')
    }
    expect(classifyAgentIntent('Identifica lo más urgente.').kind).toBe('recommend_next')

    const intent = classifyAgentIntent('Hazlo más directo.', undefined, {
      hasPendingCommunication: true,
    })
    expect(intent).toEqual({
      kind: 'communication_action',
      action: 'edit',
      utterance: 'Hazlo más directo.',
    })

    const proposal = {
      proposalId: 'p-1',
      version: 1,
      channel: 'email' as const,
      purpose: 'pending_actions' as const,
      status: 'pending' as const,
      createdAt: '2026-11-27T15:00:00Z',
      recipients: [
        {
          recipientId: 'gerardo-1',
          recipientName: 'Gerardo Puga',
          channel: 'email' as const,
          subject: 'Pendientes prioritarios',
          messageBody: 'Hola Gerardo, ¿Me ayudas a revisar la conciliación de entregas hoy?\n- Conciliación de entregas (2026-11-30)\n¿Me confirmas avance?',
          sourceActionIds: ['a-1'],
        },
      ],
    }

    const edited = applyCommunicationEdit(proposal, 'Hazlo más directo.')
    const body = edited.updated.recipients[0]!.messageBody
    expect(body).not.toMatch(/Hazlo más directo/i)
    expect(body).toContain('Conciliación de entregas')
    expect(body.length).toBeLessThan(proposal.recipients[0]!.messageBody.length + 20)
  })

  it('Escenario C: memoria R3 distingue save_memory y forget_memory y respeta aislamiento piloto', async () => {
    const saveIntent = classifyAgentIntent('Recuerda que las revisiones de inventario deben realizarse los lunes.')
    expect(saveIntent).toEqual({
      kind: 'save_memory',
      body: 'las revisiones de inventario deben realizarse los lunes',
      memoryType: 'preference',
    })

    const forgetIntent = classifyAgentIntent('Olvida las revisiones de inventario')
    expect(forgetIntent).toEqual({
      kind: 'forget_memory',
      query: 'las revisiones de inventario',
    })

    const pilotId = 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'
    const otherId = 'f7e4b655-234c-4f81-abdb-a9c15ab8fd2c'
    expect(isAgentMemoryEnabled({ AGENT_MEMORY_R3: '1', AGENT_MEMORY_R3_PILOT_USERS: pilotId }, pilotId)).toBe(true)
    expect(isAgentMemoryEnabled({ AGENT_MEMORY_R3: '1', AGENT_MEMORY_R3_PILOT_USERS: pilotId }, otherId)).toBe(false)

    // Con R3 apagado, save_memory falla cerrado sin guardar
    vi.stubEnv('AGENT_MEMORY_R3', '0')
    const db = createR1Db()
    const actor = r1Actor(db, 'superAdmin')
    const turn = await runAgentTurn(
      {
        actor,
        channel: 'web',
        sessionId: 'sess-c-off',
        utterance: 'Recuerda que las revisiones de inventario deben realizarse los lunes.',
      },
      {
        dispatch: dispatchCopilotTool,
        store: r1Store(),
        memoryStore: createMemoryStore(),
      }
    )
    expect(turn.handled).toBe(true)
    expect(turn.response.blocks.data.join(' ')).toMatch(/no está activa/i)
  })

  it('Escenario D: borrador incremental en 4 turnos sin concatenaciones ni pérdida de campos', () => {
    const today = '2026-11-27'
    // Turno 1
    expect(classifyAgentIntent('Necesito que alguien revise las entregas.').kind).toBe('write_request')
    let draft = applyDraftPatch(emptyStructuredDraft(), extractActionPatch('Necesito que alguien revise las entregas.', today, false))
    expect(draft.titulo).toMatch(/^Revise las entregas/i)
    expect(draft.titulo).not.toMatch(/necesito que alguien/i)
    expect(draft.responsableHint).toBeNull()

    // Turno 2
    expect(isStructuredFollowUpUtterance('Asígnaselo a Gerardo.')).toBe(true)
    draft = applyDraftPatch(draft, extractActionPatch('Asígnaselo a Gerardo.', today, true))
    expect(draft.responsableHint).toBe('Gerardo')
    expect(draft.titulo).not.toMatch(/Gerardo/i)

    // Turno 3
    expect(isStructuredFollowUpUtterance('Para el lunes.')).toBe(true)
    draft = applyDraftPatch(draft, extractActionPatch('Para el lunes.', today, true))
    expect(draft.fecha).toBe('2026-11-30')
    expect(draft.titulo).not.toMatch(/lunes/i)

    // Turno 4
    expect(isStructuredFollowUpUtterance('Prioridad alta.')).toBe(true)
    draft = applyDraftPatch(draft, extractActionPatch('Prioridad alta.', today, true))
    expect(draft.prioridad).toBe('P1_Alta')
    expect(draft.fecha).toBe('2026-11-30')
    expect(draft.responsableHint).toBe('Gerardo')
  })
})
