/**
 * Puente R2 local: con R2_EXECUTION_MODE=simulated el orquestador persiste assistant_pending_ops
 * sin ejecutar. Execute sigue off por defecto; DEV/PROD refs nunca entran en modo qa.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { confirmPendingOp, dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { memoryQueryAuditSink } from '../query/queryAudit.js'
import { runAgentTurn } from '../orchestrator/runAgentTurn.js'
import { capabilityFingerprint } from '../query/actorCapabilities.js'
import { createMemorySessionContextStore } from '../orchestrator/sessionContext.js'
import { R1_NOW_ISO, R1_TODAY, R1_USERS } from '../orchestrator/testing/r1Fixture.js'
import { createR2Db, r2Actor, simulatedExecutorFor } from '../orchestrator/testing/r2Fixture.js'
import { BLOCKED_PROJECT_REFS, resolveR2ExecutionMode } from './executionMode.js'

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

async function seededTurn(utterance: string) {
  const db = createR2Db()
  const store = createMemorySessionContextStore()
  const actor = await r2Actor(db, R1_USERS.jorge1)
  // Semilla: última entidad = acción a8 (permiso de Jorge).
  await store.set('u-j1:web:s-r2', {
    activeQuery: {
      type: 'active_query',
      entity: 'actions',
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'none',
      at: R1_NOW_ISO,
    },
    lastActions: [
      {
        id: 'a8',
        title: 'Auditoria de Jorge',
        estado: 'Pendiente',
        fecha: '2026-11-27',
        prioridad: 'P2_Media',
        responsableId: 'u-j1',
        responsableNombre: 'Jorge Ruiz',
        href: '/kanban?id=a8',
      },
    ],
    lastEntity: { kind: 'action', id: 'a8', label: 'Auditoria de Jorge' },
    fingerprint: capabilityFingerprint(actor.capabilities),
    responseFormat: 'auto',
    lastAnswer: null,
  })
  const result = await runAgentTurn(
    { actor, utterance },
    {
      dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
      store,
      audit: memoryQueryAuditSink([]),
      today: () => R1_TODAY,
    }
  )
  return { db, result, action: db.tables.acciones_diarias!.find((a) => a.id === 'a8')! }
}

describe('R2 · puente orquestador → pending_ops (simulated)', () => {
  it('no persiste con modo disabled (default) y no escribe Kanban', async () => {
    expect(resolveR2ExecutionMode({})).toBe('disabled')
    const { db, result, action } = await seededTurn('Marca la acción como hecha')
    expect(result.intent).toBe('write_request')
    expect(result.proposal).toMatchObject({ operation: 'update_status', payload: { estado: 'Hecho' } })
    expect(db.tables.assistant_pending_ops).toEqual([])
    expect(action.estado).toBe('Pendiente')
  })

  it('persiste propuesta Hecho≠Verificado en simulated sin ejecutar', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    expect(resolveR2ExecutionMode()).toBe('simulated')
    const { db, result, action } = await seededTurn('Marca la acción como hecha')
    expect(result.response.status).toBe('proposal')
    expect(db.tables.assistant_pending_ops).toHaveLength(1)
    expect(db.tables.assistant_pending_ops![0]).toMatchObject({
      tool: 'agent_set_action_status',
      status: 'pending',
      resource_id: 'a8',
    })
    expect((db.tables.assistant_pending_ops![0]!.payload as { estado?: string }).estado).toBe('Hecho')
    expect(action.estado).toBe('Pendiente')
    expect(result.response.blocks.limitations.join(' ')).toMatch(/simulado|tarjeta/i)
  })

  it('rechaza Verificado y no inventa éxito', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db, result, action } = await seededTurn('Marca la acción como verificada')
    expect(result.response.status).toBe('forbidden')
    expect(db.tables.assistant_pending_ops).toEqual([])
    expect(action.estado).toBe('Pendiente')
  })

  it('confirma create simulated, no duplica y Dirección no confirma ops ajenas', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const actor = await r2Actor(db, R1_USERS.lead)
    await store.set('u-lead:web:s-r2', {
      activeQuery: {
        type: 'active_query',
        entity: 'actions',
        scope: 'board_authorized',
        status_group: 'open',
        visual: 'none',
        at: R1_NOW_ISO,
      },
      lastActions: [
        {
          id: 'a9',
          title: 'Ruta retrasada de Carlos',
          estado: 'Retraso',
          fecha: '2026-11-17',
          prioridad: 'P1_Alta',
          responsableId: 'u-carlos',
          responsableNombre: 'Carlos Reyes',
          href: '/kanban?id=a9',
        },
      ],
      lastEntity: { kind: 'action', id: 'a9', label: 'Ruta retrasada de Carlos' },
      fingerprint: capabilityFingerprint(actor.capabilities),
      responseFormat: 'auto',
      lastAnswer: null,
    })
    const proposed = await runAgentTurn(
      { actor, utterance: 'Crea una acción para resolver el retraso' },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )
    expect(proposed.response.status).toBe('proposal')
    expect(db.tables.assistant_pending_ops).toHaveLength(1)
    const opId = db.tables.assistant_pending_ops![0]!.id as string
    const before = db.tables.acciones_diarias!.length
    const confirmed = await confirmPendingOp(actor.copilot, opId, {
      r2: { mode: 'simulated', executor: simulatedExecutorFor(actor) },
    })
    expect(confirmed.status).toBe('confirmed')
    expect(db.tables.acciones_diarias).toHaveLength(before + 1)
    const replay = await confirmPendingOp(actor.copilot, opId, {
      r2: { mode: 'simulated', executor: simulatedExecutorFor(actor) },
    })
    expect(replay.status).toBe('confirmed')
    expect(db.tables.acciones_diarias).toHaveLength(before + 1)
    const direction = await r2Actor(db, R1_USERS.direction)
    await expect(
      confirmPendingOp(direction.copilot, opId, {
        r2: { mode: 'simulated', executor: simulatedExecutorFor(direction) },
      })
    ).rejects.toThrow(/ya se ejecut|no te pertenece/i)
  })

  it('nunca habilita qa contra refs DEV/PROD', () => {
    for (const blocked of BLOCKED_PROJECT_REFS) {
      expect(
        resolveR2ExecutionMode({
          R2_EXECUTION_MODE: 'qa',
          SUPABASE_URL: `https://${blocked}.supabase.co`,
          R2_QA_PROJECT_REFS: blocked,
        })
      ).toBe('disabled')
    }
  })
})
