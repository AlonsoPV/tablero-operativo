import { describe, expect, it } from 'vitest'
import { resolveActor, type AgentActor } from '../query/resolveActor.js'
import {
  ACTION_CONTRACTS,
  buildIdempotencyKey,
  confirmActionR1,
  proposeAction,
  R1_EXECUTION_ENABLED,
} from './contracts.js'
import { createActionSimulator } from './simulator.js'

function actor(rol: string, usuarioId = 'u-lead'): AgentActor {
  return resolveActor(
    { supabase: {} as never, authUserId: `a-${usuarioId}`, usuarioId, rol, active: true },
    { channel: 'web', sessionId: 's' }
  )
}

const payload = { titulo: 'Resolver bloqueo de proveedor', responsableId: 'u-maria', fecha: '2026-11-24' }

describe('contratos de acciones (R2 preparado)', () => {
  it('la ejecución real está deshabilitada en R1', () => {
    expect(R1_EXECUTION_ENABLED).toBe(false)
    expect(confirmActionR1().status).toBe('not_enabled')
  })

  it('cada contrato declara herramienta de ejecución, campos y precondiciones', () => {
    for (const contract of Object.values(ACTION_CONTRACTS)) {
      expect(contract.executesVia).toBeTruthy()
      expect(contract.requiredFields.length).toBeGreaterThan(0)
      expect(contract.preconditions.length).toBeGreaterThan(0)
    }
  })

  it('valida campos faltantes sin lanzar', () => {
    expect(ACTION_CONTRACTS.create_action.validate({ titulo: 'x', responsableId: null, fecha: null })).toEqual(['titulo', 'responsable', 'fecha'])
    expect(ACTION_CONTRACTS.register_blocker.validate({ accionId: 'a1', motivo: '' })).toEqual(['motivo'])
  })

  it('la clave de idempotencia es estable e independiente del orden de campos', () => {
    const a = buildIdempotencyKey('u1', 'create_action', payload)
    const b = buildIdempotencyKey('u1', 'create_action', { fecha: payload.fecha, responsableId: payload.responsableId, titulo: payload.titulo })
    expect(a).toBe(b)
    expect(buildIdempotencyKey('u2', 'create_action', payload)).not.toBe(a)
  })

  it('Dirección y Analista no pueden proponer', () => {
    expect(proposeAction(actor('Direccion'), 'create_action', payload).ok).toBe(false)
    expect(proposeAction(actor('Analista'), 'create_action', payload).ok).toBe(false)
  })
})

describe('simulador propose → confirm → execute', () => {
  it('ejecuta una vez y responde duplicate al reintentar', async () => {
    const sim = createActionSimulator()
    const p = sim.propose(actor('Lider'), 'create_action', payload)
    if (!p.ok) throw new Error('expected proposal')
    expect(await sim.confirm(p.proposal.id, actor('Lider'))).toMatchObject({ status: 'executed' })
    expect(await sim.confirm(p.proposal.id, actor('Lider'))).toMatchObject({ status: 'duplicate' })
    expect(sim.effects).toHaveLength(1)
    expect(sim.audit.map((e) => e.result)).toEqual(['proposed', 'executed', 'duplicate'])
  })

  it('confirmación concurrente produce un solo efecto', async () => {
    const sim = createActionSimulator({ effectDelayMs: 5 })
    const p = sim.propose(actor('Lider'), 'create_action', payload)
    if (!p.ok) throw new Error('expected proposal')
    const results = await Promise.all([sim.confirm(p.proposal.id, actor('Lider')), sim.confirm(p.proposal.id, actor('Lider'))])
    expect(results.map((r) => r.status).sort()).toEqual(['executed', 'in_progress'])
    expect(sim.effects).toHaveLength(1)
  })

  it('rechaza confirmación de otro usuario y revalida el rol al confirmar', async () => {
    const sim = createActionSimulator()
    const p = sim.propose(actor('Lider'), 'create_action', payload)
    if (!p.ok) throw new Error('expected proposal')
    expect(await sim.confirm(p.proposal.id, actor('Lider', 'u-other'))).toMatchObject({ status: 'denied' })
    expect(await sim.confirm(p.proposal.id, actor('Direccion'))).toMatchObject({ status: 'denied' })
    expect(sim.effects).toHaveLength(0)
  })

  it('expira a los 10 minutos y no ejecuta propuestas incompletas', async () => {
    let t = Date.parse('2026-11-19T16:00:00Z')
    const sim = createActionSimulator({ now: () => t })
    const p = sim.propose(actor('Lider'), 'create_action', payload)
    const incomplete = sim.propose(actor('Lider'), 'create_action', { titulo: 'Sin datos', responsableId: null, fecha: null })
    if (!p.ok || !incomplete.ok) throw new Error('expected proposals')
    expect(await sim.confirm(incomplete.proposal.id, actor('Lider'))).toMatchObject({ status: 'invalid' })
    t += 11 * 60 * 1000
    expect(await sim.confirm(p.proposal.id, actor('Lider'))).toEqual({ status: 'expired' })
    expect(sim.effects).toHaveLength(0)
  })
})
