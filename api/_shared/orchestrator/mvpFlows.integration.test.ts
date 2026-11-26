/**
 * Aceptación integrada MVP A1–A5 sobre runAgentTurn + fixtures R1/R2.
 * Clasificación: integración orquestador (Vitest). No es QA remoto ni GO QA/PROD.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cancelPendingOp, confirmPendingOp, dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { memoryQueryAuditSink } from '../query/queryAudit.js'
import { capabilityFingerprint } from '../query/actorCapabilities.js'
import { classifyAgentIntent } from './intent.js'
import { formatForChannel } from './channelAdapters.js'
import { composeText } from './respond.js'
import { runAgentTurn, type AgentTurnResult } from './runAgentTurn.js'
import { createMemorySessionContextStore } from './sessionContext.js'
import { R1_NOW_ISO, R1_TODAY, R1_USERS } from './testing/r1Fixture.js'
import { createR2Db, r2Actor, simulatedExecutorFor } from './testing/r2Fixture.js'
import { createMemoryStore } from '../memory/store.js'
import type { AgentDocumentRow } from '../memory/types.js'
import { actionIdForOp } from '../actions/r2Runtime.js'
import type { FakeDb } from './testing/fakeSupabase.js'

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

function world() {
  return { db: createR2Db(), store: createMemorySessionContextStore() }
}

async function turn(
  db: FakeDb,
  store: ReturnType<typeof createMemorySessionContextStore>,
  user: (typeof R1_USERS)[keyof typeof R1_USERS],
  utterance: string,
  channel: 'web' | 'whatsapp' = 'web',
  extra: { memoryStore?: Parameters<typeof runAgentTurn>[1]['memoryStore'] } = {}
) {
  const actor = await r2Actor(db, user, channel)
  const result = await runAgentTurn(
    { actor, utterance },
    {
      dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
      store,
      audit: memoryQueryAuditSink([]),
      today: () => R1_TODAY,
      memoryStore: extra.memoryStore,
    }
  )
  return {
    ...result,
    actor,
    text: composeText(result.response, { headings: true }),
    web: formatForChannel(result as AgentTurnResult, 'web'),
    wa: formatForChannel(result as AgentTurnResult, 'whatsapp'),
  }
}

describe('MVP A1 · consulta y priorización', () => {
  it('clasifica «cuál es el más urgente» y «qué debería hacer»', () => {
    expect(classifyAgentIntent('¿Cuál es el más urgente?', null).kind).toBe('who_most_urgent')
    expect(classifyAgentIntent('¿Quién tiene la más urgente?', null).kind).toBe('who_most_urgent')
    expect(classifyAgentIntent('¿Qué debería hacer?', null).kind).toBe('recommend_next')
    expect(classifyAgentIntent('¿Por dónde empiezo?', null).kind).toBe('recommend_next')
  })

  it('Carlos → atrasados → más urgente (a9) → siguiente paso, con asOf y sin Plan privado', async () => {
    const { db, store } = world()
    const pending = await turn(db, store, R1_USERS.lead, '¿Qué pendientes tiene Carlos?')
    expect(pending.handled).toBe(true)
    expect(pending.response.references.map((r) => r.id).sort()).toEqual(['a10', 'a9'])
    expect(pending.text).not.toContain('Plan privado')

    const overdue = await turn(db, store, R1_USERS.lead, '¿Cuáles están atrasados?')
    expect(overdue.response.references.map((r) => r.id)).toEqual(['a9'])

    const urgent = await turn(db, store, R1_USERS.lead, '¿Cuál es el más urgente?')
    expect(urgent.intent).toBe('who_most_urgent')
    expect(urgent.response.references.map((r) => r.id)).toEqual(['a9'])
    expect(urgent.text).toMatch(/Ruta retrasada de Carlos/)
    expect(urgent.response.asOf).toBeTruthy()
    expect(urgent.text).toMatch(/Corte/i)

    const next = await turn(db, store, R1_USERS.lead, '¿Qué debería hacer?')
    expect(next.intent).toBe('recommend_next')
    expect(next.response.references.map((r) => r.id)).toEqual(['a9'])
    expect(next.text).toMatch(/vencid|atrasad|urgente/i)
    expect(next.text).toContain('a9')
    expect(next.text).not.toContain('Plan privado')
    expect(next.response.asOf).toBeTruthy()
  })
})

describe('MVP A2 · propose → confirm simulated', () => {
  it('crea pending, confirma simulado, idempotencia, cancel, Verificado y ops ajenas', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db, store } = world()
    await turn(db, store, R1_USERS.lead, '¿Qué pendientes tiene Carlos?')
    await turn(db, store, R1_USERS.lead, '¿Cuál es el más urgente?')

    const proposed = await turn(db, store, R1_USERS.lead, 'Crea una acción para resolver el retraso')
    expect(proposed.intent).toBe('write_request')
    expect(proposed.response.status).toBe('proposal')
    expect(proposed.response.blocks.limitations.join(' ')).toMatch(/simulado/i)
    expect(db.tables.assistant_pending_ops).toHaveLength(1)
    const opId = db.tables.assistant_pending_ops![0]!.id as string
    const beforeCount = db.tables.acciones_diarias!.length
    expect(proposed.proposal).toMatchObject({ simulated: true })

    const again = await turn(db, store, R1_USERS.lead, 'Crea una acción para resolver el retraso')
    expect(db.tables.assistant_pending_ops).toHaveLength(1)
    expect((again.proposal as { id?: string } | undefined)?.id).toBe(opId)

    const actor = await r2Actor(db, R1_USERS.lead)
    const confirmed = await confirmPendingOp(actor.copilot, opId, {
      r2: { mode: 'simulated', executor: simulatedExecutorFor(actor) },
    })
    expect(confirmed.status).toBe('confirmed')
    expect(db.tables.acciones_diarias).toHaveLength(beforeCount + 1)
    expect(db.tables.acciones_diarias!.some((a) => a.id === actionIdForOp(opId))).toBe(true)

    const replay = await confirmPendingOp(actor.copilot, opId, {
      r2: { mode: 'simulated', executor: simulatedExecutorFor(actor) },
    })
    expect(replay.status).toBe('confirmed')
    expect(db.tables.acciones_diarias).toHaveLength(beforeCount + 1)

    const cancelWorld = world()
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    await turn(cancelWorld.db, cancelWorld.store, R1_USERS.lead, '¿Qué pendientes tiene Carlos?')
    await turn(cancelWorld.db, cancelWorld.store, R1_USERS.lead, '¿Cuál es el más urgente?')
    await turn(cancelWorld.db, cancelWorld.store, R1_USERS.lead, 'Crea una acción para resolver el retraso')
    const cancelId = cancelWorld.db.tables.assistant_pending_ops![0]!.id as string
    const kanbanBefore = cancelWorld.db.tables.acciones_diarias!.length
    const cancelActor = await r2Actor(cancelWorld.db, R1_USERS.lead)
    await cancelPendingOp(cancelActor.copilot, cancelId)
    expect(cancelWorld.db.tables.assistant_pending_ops![0]!.status).toBe('cancelled')
    expect(cancelWorld.db.tables.acciones_diarias).toHaveLength(kanbanBefore)

    const verified = await turn(db, store, R1_USERS.jorge1, 'Marca la acción como verificada')
    expect(verified.response.status).toBe('forbidden')

    const foreign = world()
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    await turn(foreign.db, foreign.store, R1_USERS.lead, '¿Qué pendientes tiene Carlos?')
    await turn(foreign.db, foreign.store, R1_USERS.lead, '¿Cuál es el más urgente?')
    await turn(foreign.db, foreign.store, R1_USERS.lead, 'Crea una acción para resolver el retraso')
    const foreignId = foreign.db.tables.assistant_pending_ops![0]!.id as string
    const direction = await r2Actor(foreign.db, R1_USERS.direction)
    await expect(
      confirmPendingOp(direction.copilot, foreignId, {
        r2: { mode: 'simulated', executor: simulatedExecutorFor(direction) },
      })
    ).rejects.toThrow(/no te pertenece/i)
  })
})

describe('MVP A3 · seguimiento', () => {
  it('prepara un seguimiento: una propuesta por responsable, cero outbox', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const { db, store } = world()
    await turn(db, store, R1_USERS.lead, '¿Qué pendientes tiene Carlos?')
    const follow = await turn(db, store, R1_USERS.lead, 'Prepara un seguimiento')
    expect(follow.intent).toBe('write_request')
    expect(follow.response.status).toBe('proposal')
    expect(db.tables.assistant_pending_ops).toHaveLength(1)
    expect(db.tables.assistant_pending_ops![0]!.tool).toBe('agent_notify_responsable')
    expect(follow.response.blocks.limitations.join(' ')).toMatch(/cero outbox|no se envi/i)
    expect(db.tables.qa_outbox ?? []).toEqual([])
  })

  it('pide aclarar si hay más de 3 responsables y deniega alcance ajeno del analista', async () => {
    const { db, store } = world()
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
        { id: 'a4', title: 'Proveedor', estado: 'Bloqueado', fecha: '2026-11-21', prioridad: 'P2_Media', responsableId: 'u-maria', responsableNombre: 'Maria', href: '/kanban?id=a4' },
        { id: 'a8', title: 'Auditoria', estado: 'Pendiente', fecha: '2026-11-27', prioridad: 'P2_Media', responsableId: 'u-j1', responsableNombre: 'Jorge Ruiz', href: '/kanban?id=a8' },
        { id: 'a9', title: 'Ruta', estado: 'Retraso', fecha: '2026-11-17', prioridad: 'P1_Alta', responsableId: 'u-carlos', responsableNombre: 'Carlos', href: '/kanban?id=a9' },
        { id: 'a6', title: 'Plan privado', estado: 'Pendiente', fecha: '2026-11-26', prioridad: 'P2_Media', responsableId: 'u-peer', responsableNombre: 'Pablo', href: '/kanban?id=a6' },
      ],
      lastEntity: null,
      fingerprint: capabilityFingerprint(actor.capabilities),
      responseFormat: 'auto',
      lastAnswer: null,
    })
    const clarify = await turn(db, store, R1_USERS.lead, 'Prepara un seguimiento')
    expect(clarify.response.status).toBe('clarification')
    expect(clarify.text).toMatch(/más de 3 responsables/i)

    const denied = await turn(db, store, R1_USERS.analyst, 'Muéstrame las acciones privadas de otro equipo.')
    expect(denied.response.status).toBe('forbidden')
    expect(denied.text).not.toMatch(/Plan privado/)
  })
})

describe('MVP A4 · conocimiento', () => {
  const NOW = R1_NOW_ISO
  function doc(partial: Partial<AgentDocumentRow> & Pick<AgentDocumentRow, 'id' | 'title' | 'body' | 'version' | 'status'>): AgentDocumentRow {
    return {
      logical_id: 'proc-verificacion',
      access_level: 'project_read',
      area_id: null,
      content_hash: 'd',
      source_label: 'procedimiento-verificacion',
      published_at: NOW,
      withdrawn_at: partial.status === 'withdrawn' ? NOW : null,
      ...partial,
    }
  }

  it('cita el procedimiento v2 publicado y no el v1 retirado; fallo de store no inventa', async () => {
    vi.stubEnv('AGENT_MEMORY_R3', '1')
    const memoryStore = createMemoryStore({
      documents: [
        doc({
          id: 'doc-v1',
          title: 'Cuándo se verifica v1',
          body: 'Versión retirada: se verifica con un KR al 99%.',
          version: 1,
          status: 'withdrawn',
        }),
        doc({
          id: 'doc-v2',
          title: 'Cuándo se verifica una acción',
          body: 'Una acción se verifica cuando un validador humano confirma la evidencia. El avance del KR no se toma de este documento (ejemplo interno 99%).',
          version: 2,
          status: 'published',
        }),
      ],
    })
    const { db, store } = world()
    const asked = await turn(
      db,
      store,
      R1_USERS.direction,
      '¿Cuándo se considera verificada una acción?',
      'web',
      { memoryStore }
    )
    expect(asked.handled).toBe(true)
    expect(asked.text).toMatch(/doc-v2|v2/i)
    expect(asked.text).not.toMatch(/doc-v1|retirad/i)
    expect(asked.text).toMatch(/tablero|Kanban|OKR/i)

    const opaque = await turn(
      db,
      store,
      R1_USERS.analyst,
      '¿Cuál es el procedimiento de verificación del org B?',
      'web',
      { memoryStore }
    )
    expect(opaque.response.status).toBe('forbidden')
    expect(opaque.text).not.toMatch(/doc-v2|99%/)

    const failing = await turn(db, store, R1_USERS.direction, '¿Cuál es el procedimiento de verificación?', 'web', {
      memoryStore: {
        recall: () => {
          throw new Error('store_down')
        },
      } as never,
    })
    expect(failing.text).toMatch(/memoria autorizada|limitaci/i)
  })

  it('con AGENT_MEMORY_R3 apagado el turno R1 no cita documentos', async () => {
    const memoryStore = createMemoryStore({
      documents: [
        doc({
          id: 'doc-v2',
          title: 'Cuándo se verifica una acción',
          body: 'Una acción se verifica con evidencia humana.',
          version: 2,
          status: 'published',
        }),
      ],
    })
    const { db, store } = world()
    const asked = await turn(db, store, R1_USERS.direction, '¿Cuándo se considera verificada una acción?', 'web', {
      memoryStore,
    })
    expect(asked.text).not.toMatch(/doc-v2/)
  })
})

describe('MVP A5 · paridad web / WhatsApp sim', () => {
  it('misma secuencia A1/A3 produce los mismos IDs y cero envíos', async () => {
    const web = world()
    const wa = world()
    const outbound: string[] = []

    const webPending = await turn(web.db, web.store, R1_USERS.lead, '¿Qué pendientes tiene Carlos?', 'web')
    const waPending = await turn(wa.db, wa.store, R1_USERS.lead, '¿Qué pendientes tiene Carlos?', 'whatsapp')
    expect(webPending.response.references.map((r) => r.id).sort()).toEqual(
      waPending.response.references.map((r) => r.id).sort()
    )
    expect(webPending.response.references.map((r) => r.id).sort()).toEqual(['a10', 'a9'])

    const webUrgent = await turn(web.db, web.store, R1_USERS.lead, '¿Cuál es el más urgente?', 'web')
    const waUrgent = await turn(wa.db, wa.store, R1_USERS.lead, '¿Cuál es el más urgente?', 'whatsapp')
    expect(webUrgent.response.references.map((r) => r.id)).toEqual(waUrgent.response.references.map((r) => r.id))
    expect(webUrgent.web).toContain('Ruta retrasada de Carlos')
    expect(waUrgent.wa).toContain('Ruta retrasada de Carlos')

    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const webFollow = await turn(web.db, web.store, R1_USERS.lead, 'Prepara un seguimiento', 'web')
    const waFollow = await turn(wa.db, wa.store, R1_USERS.lead, 'Prepara un seguimiento', 'whatsapp')
    expect(webFollow.intent).toBe(waFollow.intent)
    expect((webFollow.proposal as { tool?: string } | undefined)?.tool).toBe(
      (waFollow.proposal as { tool?: string } | undefined)?.tool
    )
    expect(outbound).toEqual([])
    expect(web.db.tables.qa_outbox ?? []).toEqual([])
    expect(wa.db.tables.qa_outbox ?? []).toEqual([])
  })
})


describe('P0 · ciclo de vida de la acción preparada', () => {
  it('recupera la confirmación y edita la acción existente sin otra creación', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const {db,store}=world()
    await turn(db,store,R1_USERS.lead,'¿Qué pendientes tiene Carlos?')
    await turn(db,store,R1_USERS.lead,'¿Cuál es el más urgente?')
    const proposed=await turn(db,store,R1_USERS.lead,'Crea una acción para resolver el retraso')
    const opId=proposed.proposal!.id
    const actor=await r2Actor(db,R1_USERS.lead)
    await confirmPendingOp(actor.copilot,opId,{r2:{mode:'simulated',executor:simulatedExecutorFor(actor)}})
    const before=db.tables.acciones_diarias!.length
    const review=await turn(db,store,R1_USERS.lead,'Muéstrame la acción que preparamos')
    expect(review.text).toContain('ya fue confirmada')
    expect(review.text).not.toContain('Propuesta lista para confirmación')
    const edit=await turn(db,store,R1_USERS.lead,'Cambia únicamente la fecha al lunes')
    expect(edit.proposal?.tool).toBe('agent_update_fields')
    expect(db.tables.assistant_pending_ops!.find(op=>op.id===edit.proposal!.id)?.resource_id).toBe(actionIdForOp(opId))
    expect(db.tables.acciones_diarias).toHaveLength(before)
    expect(db.tables.assistant_pending_ops!.filter(op=>op.tool==='agent_create_action')).toHaveLength(1)
  })
  it('revoca la tarjeta anterior antes de proponer una fecha nueva', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    const {db,store}=world()
    await turn(db,store,R1_USERS.lead,'¿Qué pendientes tiene Carlos?')
    await turn(db,store,R1_USERS.lead,'¿Cuál es el más urgente?')
    const proposed=await turn(db,store,R1_USERS.lead,'Crea una acción para resolver el retraso')
    const oldId=proposed.proposal!.id
    const edited=await turn(db,store,R1_USERS.lead,'Cambia únicamente la fecha al lunes')
    expect(db.tables.assistant_pending_ops!.find(op=>op.id===oldId)?.status).toBe('cancelled')
    expect(edited.proposal?.id).toBeTruthy()
    expect(edited.proposal?.id).not.toBe(oldId)
    const actor=await r2Actor(db,R1_USERS.lead)
    await expect(confirmPendingOp(actor.copilot,oldId,{r2:{mode:'simulated',executor:simulatedExecutorFor(actor)}})).rejects.toThrow(/cancelada/i)
  })
})

it('WhatsApp asigna a otro usuario autorizado solo después de confirmar la propuesta',async()=>{
 vi.stubEnv('R2_EXECUTION_MODE','simulated')
 const {db,store}=world()
 const before=db.tables.acciones_diarias!.length
 const proposed=await turn(db,store,R1_USERS.superAdmin,'Crea una acción para revisar inventario, para Carlos, en Kanban corporativo, para el viernes','whatsapp')
 expect(proposed.proposal?.tool).toBe('agent_create_action')
 expect(db.tables.acciones_diarias).toHaveLength(before)
 const actor=await r2Actor(db,R1_USERS.superAdmin,'whatsapp')
 const opId=proposed.proposal!.id
 const confirmed=await confirmPendingOp(actor.copilot,opId,{r2:{mode:'simulated',channel:'whatsapp',executor:simulatedExecutorFor(actor)}})
 expect(confirmed.status).toBe('confirmed')
 const saved=db.tables.acciones_diarias!.find(a=>a.id===actionIdForOp(opId))
 expect(saved).toMatchObject({responsable:R1_USERS.carlos.id,created_by:R1_USERS.superAdmin.id,titulo_accion:'Revisar inventario'})
 expect(db.tables.acciones_diarias).toHaveLength(before+1)
 await confirmPendingOp(actor.copilot,opId,{r2:{mode:'simulated',channel:'whatsapp',executor:simulatedExecutorFor(actor)}})
 expect(db.tables.acciones_diarias).toHaveLength(before+1)
})
