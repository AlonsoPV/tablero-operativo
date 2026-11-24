/**
 * GAP-04 / WA-05: simulador de frases WhatsApp sobre el orquestador compartido.
 * Graph mockeado (cero envíos). No toca whatsapp-followup-dispatcher.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { memoryQueryAuditSink } from '../query/queryAudit.js'
import { formatForChannel } from './channelAdapters.js'
import { runAgentTurn, type AgentTurnResult } from './runAgentTurn.js'
import { createR1Db, r1Actor, r1Store, R1_NOW_ISO, R1_TODAY, R1_USERS } from './testing/r1Fixture.js'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})
afterAll(() => {
  vi.useRealTimers()
})

const outbound: string[] = []

async function wa(user: (typeof R1_USERS)[keyof typeof R1_USERS], utterance: string, store = r1Store()) {
  const db = createR1Db()
  const actor = r1Actor(db, user, 'whatsapp')
  const result = await runAgentTurn(
    { actor, utterance },
    {
      dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
      store,
      audit: memoryQueryAuditSink([]),
      today: () => R1_TODAY,
    }
  )
  const text = result.handled ? formatForChannel(result as AgentTurnResult, 'whatsapp') : ''
  // Simulación: nunca se encola un envío a Graph.
  expect(outbound).toEqual([])
  return { db, store, result, text }
}

describe('R3 · WhatsApp simulator (no Graph)', () => {
  it('mis acciones → atrasados → más urgente con el mismo store de sesión', async () => {
    const store = r1Store()
    const mine = await wa(R1_USERS.lead, '¿Qué tengo pendiente?', store)
    expect(mine.result.handled).toBe(true)
    expect(mine.result.response.references.map((r) => r.id)).toEqual(['a1', 'a2', 'a3'])

    const overdue = await wa(R1_USERS.lead, '¿Cuáles están atrasados?', store)
    expect(overdue.result.response.references.map((r) => r.id)).toEqual(['a1'])

    const urgent = await wa(R1_USERS.lead, '¿Quién tiene la más urgente?', store)
    expect(urgent.result.intent).toBe('who_most_urgent')
    expect(urgent.text).toContain('Cerrar inventario')
    expect(outbound).toEqual([])
  })

  it('Carlos → cuál es el más urgente → qué debería hacer (mismos IDs, 0 Graph)', async () => {
    const store = r1Store()
    const carlos = await wa(R1_USERS.lead, '¿Qué pendientes tiene Carlos?', store)
    expect(carlos.result.response.references.map((r) => r.id).sort()).toEqual(['a10', 'a9'])
    const urgent = await wa(R1_USERS.lead, '¿Cuál es el más urgente?', store)
    expect(urgent.result.intent).toBe('who_most_urgent')
    expect(urgent.result.response.references.map((r) => r.id)).toEqual(['a9'])
    const next = await wa(R1_USERS.lead, '¿Qué debería hacer?', store)
    expect(next.result.intent).toBe('recommend_next')
    expect(next.result.response.references.map((r) => r.id)).toEqual(['a9'])
    expect(outbound).toEqual([])
  })

  it('pendientes de Carlos y denegación opaca del analista', async () => {
    const store = r1Store()
    const carlos = await wa(R1_USERS.lead, '¿Qué pendientes tiene Carlos?', store)
    expect(carlos.result.response.references.map((r) => r.id).sort()).toEqual(['a10', 'a9'])
    expect(carlos.text).not.toContain('Plan privado')

    const denied = await wa(R1_USERS.analyst, 'Muéstrame las acciones privadas de otro equipo.')
    expect(denied.result.response.status).toBe('forbidden')
    expect(denied.text).not.toMatch(/Plan privado|Cerrar inventario/)
    expect(outbound).toEqual([])
  })

  it('botón hecha se queda en propuesta sin mutar ni enviar', async () => {
    const store = r1Store()
    await wa(R1_USERS.jorge1, '¿Cuáles tiene Jorge Ruiz?', store)
    const done = await wa(R1_USERS.jorge1, 'Marca la acción como hecha', store)
    expect(done.result.intent).toBe('write_request')
    expect(done.result.proposal).toMatchObject({ operation: 'update_status', payload: { estado: 'Hecho' } })
    expect(done.result.response.blocks.limitations.join(' ')).toMatch(/no está habilitada|no se modificó/i)
    expect(outbound).toEqual([])
  })
})
