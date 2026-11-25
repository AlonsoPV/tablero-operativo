/**
 * R2 Executive Action (E1–E13): propose → approve → execute → confirm en fixture simulado.
 * Cero writes a DEV/PROD. R2 OFF por omisión.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cancelPendingOp, confirmPendingOp, dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { memoryQueryAuditSink } from '../query/queryAudit.js'
import { runAgentTurn } from '../orchestrator/runAgentTurn.js'
import { classifyAgentIntent } from '../orchestrator/intent.js'
import { capabilityFingerprint } from '../query/actorCapabilities.js'
import { createMemorySessionContextStore } from '../orchestrator/sessionContext.js'
import { R1_NOW_ISO, R1_TODAY, R1_USERS } from '../orchestrator/testing/r1Fixture.js'
import { createR2Db, r2Actor, simulatedExecutorFor } from '../orchestrator/testing/r2Fixture.js'
import { editR2PendingOp } from './r2Runtime.js'
import { resolveR2ExecutionMode } from './executionMode.js'
import type { CopilotProposal } from '../../../src/features/ai-support/copilot/types.js'

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

const BLOCKED_DEV = 'tgiuevzlyptzlfgxsfhj'
const BLOCKED_PROD = 'xhpasmjzuwifmjhrsumb'

async function turn(
  utterance: string,
  opts: {
    user?: (typeof R1_USERS)[keyof typeof R1_USERS]
    db?: ReturnType<typeof createR2Db>
    store?: ReturnType<typeof createMemorySessionContextStore>
    seedA8?: boolean
  } = {}
) {
  const db = opts.db ?? createR2Db()
  const store = opts.store ?? createMemorySessionContextStore()
  const user = opts.user ?? R1_USERS.jorge1
  const actor = await r2Actor(db, user)
  if (opts.seedA8 !== false) {
    const key = `${user.id === 'u-j1' ? 'u-j1' : user.id}:web:s-r2`
    const existing = await store.get(key)
    if (!existing) {
      await store.set(key, {
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
            href: '/kanban?accion=a8',
          },
        ],
        lastEntity: { kind: 'action', id: 'a8', label: 'Auditoria de Jorge' },
        fingerprint: capabilityFingerprint(actor.capabilities),
        responseFormat: 'auto',
        lastAnswer: null,
      })
    }
  }
  const result = await runAgentTurn(
    { actor, utterance },
    {
      dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
      store,
      audit: memoryQueryAuditSink([]),
      today: () => R1_TODAY,
    }
  )
  return { db, store, actor, result }
}

async function confirm(db: ReturnType<typeof createR2Db>, user: (typeof R1_USERS)[keyof typeof R1_USERS], opId: string, extra?: { fromTool?: boolean }) {
  const actor = await r2Actor(db, user)
  return confirmPendingOp(actor.copilot, opId, {
    fromTool: extra?.fromTool,
    r2: { mode: 'simulated', executor: simulatedExecutorFor(actor) },
  })
}

function pending(db: ReturnType<typeof createR2Db>) {
  return db.tables.assistant_pending_ops ?? []
}

describe('R2 Executive Action · intents', () => {
  it('clasifica comentario, verificar, campos, lote y escrituras no soportadas', () => {
    expect(classifyAgentIntent('Agrega un comentario a esa acción: cliente avisó retraso')).toMatchObject({
      kind: 'write_request',
      operation: 'add_comment',
    })
    expect(classifyAgentIntent('Verifica esa acción')).toMatchObject({ kind: 'write_request', operation: 'verify_action' })
    expect(classifyAgentIntent('Asigna esa acción a Maria Lopez')).toMatchObject({
      kind: 'write_request',
      operation: 'update_action',
    })
    expect(classifyAgentIntent('Convierte los compromisos en propuestas')).toMatchObject({
      kind: 'write_request',
      batch: 'commitments',
    })
    expect(classifyAgentIntent('Convierte las decisiones en acciones')).toMatchObject({
      kind: 'write_request',
      batch: 'decisions',
    })
    expect(classifyAgentIntent('Marca esa acción como hecha')).toMatchObject({
      kind: 'write_request',
      operation: 'update_status',
    })
    expect(classifyAgentIntent('Marca esa acción como verificada')).toMatchObject({
      kind: 'write_request',
      estado: 'Verificado',
    })
    expect(classifyAgentIntent('Ejecuta SQL update acciones_diarias set estado').kind).toBe('unsupported_write')
    expect(classifyAgentIntent('Taguear esta acción como OKR').kind).toBe('unsupported_write')
  })
})

describe('R2 Executive Action · E1–E13 simulated', () => {
  it('E13 R2 OFF no inserta assistant_pending_ops ni ejecuta', async () => {
    const { db, result } = await turn('Crea una acción para resolver el retraso', { user: R1_USERS.lead, seedA8: false })
    expect(result.executionEnabled).toBeFalsy()
    expect(pending(db)).toEqual([])
    expect(result.proposals ?? []).toEqual([])
    expect(result.response.blocks.limitations.join(' ')).toMatch(/R2 desactivado|no está habilitada/i)
  })

  it('E1 crea acción persistida en simulated y al confirmar inserta con href', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db, result } = await turn('Crea una acción para resolver el retraso', { user: R1_USERS.lead })
    expect(result.intent).toBe('write_request')
    expect(pending(db)).toHaveLength(1)
    expect(pending(db)[0]).toMatchObject({ tool: 'agent_create_action', status: 'pending' })
    const before = db.tables.acciones_diarias!.length
    const confirmed = await confirm(db, R1_USERS.lead, pending(db)[0]!.id as string)
    expect(confirmed.status).toBe('confirmed')
    expect(db.tables.acciones_diarias).toHaveLength(before + 1)
    expect(String((confirmed.result as { href?: string }).href ?? '')).toMatch(/\/kanban\?accion=/)
  })

  it('E2 asigna responsable, fecha y prioridad', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db, result } = await turn('Asigna esa acción a Maria Lopez, fecha 2026-11-25 y prioridad alta')
    expect(result.intent).toBe('write_request')
    expect(pending(db)[0]).toMatchObject({ tool: 'agent_update_fields', status: 'pending' })
    const payload = pending(db)[0]!.payload as { responsable?: string; fecha?: string; prioridad?: string }
    expect(payload).toMatchObject({ responsable: 'u-maria', fecha: '2026-11-25', prioridad: 'P1_Alta' })
    await confirm(db, R1_USERS.jorge1, pending(db)[0]!.id as string)
    const action = db.tables.acciones_diarias!.find((a) => a.id === 'a8')!
    expect(action).toMatchObject({ responsable: 'u-maria', fecha: '2026-11-25', prioridad: 'P1_Alta' })
  })

  it('E3 actualiza por referencia lastEntity', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db, result } = await turn('Marca esa acción como hecha')
    expect(result.proposal && 'tool' in result.proposal ? result.proposal.tool : '').toBe('agent_set_action_status')
    expect((pending(db)[0]!.payload as { estado?: string }).estado).toBe('Hecho')
    await confirm(db, R1_USERS.jorge1, pending(db)[0]!.id as string)
    expect(db.tables.acciones_diarias!.find((a) => a.id === 'a8')!.estado).toBe('Hecho')
  })

  it('E4 agrega comentario', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db } = await turn('Agrega un comentario a esa acción: cliente avisó retraso')
    expect(pending(db)[0]).toMatchObject({ tool: 'agent_add_comment' })
    await confirm(db, R1_USERS.jorge1, pending(db)[0]!.id as string)
    expect(db.tables.accion_comentarios!.some((c) => String(c.contenido).includes('cliente avisó retraso'))).toBe(true)
  })

  it('E5 Hecho ≠ Verificado: marca hecha ok; marca verificada denegada; verify_action exige Hecho y humano', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const denied = await turn('Marca esa acción como verificada')
    expect(denied.result.response.status).toBe('forbidden')
    expect(pending(denied.db)).toEqual([])

    const db = createR2Db()
    db.tables.acciones_diarias!.find((a) => a.id === 'a8')!.estado = 'Hecho'
    const verify = await turn('Verifica esa acción', { db, user: R1_USERS.lead })
    expect(pending(db)[0]?.tool).toBe('agent_verify_action')
    await expect(confirm(db, R1_USERS.lead, pending(db)[0]!.id as string, { fromTool: true })).rejects.toThrow(
      /Sólo tú puedes confirmar/i
    )
    await confirm(db, R1_USERS.lead, pending(db)[0]!.id as string)
    expect(db.tables.acciones_diarias!.find((a) => a.id === 'a8')!.estado).toBe('Verificado')
  })

  it('E6 recomendación → propuesta de creación con origen', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const first = await turn('Qué me recomiendas', { user: R1_USERS.lead })
    expect(first.result.intent).toBe('recommend_next')
    const second = await turn('Crea una acción para desbloquear esa acción', {
      user: R1_USERS.lead,
      db: first.db,
      store: first.store,
      seedA8: false,
    })
    expect(second.result.intent).toBe('write_request')
    expect(pending(second.db).some((op) => op.tool === 'agent_create_action')).toBe(true)
  })

  it('E7 compromisos de sesión → lote con batchId', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const start = await turn('Hagamos una revisión ejecutiva', { user: R1_USERS.lead, seedA8: false })
    expect(start.result.intent).toBe('executive_review')
    const converted = await turn('Convierte los compromisos en propuestas', {
      user: R1_USERS.lead,
      db: start.db,
      store: start.store,
      seedA8: false,
    })
    expect(converted.result.intent).toBe('write_request')
    const ops = pending(converted.db).filter((op) => op.tool === 'agent_create_action')
    expect(ops.length).toBeGreaterThan(1)
    const batchIds = new Set(ops.map((op) => (op.payload as { batchId?: string }).batchId))
    expect(batchIds.size).toBe(1)
    expect(converted.result.batchId).toBeTruthy()
    expect(converted.result.proposals?.length).toBe(ops.length)
  })

  it('E8 editar invalida firma previa y cancelar no ejecuta', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db, actor } = await turn('Asigna esa acción a Maria Lopez')
    const op = pending(db)[0]!
    const beforeKey = op.request_key
    const edited = await editR2PendingOp(actor.copilot, op.id as string, { fecha: '2026-11-26' })
    expect(edited.fields.some((f) => f.label === 'Fecha' && f.to === '2026-11-26')).toBe(true)
    expect(pending(db)[0]!.request_key).not.toBe(beforeKey)
    await cancelPendingOp(actor.copilot, op.id as string)
    expect(pending(db)[0]!.status).toBe('cancelled')
    expect(db.tables.acciones_diarias!.find((a) => a.id === 'a8')!.responsable).toBe('u-j1')
  })

  it('E9 niega sin permiso y sin aprobación humana', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const analyst = await turn('Marca esa acción como hecha', { user: R1_USERS.analyst, seedA8: false })
    expect(analyst.result.response.status).toBe('forbidden')
    const direction = await turn('Crea una acción para resolver el retraso', { user: R1_USERS.direction, seedA8: false })
    expect(direction.result.response.status).toBe('forbidden')
    const { db } = await turn('Marca esa acción como hecha')
    await expect(confirm(db, R1_USERS.jorge1, pending(db)[0]!.id as string, { fromTool: true })).rejects.toThrow(
      /Sólo tú puedes confirmar/i
    )
    expect(db.tables.acciones_diarias!.find((a) => a.id === 'a8')!.estado).toBe('Pendiente')
  })

  it('E10 idempotencia: misma clave no duplica; confirm replay no reescribe', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const first = await turn('Marca esa acción como hecha')
    const second = await turn('Marca esa acción como hecha', { db: first.db, store: first.store })
    expect(pending(first.db)).toHaveLength(1)
    expect((second.result.proposal as CopilotProposal | undefined)?.id).toBe(pending(first.db)[0]!.id)
    const opId = pending(first.db)[0]!.id as string
    await confirm(first.db, R1_USERS.jorge1, opId)
    const replay = await confirm(first.db, R1_USERS.jorge1, opId)
    expect(replay.status).toBe('confirmed')
    expect(dbCountHecho(first.db)).toBe(1)
  })

  it('E11 conflicto CAS y lote parcial no reintenta lo confirmado', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const store = createMemorySessionContextStore()
    const db = createR2Db()
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
          id: 'a8',
          title: 'Auditoria de Jorge',
          estado: 'Pendiente',
          fecha: '2026-11-27',
          prioridad: 'P2_Media',
          responsableId: 'u-j1',
          responsableNombre: 'Jorge Ruiz',
          href: '/kanban?accion=a8',
        },
        {
          id: 'a4',
          title: 'Proveedor de empaque',
          estado: 'Bloqueado',
          fecha: '2026-11-21',
          prioridad: 'P2_Media',
          responsableId: 'u-maria',
          responsableNombre: 'Maria Lopez',
          href: '/kanban?accion=a4',
        },
      ],
      lastEntity: { kind: 'action', id: 'a8', label: 'Auditoria de Jorge' },
      fingerprint: capabilityFingerprint(actor.capabilities),
      responseFormat: 'auto',
      lastAnswer: null,
    })
    const one = await runAgentTurn(
      { actor, utterance: 'Pon prioridad alta a esa acción' },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )
    expect(one.response.status).toBe('proposal')
    const opA8 = pending(db).find((op) => op.resource_id === 'a8')!
    db.tables.acciones_diarias!.find((a) => a.id === 'a8')!.updated_at = '2026-11-19T18:00:00.000Z'
    await expect(confirm(db, R1_USERS.lead, opA8.id as string)).rejects.toThrow(/cambi[oó] despu[eé]s/i)
    expect(db.tables.acciones_diarias!.find((a) => a.id === 'a8')!.prioridad).toBe('P2_Media')

    await store.set('u-lead:web:s-r2', {
      ...(await store.get('u-lead:web:s-r2'))!,
      lastEntity: { kind: 'action', id: 'a4', label: 'Proveedor de empaque' },
    })
    const two = await runAgentTurn(
      { actor, utterance: 'Pon prioridad alta a esa acción' },
      {
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        store,
        audit: memoryQueryAuditSink([]),
        today: () => R1_TODAY,
      }
    )
    expect(two.response.status).toBe('proposal')
    const opA4 = pending(db).find((op) => op.resource_id === 'a4' && op.status === 'pending')!
    await confirm(db, R1_USERS.lead, opA4.id as string)
    expect(db.tables.acciones_diarias!.find((a) => a.id === 'a4')!.prioridad).toBe('P1_Alta')
    expect(pending(db).find((op) => op.id === opA8.id)!.status).not.toBe('confirmed')
  })

  it('E12 confirmación + continuidad de lastEntity', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const first = await turn('Marca esa acción como hecha')
    await confirm(first.db, R1_USERS.jorge1, pending(first.db)[0]!.id as string)
    const follow = await turn('Agrega un comentario a esa acción: seguimiento post-cierre', {
      db: first.db,
      store: first.store,
    })
    expect(follow.result.intent).toBe('write_request')
    expect(pending(first.db).some((op) => op.tool === 'agent_add_comment')).toBe(true)
  })

  it('nunca habilita qa contra refs DEV/PROD', () => {
    for (const blocked of [BLOCKED_DEV, BLOCKED_PROD]) {
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

function dbCountHecho(db: ReturnType<typeof createR2Db>) {
  return db.tables.acciones_diarias!.filter((a) => a.id === 'a8' && a.estado === 'Hecho').length
}
