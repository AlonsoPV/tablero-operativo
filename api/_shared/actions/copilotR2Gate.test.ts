/**
 * Copiloto web por la puerta R2 (COPILOT_R2_GATE). Con el flag apagado el flujo es idéntico al
 * actual; con el flag encendido las herramientas de tablero pasan por la misma puerta, claim e
 * idempotencia que R2, sobre el mismo confirmPendingOp (sin segundo motor).
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { confirmPendingOp } from '../assistantOpsRuntime.js'
import { createPendingOp } from '../assistantPending.js'
import type { FakeDb } from '../orchestrator/testing/fakeSupabase.js'
import { R1_NOW_ISO, R1_USERS } from '../orchestrator/testing/r1Fixture.js'
import { createR2Db, r2Actor, simulatedExecutorFor } from '../orchestrator/testing/r2Fixture.js'
import { isCopilotR2GateEnabled } from './executionMode.js'
import { actionIdForOp } from './r2Runtime.js'

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

type User = (typeof R1_USERS)[keyof typeof R1_USERS]

function world() {
  const db = createR2Db()
  db.rpcs = {
    ...db.rpcs,
    try_set_accion_hecho: (args, session) => {
      const a = db.tables.acciones_diarias!.find((x) => x.id === args.p_accion_id)!
      Object.assign(a, { estado: 'Hecho', completed_by: session.usuarioId, updated_at: new Date().toISOString() })
      return true
    },
  }
  return db
}

let seq = 0
function pushOp(db: FakeDb, user: User, tool: string, payload: Record<string, unknown>, resourceId: string | null = null) {
  const action = resourceId ? db.tables.acciones_diarias!.find((a) => a.id === resourceId) : null
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  db.tables.assistant_pending_ops!.push({
    id, usuario_id: user.id, tool, resource_id: resourceId, expected_updated_at: action?.updated_at ?? null,
    payload, preview: {}, status: 'pending', expires_at: '2026-11-19T16:10:00.000Z', request_key: null,
  })
  return id
}

const createPayload = (title: string) => ({
  titulo_accion: title, descripcion_accion: title, evidencia_esperada: 'Evidencia', fecha: '2026-11-25', hora_limite: '17:00',
  estado: 'Pendiente', responsable: R1_USERS.maria.id, prioridad: 'P2_Media', created_by: R1_USERS.lead.id, tipo_accion: 'operativa', checkpoints: [],
})

const action = (db: FakeDb, id: string) => db.tables.acciones_diarias!.find((a) => a.id === id)!
const op = (db: FakeDb, id: string) => db.tables.assistant_pending_ops!.find((o) => o.id === id)!

async function confirm(db: FakeDb, user: User, id: string, opts: { simulated?: boolean; fromTool?: boolean } = {}) {
  const actor = await r2Actor(db, user)
  return confirmPendingOp(actor.copilot, id, {
    fromTool: opts.fromTool,
    r2: opts.simulated ? { mode: 'simulated', executor: simulatedExecutorFor(actor) } : undefined,
  })
}

describe('COPILOT_R2_GATE apagado (por defecto): flujo actual sin cambios', () => {
  it('el flag está apagado por defecto y nunca se enciende en producción', () => {
    expect(isCopilotR2GateEnabled({})).toBe(false)
    expect(isCopilotR2GateEnabled({ COPILOT_R2_GATE: '1' })).toBe(true)
    expect(isCopilotR2GateEnabled({ COPILOT_R2_GATE: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(isCopilotR2GateEnabled({ COPILOT_R2_GATE: '1', NODE_ENV: 'production' })).toBe(false)
    expect(isCopilotR2GateEnabled({ COPILOT_R2_GATE: 'true' })).toBe(false)
  })

  it('create_action, mark_action_done y la confirmación desde herramienta siguen como hoy', async () => {
    const db = world()
    const create = pushOp(db, R1_USERS.lead, 'create_action', createPayload('Flujo actual'))
    expect((await confirm(db, R1_USERS.lead, create)).status).toBe('confirmed')
    const created = db.tables.acciones_diarias!.find((a) => a.titulo_accion === 'Flujo actual')!
    expect(created.id).not.toBe(actionIdForOp(create))

    const done = pushOp(db, R1_USERS.jorge1, 'mark_action_done', { action_id: 'a8' }, 'a8')
    expect((await confirm(db, R1_USERS.jorge1, done, { fromTool: true })).status).toBe('confirmed')
    expect(action(db, 'a8').estado).toBe('Hecho')
    expect(db.tables.agent_action_receipts).toEqual([])
    expect(op(db, done).claimed_at).toBeUndefined()
  })

  it('las propuestas no reciben request_key', async () => {
    const db = world()
    const actor = await r2Actor(db, R1_USERS.lead)
    await createPendingOp(actor.copilot, { tool: 'create_action', payload: createPayload('Sin clave'), proposal: { title: 't', summary: 's', fields: [] } })
    expect(db.tables.assistant_pending_ops![0]!.request_key).toBeUndefined()
  })
})

describe('COPILOT_R2_GATE encendido: misma puerta que R2', () => {
  it('sin modo de ejecución la confirmación se niega sin efecto', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    const id = pushOp(db, R1_USERS.lead, 'create_action', createPayload('Sin modo'))
    await expect(confirm(db, R1_USERS.lead, id)).rejects.toThrow('EXECUTION_DISABLED')
    expect(db.tables.acciones_diarias!.some((a) => a.titulo_accion === 'Sin modo')).toBe(false)
    expect(op(db, id).status).toBe('pending')
  })

  it('create_action usa el id determinista; confirmar dos veces no duplica', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    const id = pushOp(db, R1_USERS.lead, 'create_action', createPayload('Determinista'))
    await confirm(db, R1_USERS.lead, id, { simulated: true })
    await confirm(db, R1_USERS.lead, id, { simulated: true })
    expect(db.tables.acciones_diarias!.filter((a) => a.titulo_accion === 'Determinista')).toEqual([
      expect.objectContaining({ id: actionIdForOp(id) }),
    ])
  })

  it('la misma intención produce una sola propuesta (request_key)', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    const actor = await r2Actor(db, R1_USERS.lead)
    const input = { tool: 'create_action' as const, payload: createPayload('Idempotente'), proposal: { title: 't', summary: 's', fields: [] } }
    const first = await createPendingOp(actor.copilot, input)
    const second = await createPendingOp(actor.copilot, input)
    expect(second.id).toBe(first.id)
    expect(db.tables.assistant_pending_ops).toHaveLength(1)
    expect(db.tables.assistant_pending_ops![0]!.request_key).toMatch(/^[0-9a-f]{32}$/)
  })

  it('mark_action_done pasa por claim y agent_apply_action_status con recibo', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    const id = pushOp(db, R1_USERS.jorge1, 'mark_action_done', { action_id: 'a8' }, 'a8')
    expect((await confirm(db, R1_USERS.jorge1, id, { simulated: true })).status).toBe('confirmed')
    expect(action(db, 'a8')).toMatchObject({ estado: 'Hecho', completed_by: R1_USERS.jorge1.id })
    expect(op(db, id).claimed_at).toBeTruthy()
    expect(db.tables.agent_action_receipts).toEqual([expect.objectContaining({ pending_op_id: id, tool: 'mark_action_done', estado_nuevo: 'Hecho' })])
  })

  it('la IA no confirma: fromTool se rechaza con el flag encendido', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    const id = pushOp(db, R1_USERS.jorge1, 'mark_action_done', { action_id: 'a8' }, 'a8')
    await expect(confirm(db, R1_USERS.jorge1, id, { simulated: true, fromTool: true })).rejects.toThrow('el asistente no confirma por ti')
    expect(action(db, 'a8').estado).toBe('Pendiente')
  })

  it('verify_action queda separado: sólo creador o Super Admin; el responsable no verifica', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    action(db, 'a8').estado = 'Hecho'
    const byResponsable = pushOp(db, R1_USERS.jorge1, 'verify_action', { action_id: 'a8' }, 'a8')
    await expect(confirm(db, R1_USERS.jorge1, byResponsable, { simulated: true })).rejects.toThrow('PERMISSION_DENIED')
    expect(action(db, 'a8').estado).toBe('Hecho')

    const byCreator = pushOp(db, R1_USERS.lead, 'verify_action', { action_id: 'a8' }, 'a8')
    expect((await confirm(db, R1_USERS.lead, byCreator, { simulated: true })).status).toBe('confirmed')
    expect(action(db, 'a8').estado).toBe('Verificado')
  })

  it('Analista y Dirección no confirman; cambio de rol tras proponer se niega con el rol vigente', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    const analyst = pushOp(db, R1_USERS.analyst, 'add_action_comment', { action_id: 'a5', contenido: 'Comentario' }, 'a5')
    await expect(confirm(db, R1_USERS.analyst, analyst, { simulated: true })).rejects.toThrow('PERMISSION_DENIED')
    const direction = pushOp(db, R1_USERS.direction, 'update_action', { action_id: 'a2', patch: { prioridad: 'P1_Alta' } }, 'a2')
    await expect(confirm(db, R1_USERS.direction, direction, { simulated: true })).rejects.toThrow('PERMISSION_DENIED')

    const lead = pushOp(db, R1_USERS.lead, 'update_action', { action_id: 'a2', patch: { prioridad: 'P1_Alta' } }, 'a2')
    db.tables.usuarios!.find((u) => u.id === R1_USERS.lead.id)!.rol = 'Analista'
    await expect(confirm(db, R1_USERS.lead, lead, { simulated: true })).rejects.toThrow('PERMISSION_DENIED')
    expect(action(db, 'a2').prioridad).toBe('P2_Media')
    expect(db.tables.accion_comentarios).toEqual([])
  })

  it('update_action no puede cambiar el estado por la vía de campos', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    const db = world()
    const id = pushOp(db, R1_USERS.lead, 'update_action', { action_id: 'a2', patch: { estado: 'Hecho' } }, 'a2')
    await expect(confirm(db, R1_USERS.lead, id, { simulated: true })).rejects.toThrow('VALIDATION_FAILED')
    expect(action(db, 'a2').estado).toBe('Pendiente')
  })

  it('con el flag encendido en producción se ignora (flujo actual)', async () => {
    vi.stubEnv('COPILOT_R2_GATE', '1')
    vi.stubEnv('VERCEL_ENV', 'production')
    const db = world()
    const id = pushOp(db, R1_USERS.lead, 'create_action', createPayload('Produccion'))
    expect((await confirm(db, R1_USERS.lead, id)).status).toBe('confirmed')
    expect(db.tables.agent_action_receipts).toEqual([])
  })
})
