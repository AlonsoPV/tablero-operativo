/**
 * Aceptación R2 local (AT-06 a AT-10 y AT-16) sobre el flujo real
 * proposeR2Operation → assistant_pending_ops → confirmPendingOp → ActionExecutor simulado.
 * Supabase en memoria y RPC simulada: no valida RLS con JWT reales (pendiente de QA autorizada).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { confirmPendingOp, dispatchCopilotTool, executeBoardWrite, r2OptionsFromServerEnv } from '../assistantOpsRuntime.js'
import { memoryQueryAuditSink } from '../query/queryAudit.js'
import { runAgentTurn } from '../orchestrator/runAgentTurn.js'
import type { FakeDb } from '../orchestrator/testing/fakeSupabase.js'
import { r1Store, R1_NOW_ISO, R1_TODAY, R1_USERS } from '../orchestrator/testing/r1Fixture.js'
import { createR2Db, r2Actor, simulatedExecutorFor } from '../orchestrator/testing/r2Fixture.js'
import { R2_EXECUTION_DISABLED_MESSAGE, qaProjectRef, resolveR2ExecutionMode } from './executionMode.js'
import {
  actionIdForOp,
  createQaActionExecutor,
  proposeR2Operation,
  readBlockHistory,
  readR2Evidence,
  type R2Operation,
  type SimulatedOutboxEntry,
} from './r2Runtime.js'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})
afterAll(() => {
  vi.useRealTimers()
})

type User = (typeof R1_USERS)[keyof typeof R1_USERS]

function world() {
  const db = createR2Db()
  const outbox: SimulatedOutboxEntry[] = []
  return { db, outbox }
}

async function propose<O extends R2Operation>(db: FakeDb, user: User, operation: O, input: Parameters<typeof proposeR2Operation<O>>[2]) {
  return proposeR2Operation(await r2Actor(db, user), operation, input, { today: R1_TODAY })
}

async function proposed<O extends R2Operation>(db: FakeDb, user: User, operation: O, input: Parameters<typeof proposeR2Operation<O>>[2]) {
  const result = await propose(db, user, operation, input)
  if (!result.ok) throw new Error(`propuesta rechazada: ${result.reason}`)
  return result.proposal.id
}

async function confirm(w: ReturnType<typeof world>, user: User, opId: string, opts: { fromTool?: boolean } = {}) {
  const actor = await r2Actor(w.db, user)
  return confirmPendingOp(actor.copilot, opId, {
    fromTool: opts.fromTool,
    r2: { mode: 'simulated', executor: simulatedExecutorFor(actor, w.outbox) },
  })
}

const op = (db: FakeDb, id: string) => db.tables.assistant_pending_ops!.find((o) => o.id === id)!
const action = (db: FakeDb, id: string) => db.tables.acciones_diarias!.find((a) => a.id === id)!
const logOf = (db: FakeDb, id: string) => db.tables.assistant_op_log!.filter((l) => l.pending_op_id === id).map((l) => l.result)
const fromLog = (db: FakeDb) => db.inserts.filter((i) => i.table === 'assistant_op_log').map((i) => i.row)

describe('R2 · modo de ejecución y puerta de confirmación', () => {
  it('disabled por defecto; simulated sólo fuera de Vercel/producción', () => {
    expect(resolveR2ExecutionMode({})).toBe('disabled')
    expect(resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'simulated' })).toBe('simulated')
    expect(resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'simulated', VERCEL: '1' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'simulated', VERCEL_ENV: 'preview' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'simulated', NODE_ENV: 'production' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'rpc' })).toBe('disabled')
  })

  it('qa exige proyecto en la allowlist, nunca DEV/PROD ni producción, sólo desde process.env', () => {
    const qa = { R2_EXECUTION_MODE: 'qa', SUPABASE_URL: 'https://qaprojectaaaaaaaaaaaa.supabase.co', R2_QA_PROJECT_REFS: 'qaprojectaaaaaaaaaaaa' }
    expect(resolveR2ExecutionMode(qa)).toBe('qa')
    expect(resolveR2ExecutionMode({ ...qa, VERCEL: '1', VERCEL_ENV: 'preview' })).toBe('qa')
    expect(qaProjectRef(qa)).toBe('qaprojectaaaaaaaaaaaa')
    expect(resolveR2ExecutionMode({ ...qa, R2_QA_PROJECT_REFS: '' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...qa, R2_QA_PROJECT_REFS: 'otroqaaaaaaaaaaaaaaa' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...qa, VERCEL_ENV: 'production' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...qa, NODE_ENV: 'production' })).toBe('disabled')
    for (const blocked of ['tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb']) {
      expect(resolveR2ExecutionMode({ ...qa, SUPABASE_URL: `https://${blocked}.supabase.co`, R2_QA_PROJECT_REFS: blocked })).toBe('disabled')
      // Una allowlist contaminada con DEV/PROD invalida el modo completo.
      expect(resolveR2ExecutionMode({ ...qa, R2_QA_PROJECT_REFS: `qaprojectaaaaaaaaaaaa,${blocked}` })).toBe('disabled')
    }
    expect(resolveR2ExecutionMode({ ...qa, SUPABASE_URL: 'http://127.0.0.1:54321' })).toBe('disabled')
    expect(r2OptionsFromServerEnv({})).toBeUndefined()
    expect(r2OptionsFromServerEnv(qa)).toMatchObject({ mode: 'qa', executor: { kind: 'qa' } })
  })

  it('qa local exige QA_LOCAL=1, loopback, puerto declarado y ref qalocal; no se activa en Vercel', () => {
    const local = {
      R2_EXECUTION_MODE: 'qa',
      QA_LOCAL: '1',
      QA_LOCAL_PORTS: '54421,54521',
      QA_LOCAL_REF: 'qalocala000000000000',
      SUPABASE_URL: 'http://127.0.0.1:54421',
      R2_QA_PROJECT_REFS: 'qalocala000000000000',
    }
    expect(resolveR2ExecutionMode(local)).toBe('qa')
    expect(qaProjectRef(local)).toBe('qalocala000000000000')
    expect(resolveR2ExecutionMode({ ...local, QA_LOCAL: undefined })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...local, SUPABASE_URL: 'https://127.0.0.1:54421' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...local, SUPABASE_URL: 'http://10.0.0.5:54421' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...local, VERCEL: '1' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...local, VERCEL_ENV: 'preview' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...local, NODE_ENV: 'production' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...local, QA_LOCAL_REF: 'tgiuevzlyptzlfgxsfhj' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ ...local, R2_QA_PROJECT_REFS: 'tgiuevzlyptzlfgxsfhj,qalocala000000000000' })).toBe('disabled')
  })

  it('el ejecutor debe corresponder al modo: qa con simulated o simulated con qa queda deshabilitado', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    const actor = await r2Actor(w.db, R1_USERS.jorge1)
    const qaExecutor = createQaActionExecutor({ boardWrite: executeBoardWrite, projectRef: 'qafixturerefaaaaaaaa' })
    await expect(confirmPendingOp(actor.copilot, id, { r2: { mode: 'simulated', executor: qaExecutor } }))
      .rejects.toThrow('EXECUTION_DISABLED')
    await expect(confirmPendingOp(actor.copilot, id, { r2: { mode: 'qa', executor: simulatedExecutorFor(actor, w.outbox) } }))
      .rejects.toThrow('EXECUTION_DISABLED')
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
  })

  it('en canales reales la confirmación responde «ejecución no habilitada» y no toca datos', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    const actor = await r2Actor(w.db, R1_USERS.jorge1)
    await expect(confirmPendingOp(actor.copilot, id)).rejects.toThrow(R2_EXECUTION_DISABLED_MESSAGE)
    expect(op(w.db, id).status).toBe('pending')
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
    expect(logOf(w.db, id)).toEqual(['proposed', 'denied'])
  })

  it('puerta en BD cerrada (sin seed QA): el claim se rechaza y no hay efecto', async () => {
    const w = world()
    w.db.tables.agent_execution_gate = []
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    await expect(confirm(w, R1_USERS.jorge1, id)).rejects.toThrow('execution_disabled')
    expect(op(w.db, id).status).toBe('pending')
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
  })

  it('ruta directa: fijar executing a mano y llamar la RPC sin claim se rechaza', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    op(w.db, id).status = 'executing'
    const client = (await r2Actor(w.db, R1_USERS.jorge1)).copilot.supabase
    const { error } = await client.rpc('agent_apply_action_status', {
      p_pending_op_id: id, p_accion_id: 'a8', p_estado: 'En_Ejecucion', p_motivo: null,
      p_expected_updated_at: op(w.db, id).expected_updated_at,
    })
    expect(error?.message).toContain('not_confirmed')
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
  })

  it('la IA no confirma: confirm_pending_op desde una herramienta del modelo se rechaza', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    await expect(confirm(w, R1_USERS.jorge1, id, { fromTool: true })).rejects.toThrow('el asistente no confirma por ti')
    expect(op(w.db, id).status).toBe('pending')
  })
})

describe('AT-06 · crear acción', () => {
  it('propone con responsable resuelto en servidor y crea una sola vez al confirmar', async () => {
    const w = world()
    const result = await propose(w.db, R1_USERS.lead, 'create_action', {
      titulo: 'Conseguir proveedor alterno', responsableId: null, responsableHint: 'Maria', fecha: '2026-11-25',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const id = result.proposal.id
    expect(w.db.tables.acciones_diarias!.some((a) => a.titulo_accion === 'Conseguir proveedor alterno')).toBe(false)
    expect(op(w.db, id)).toMatchObject({ tool: 'agent_create_action', status: 'pending', request_key: result.idempotencyKey })

    const confirmed = await confirm(w, R1_USERS.lead, id)
    expect(confirmed.status).toBe('confirmed')
    const created = action(w.db, actionIdForOp(id))
    expect(created).toMatchObject({ titulo_accion: 'Conseguir proveedor alterno', responsable: R1_USERS.maria.id, created_by: R1_USERS.lead.id, estado: 'Pendiente' })
    expect(logOf(w.db, id)).toEqual(['proposed', 'executed'])
  })

  it('pide datos faltantes, desambigua personas y rechaza fechas pasadas', async () => {
    const w = world()
    const missing = await propose(w.db, R1_USERS.lead, 'create_action', { titulo: 'Sin responsable', responsableId: null, fecha: null })
    expect(missing).toMatchObject({ ok: false, missing: ['responsable', 'fecha'] })
    const ambiguous = await propose(w.db, R1_USERS.lead, 'create_action', {
      titulo: 'Auditar', responsableId: null, responsableHint: 'Jorge', fecha: '2026-11-25',
    })
    expect(ambiguous.ok).toBe(false)
    if (!ambiguous.ok) expect(ambiguous.reason).toContain('Jorge Ruiz, Jorge Perez')
    const past = await propose(w.db, R1_USERS.lead, 'create_action', { titulo: 'Tarde', responsableId: R1_USERS.maria.id, fecha: '2026-11-01' })
    expect(past).toMatchObject({ ok: false, reason: expect.stringContaining('hoy o posterior') })
    expect(w.db.tables.assistant_pending_ops).toEqual([])
  })
})

describe('AT-07 · actualizar estado', () => {
  it('el responsable cambia el estado con recibo SQL; Verificado no se propone', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    expect(op(w.db, id)).toMatchObject({ resource_id: 'a8', expected_updated_at: '2026-11-18T10:00:00Z' })
    await confirm(w, R1_USERS.jorge1, id)
    expect(action(w.db, 'a8').estado).toBe('En_Ejecucion')
    expect(w.db.tables.agent_action_receipts).toHaveLength(1)

    const verified = await propose(w.db, R1_USERS.lead, 'update_status', { accionId: 'a2', estado: 'Verificado' as never })
    expect(verified).toMatchObject({ ok: false, reason: expect.stringContaining('Verificado requiere') })
  })

  it('Hecho respeta los checkpoints: el fallo deja la operación pendiente (rollback lógico) y el reintento cierra una vez', async () => {
    const w = world()
    w.db.tables.accion_checkpoints!.push({ id: 'c1', accion_id: 'a8', activo: true, completado: false })
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'Hecho' })
    await expect(confirm(w, R1_USERS.jorge1, id)).rejects.toThrow('puntos de validacion pendientes')
    expect(op(w.db, id)).toMatchObject({ status: 'pending', error_message: expect.stringContaining('puntos de validacion') })
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
    expect(w.db.tables.agent_action_receipts).toHaveLength(0)
    expect(logOf(w.db, id)).toEqual(['proposed', 'error'])

    w.db.tables.accion_checkpoints![0]!.completado = true
    const done = await confirm(w, R1_USERS.jorge1, id)
    expect(done.status).toBe('confirmed')
    expect(action(w.db, 'a8')).toMatchObject({ estado: 'Hecho', completed_by: R1_USERS.jorge1.id })
    expect(logOf(w.db, id)).toEqual(['proposed', 'error', 'executed'])
  })
})

describe('AT-08 · registrar bloqueo', () => {
  it('exige motivo; la causa reportada queda como comentario bloqueo_reportado y nunca en causa_raiz', async () => {
    const w = world()
    const short = await propose(w.db, R1_USERS.jorge1, 'register_blocker', { accionId: 'a8', motivo: 'no' })
    expect(short).toMatchObject({ ok: false, missing: ['motivo'] })

    const id = await proposed(w.db, R1_USERS.jorge1, 'register_blocker', { accionId: 'a8', motivo: 'Falta material del proveedor' })
    await confirm(w, R1_USERS.jorge1, id)
    expect(action(w.db, 'a8').estado).toBe('Bloqueado')
    expect(action(w.db, 'a8').causa_raiz).toBeUndefined()
    expect(w.db.tables.accion_comentarios).toEqual([expect.objectContaining({
      accion_id: 'a8', contenido: 'Causa reportada: Falta material del proveedor', tipo_comentario: 'bloqueo_reportado', created_by: R1_USERS.jorge1.id,
    })])

    // También con edición general (la creadora) la causa reportada no se convierte en causa raíz.
    const lead = await proposed(w.db, R1_USERS.lead, 'register_blocker', { accionId: 'a2', motivo: 'Sin presupuesto aprobado' })
    await confirm(w, R1_USERS.lead, lead)
    expect(action(w.db, 'a2').estado).toBe('Bloqueado')
    expect(action(w.db, 'a2').causa_raiz).toBeUndefined()
    expect(op(w.db, lead).result).toMatchObject({ causaReportada: true })
  })

  it('historial de bloqueos: responsable y creador lo consultan; Analista, Dirección y otros no', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'register_blocker', { accionId: 'a8', motivo: 'Falta material del proveedor' })
    await confirm(w, R1_USERS.jorge1, id)
    const mine = await readBlockHistory(await r2Actor(w.db, R1_USERS.jorge1), 'a8')
    expect(mine).toMatchObject({
      ok: true,
      history: {
        reportes: [expect.objectContaining({ contenido: 'Causa reportada: Falta material del proveedor', tipo: 'bloqueo_reportado' })],
        recibos: [expect.objectContaining({ pendingOpId: id, estadoNuevo: 'Bloqueado' })],
      },
    })
    const creatorId = String(action(w.db, 'a8').created_by)
    const creator = Object.values(R1_USERS).find((u) => u.id === creatorId)
    if (creator) expect(await readBlockHistory(await r2Actor(w.db, creator), 'a8')).toMatchObject({ ok: true })
    for (const user of [R1_USERS.analyst, R1_USERS.direction, R1_USERS.maria]) {
      if (user.id === creatorId) continue
      expect(await readBlockHistory(await r2Actor(w.db, user), 'a8')).toMatchObject({ ok: false })
    }
  })
})

describe('AT-09 · aviso por WhatsApp al responsable', () => {
  it('requiere el permiso explícito de bandeja WhatsApp; el destinatario sale del responsable de la acción', async () => {
    const w = world()
    const denied = await propose(w.db, R1_USERS.jorge1, 'notify_responsable', { accionId: 'a4', canal: 'whatsapp' })
    expect(denied).toMatchObject({ ok: false, reason: expect.stringContaining('permiso explícito') })

    const id = await proposed(w.db, R1_USERS.lead, 'notify_responsable', { accionId: 'a4', canal: 'whatsapp' })
    expect(op(w.db, id).payload).toMatchObject({ destinatarioId: R1_USERS.maria.id, canal: 'whatsapp' })
    await confirm(w, R1_USERS.lead, id)
    expect(w.outbox).toEqual([expect.objectContaining({ canal: 'whatsapp', toUserId: R1_USERS.maria.id, phone: '5215550001111', accionId: 'a4' })])
  })

  it('fallo parcial sin WhatsApp vinculado: queda pendiente sin envío; tras vincular se envía una vez', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.lead, 'notify_responsable', { accionId: 'a8', canal: 'whatsapp' })
    await expect(confirm(w, R1_USERS.lead, id)).rejects.toThrow('MISSING_CONTACT')
    expect(op(w.db, id)).toMatchObject({ status: 'pending', error_message: expect.stringContaining('MISSING_CONTACT') })
    expect(w.outbox).toEqual([])
    w.db.tables.user_channel_identities!.push({ channel: 'whatsapp', usuario_id: R1_USERS.jorge1.id, external_user_id: '5215550002222', status: 'active' })
    await confirm(w, R1_USERS.lead, id)
    await confirm(w, R1_USERS.lead, id)
    expect(w.outbox).toHaveLength(1)
  })
})

describe('AT-10 · aviso por correo al responsable', () => {
  it('envía una vez al responsable; confirmar de nuevo no reenvía; si cambia el responsable no se envía', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.lead, 'notify_responsable', { accionId: 'a8', canal: 'email' })
    await confirm(w, R1_USERS.lead, id)
    await confirm(w, R1_USERS.lead, id)
    expect(w.outbox).toEqual([expect.objectContaining({ canal: 'email', toUserId: R1_USERS.jorge1.id, idempotencyKey: `agent-notify:${id}` })])

    expect(await propose(w.db, R1_USERS.lead, 'notify_responsable', { accionId: 'a3', canal: 'email' }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('Eres el responsable') })
    expect(await propose(w.db, R1_USERS.maria, 'notify_responsable', { accionId: 'a8', canal: 'email' }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('No tienes permiso') })
    const moved = await proposed(w.db, R1_USERS.lead, 'notify_responsable', { accionId: 'a5', canal: 'email' })
    action(w.db, 'a5').responsable = R1_USERS.maria.id
    await expect(confirm(w, R1_USERS.lead, moved)).rejects.toThrow('El responsable cambió')
    expect(w.outbox).toHaveLength(1)
  })
})

describe('AT-16 · evidencia y reporte', () => {
  it('la operación conserva resultado, bitácora y recibo; sólo su autor los consulta', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    await confirm(w, R1_USERS.jorge1, id)
    const evidence = await readR2Evidence(await r2Actor(w.db, R1_USERS.jorge1), id)
    expect(evidence).toMatchObject({
      ok: true,
      op: { status: 'confirmed', result: { estadoAnterior: 'Pendiente', estado: 'En_Ejecucion' } },
      receipt: { estado_anterior: 'Pendiente', estado_nuevo: 'En_Ejecucion' },
    })
    if (evidence.ok) expect(evidence.log.map((l) => (l as { result: string }).result)).toEqual(['proposed', 'executed'])
    expect(await readR2Evidence(await r2Actor(w.db, R1_USERS.lead), id)).toMatchObject({ ok: false })
  })
})

describe('R2 · idempotencia, concurrencia, vencimiento y cambio de rol', () => {
  it('la misma intención produce la misma propuesta; confirmar dos veces aplica una sola vez', async () => {
    const w = world()
    const first = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    const second = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    expect(second).toBe(first)
    expect(w.db.tables.assistant_pending_ops).toHaveLength(1)
    await confirm(w, R1_USERS.jorge1, first)
    const again = await confirm(w, R1_USERS.jorge1, first)
    expect(again.status).toBe('confirmed')
    expect(w.db.tables.agent_action_receipts).toHaveLength(1)
  })

  it('dos confirmaciones concurrentes: una reserva la operación y el efecto ocurre una vez', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.lead, 'create_action', { titulo: 'Concurrente', responsableId: R1_USERS.maria.id, fecha: '2026-11-26' })
    const results = await Promise.allSettled([confirm(w, R1_USERS.lead, id), confirm(w, R1_USERS.lead, id)])
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1)
    expect(w.db.tables.acciones_diarias!.filter((a) => a.titulo_accion === 'Concurrente')).toHaveLength(1)
    expect(op(w.db, id).status).toBe('confirmed')
  })

  it('confirmación vencida: no ejecuta, marca expired y permite volver a proponer', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    vi.setSystemTime(new Date(Date.parse(R1_NOW_ISO) + 11 * 60 * 1000))
    try {
      await expect(confirm(w, R1_USERS.jorge1, id)).rejects.toThrow('expiró')
      expect(op(w.db, id).status).toBe('expired')
      expect(action(w.db, 'a8').estado).toBe('Pendiente')
      const again = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
      expect(again).not.toBe(id)
      expect(op(w.db, id).request_key).toBeNull()
    } finally {
      vi.setSystemTime(new Date(R1_NOW_ISO))
    }
  })

  it('cambio de rol o desactivación después de proponer: la confirmación se niega con permisos recargados', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    const jorge = w.db.tables.usuarios!.find((u) => u.id === R1_USERS.jorge1.id)!
    jorge.rol = 'Analista'
    await expect(confirm(w, R1_USERS.jorge1, id)).rejects.toThrow('PERMISSION_DENIED')
    jorge.rol = 'Operativo'
    jorge.activo = false
    await expect(confirm(w, R1_USERS.jorge1, id)).rejects.toThrow('inactivo')
    expect(op(w.db, id).status).toBe('pending')
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
    expect(logOf(w.db, id)).toEqual(['proposed', 'denied', 'denied'])
  })

  it('updated_at cambiado después de la propuesta: conflicto sin efecto', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    action(w.db, 'a8').updated_at = '2026-11-19T15:00:00Z'
    await expect(confirm(w, R1_USERS.jorge1, id)).rejects.toThrow('cambió después de la vista previa')
    expect(op(w.db, id).status).toBe('conflict')
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
    // confirmPendingOp registra el conflicto y, al propagar el error, también 'error' (comportamiento previo).
    expect(logOf(w.db, id)).toEqual(['proposed', 'conflict', 'error'])
    await expect(confirm(w, R1_USERS.jorge1, id)).rejects.toThrow('ya no se puede confirmar')
  })
})

describe('R2 · roles de consulta y alcance de la IA', () => {
  it('Dirección y Analista no proponen ni confirman, aunque la operación se inserte a mano', async () => {
    const w = world()
    expect(await propose(w.db, R1_USERS.direction, 'update_status', { accionId: 'a2', estado: 'En_Ejecucion' }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('acceso de consulta') })
    expect(await propose(w.db, R1_USERS.analyst, 'register_blocker', { accionId: 'a5', motivo: 'Sin acceso al sistema' }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('acceso de consulta') })

    w.db.tables.assistant_pending_ops!.push({
      id: 'forged', usuario_id: R1_USERS.analyst.id, tool: 'agent_set_action_status', resource_id: 'a5',
      expected_updated_at: '2026-11-15T10:00:00Z', payload: { accionId: 'a5', estado: 'Hecho' }, preview: {},
      status: 'pending', expires_at: '2026-11-19T16:10:00.000Z',
    })
    await expect(confirm(w, R1_USERS.analyst, 'forged')).rejects.toThrow('PERMISSION_DENIED')
    expect(action(w.db, 'a5').estado).toBe('Pendiente')
  })

  it('campos de autoridad en la entrada no amplían permisos y no llegan al payload', async () => {
    const w = world()
    const forged = { accionId: 'a5', motivo: 'Sin acceso al sistema', rol: 'super_admin', capabilities: { superAdmin: true } }
    expect(await propose(w.db, R1_USERS.analyst, 'register_blocker', forged)).toMatchObject({ ok: false })
    const id = await proposed(w.db, R1_USERS.jorge1, 'register_blocker', { ...forged, accionId: 'a8' })
    expect(Object.keys(op(w.db, id).payload as object).sort()).toEqual(['accionId', 'expectedUpdatedAt', 'motivo'])
  })

  it('otro usuario no confirma una operación ajena', async () => {
    const w = world()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    await expect(confirm(w, R1_USERS.lead, id)).rejects.toThrow('no te pertenece')
  })
})

describe('R2 · canales sólo llegan a la propuesta', () => {
  async function turn(db: FakeDb, user: User, utterance: string, store = r1Store()) {
    return runAgentTurn(
      { actor: await r2Actor(db, user), utterance },
      { dispatch: (a, name, args) => dispatchCopilotTool(a, name, args), store, audit: memoryQueryAuditSink([]), today: () => R1_TODAY }
    )
  }

  it('bloqueo, estado y aviso se identifican sin crear operaciones ni tocar datos', async () => {
    const w = world()
    const blocker = await turn(w.db, R1_USERS.jorge1, 'Bloquea la acción porque falta material')
    expect(blocker.intent).toBe('write_request')
    expect(blocker.proposal).toMatchObject({ operation: 'register_blocker', executionEnabled: false })
    expect(blocker.response.blocks.limitations.at(-1)).toContain('no está habilitada en este canal')

    const status = await turn(w.db, R1_USERS.jorge1, 'Marca la acción como en ejecución')
    expect(status.proposal).toMatchObject({ operation: 'update_status', payload: { estado: 'En_Ejecucion' } })

    const notify = await turn(w.db, R1_USERS.lead, 'Avisa al responsable por WhatsApp de esa acción')
    expect(notify.proposal).toMatchObject({ operation: 'notify_responsable', payload: { canal: 'whatsapp' } })

    const verified = await turn(w.db, R1_USERS.lead, 'Marca la acción como verificada')
    expect(verified.response.status).toBe('forbidden')
    expect(verified.response.blocks.data.join(' ')).toContain('Verificado requiere')

    expect(w.db.tables.assistant_pending_ops).toEqual([])
    expect(fromLog(w.db)).toEqual([])
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
  })
})

describe('R2 · ejecutor qa (sesión del usuario, buzón qa_outbox)', () => {
  const QA_REF = 'qafixturerefaaaaaaaa'
  function qaWorld() {
    const w = world()
    w.db.tables.qa_outbox = []
    w.db.unique = { ...w.db.unique, qa_outbox: [['idempotency_key']] }
    w.db.rpcs = {
      ...w.db.rpcs,
      agent_execution_environment: () => QA_REF,
      qa_whatsapp_linked: (args) => (w.db.tables.user_channel_identities ?? [])
        .some((i) => i.usuario_id === args.p_usuario_id && i.channel === 'whatsapp' && i.status === 'active'),
    }
    return w
  }
  async function confirmQa(w: ReturnType<typeof world>, user: User, id: string, projectRef = QA_REF) {
    const actor = await r2Actor(w.db, user)
    return confirmPendingOp(actor.copilot, id, {
      r2: { mode: 'qa', executor: createQaActionExecutor({ boardWrite: executeBoardWrite, projectRef }) },
    })
  }

  it('estado y aviso se ejecutan con la sesión del usuario; el aviso queda sólo en qa_outbox, una vez', async () => {
    const w = qaWorld()
    const status = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    expect((await confirmQa(w, R1_USERS.jorge1, status)).status).toBe('confirmed')
    expect(action(w.db, 'a8').estado).toBe('En_Ejecucion')

    const notify = await proposed(w.db, R1_USERS.lead, 'notify_responsable', { accionId: 'a4', canal: 'whatsapp' })
    await confirmQa(w, R1_USERS.lead, notify)
    await confirmQa(w, R1_USERS.lead, notify)
    expect(w.db.tables.qa_outbox).toEqual([expect.objectContaining({
      idempotency_key: `agent-notify:${notify}`, canal: 'whatsapp', to_usuario_id: R1_USERS.maria.id, sender_usuario_id: R1_USERS.lead.id,
    })])
    expect(w.outbox).toEqual([])
  })

  it('si la BD declara otro proyecto QA, no se ejecuta (CONFIGURATION_ERROR)', async () => {
    const w = qaWorld()
    const id = await proposed(w.db, R1_USERS.jorge1, 'update_status', { accionId: 'a8', estado: 'En_Ejecucion' })
    await expect(confirmQa(w, R1_USERS.jorge1, id, 'otroproyectoaaaaaaaa')).rejects.toThrow('CONFIGURATION_ERROR')
    expect(op(w.db, id).status).toBe('pending')
    expect(action(w.db, 'a8').estado).toBe('Pendiente')
  })

  it('en qa las herramientas de comunicación del copiloto no llegan a proveedores reales', async () => {
    const w = qaWorld()
    w.db.tables.assistant_pending_ops!.push({
      id: 'mail', usuario_id: R1_USERS.lead.id, tool: 'notify_action_email', resource_id: 'a8', payload: { usuario_id: R1_USERS.jorge1.id },
      preview: {}, status: 'pending', expires_at: '2026-11-19T16:10:00.000Z',
    })
    await expect(confirmQa(w, R1_USERS.lead, 'mail')).rejects.toThrow('EXECUTION_DISABLED')
    expect(op(w.db, 'mail').status).toBe('pending')
  })
})
