import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { memoryQueryAuditSink, type QueryAuditEntry } from '../query/queryAudit.js'
import { isAgentOrchestratorEnabled, runChannelTurn } from './channelAdapters.js'
import { createFakeSupabase } from './testing/fakeSupabase.js'
import { createR1Db, r1Store, R1_NOW_ISO, R1_TODAY, R1_USERS } from './testing/r1Fixture.js'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})
afterAll(() => {
  vi.useRealTimers()
})

it('el orquestador queda apagado salvo AGENT_ORCHESTRATOR_R1=1', () => {
  expect(isAgentOrchestratorEnabled({})).toBe(false)
  expect(isAgentOrchestratorEnabled({ AGENT_ORCHESTRATOR_R1: 'true' })).toBe(false)
  expect(isAgentOrchestratorEnabled({ AGENT_ORCHESTRATOR_R1: '1' })).toBe(true)
})

it('voz rehidrata la consulta activa persistida (consult_log) tras un cold start', async () => {
  const db = createR1Db()
  const audit: QueryAuditEntry[] = []
  const user = R1_USERS.lead
  const turn = await runChannelTurn(
    {
      identity: { supabase: createFakeSupabase(db), authUserId: user.user_id, usuarioId: user.id, rol: user.rol, active: true },
      channel: 'voice',
      sessionId: 'guide-1',
      utterance: '¿Cuáles están vencidas?',
      seedActiveQuery: { type: 'active_query', entity: 'actions', scope: 'created_by_me', status_group: 'open', visual: 'none', at: R1_NOW_ISO },
    },
    { dispatch: (a, n, args) => dispatchCopilotTool(a, n, args), store: r1Store(), audit: memoryQueryAuditSink(audit), today: () => R1_TODAY }
  )
  expect(turn.handled).toBe(true)
  // Conserva «creadas por mí»: a1 (propia), a5 (Ana) y a9 (Carlos).
  expect(turn.response.references.map((r) => r.id).sort()).toEqual(['a1', 'a5', 'a9'])
  expect(turn.text).not.toContain('\n')
  expect(audit[0]).toMatchObject({ channel: 'voice', scope: 'created_by_me' })
})


it('el foco del cliente se reconsulta con el actor autenticado y no concede acceso por ID', async () => {
  const user = R1_USERS.lead
  const dispatch = vi.fn<typeof dispatchCopilotTool>(async () => ({ok: false as const, error: 'FORBIDDEN'}))
  await runChannelTurn({
    identity: {supabase: createFakeSupabase(createR1Db()), authUserId: user.user_id, usuarioId: user.id, rol: user.rol, active: true},
    channel: 'web', sessionId: 'focused-denied', utterance: 'Hola',
    focusedActionIds: ['22222222-2222-4222-8222-222222222299', 'not-a-uuid'],
  }, {dispatch, store: r1Store(), audit: memoryQueryAuditSink([]), today: () => R1_TODAY})
  const detailCalls = dispatch.mock.calls.filter(call => call[1] === 'get_action_details')
  expect(detailCalls).toHaveLength(1)
  expect(detailCalls[0]![0]).toMatchObject({usuarioId: user.id})
  expect(detailCalls[0]![2]).toEqual({accionId: '22222222-2222-4222-8222-222222222299'})
})
