import { describe, expect, it, vi } from 'vitest'
import { analystCanSeeAction, dispatchCopilotTool, confirmPendingOp } from './assistantOpsRuntime.js'

function executiveFixture() {
  const actionUpdate = vi.fn()
  const rpc = vi.fn(async () => ({ data: false, error: null }))
  const from = (table: string) => {
    const data = table === 'acciones_diarias'
      ? { id: 'foreign', responsable: 'peer', created_by: 'peer', estado: 'Pendiente' }
      : { id: 'proposal', usuario_id: 'executive', tool: 'update_action', status: 'pending',
          expires_at: '2999-01-01', payload: { action_id: 'foreign', patch: { descripcion_accion: 'Change' } } }
    const result = { data, error: null }
    const chain = {
      select: () => chain,
      eq: () => chain,
      gt: () => chain,
      insert: () => chain,
      update: (value: unknown) => { if (table === 'acciones_diarias') actionUpdate(value); return chain },
      maybeSingle: async () => result,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return chain
  }
  return {
    actor: { supabase: { from, rpc } as never, usuarioId: 'executive', authUserId: 'auth', rol: 'Direccion' },
    rpc, actionUpdate,
  }
}

it('rejects executive edits when the existing SQL permission predicate denies the action', async () => {
  const test = executiveFixture()
  const result = await dispatchCopilotTool(test.actor, 'update_action', {
    action_id: 'foreign', descripcion_accion: 'Change',
  })
  expect(result.kind).toBe('denied')
  expect(test.rpc).toHaveBeenCalledWith('can_edit_accion_general_as', {
    p_accion_id: 'foreign', p_usuario_id: 'executive',
  })
  expect(test.actionUpdate).not.toHaveBeenCalled()
})

it('revalidates authorization at confirmation before an executive update is executed', async () => {
  const test = executiveFixture()
  await expect(confirmPendingOp(test.actor, 'proposal')).rejects.toThrow('PERMISSION_DENIED')
  expect(test.actionUpdate).not.toHaveBeenCalled()
})

describe('analyst action scope', () => {
  const fixtures = {
    actor: '00000000-0000-0000-0000-000000000001',
    peer: '00000000-0000-0000-0000-000000000002',
    otherProjectActor: '00000000-0000-0000-0000-000000000003',
  }

  it.each([
    ['own action', fixtures.actor, true],
    ['peer action', fixtures.peer, false],
    ['foreign fixture owner', fixtures.otherProjectActor, false],
  ])('isolates analyst reads for %s without an organization override', (_label, responsable, expected) => {
    expect(analystCanSeeAction('Analista', fixtures.actor, { responsable })).toBe(expected)
  })

  it('hides an action whose owner is someone else', () => {
    expect(analystCanSeeAction('Analista', 'me', { responsable: 'otra-persona' })).toBe(false)
    expect(analystCanSeeAction('Analista', 'me', { responsable: 'me' })).toBe(true)
    expect(analystCanSeeAction('Analista', '', { responsable: 'me' })).toBe(false)
  })

  it('keeps the board view for every other role', () => {
    expect(analystCanSeeAction('Director', 'me', { responsable: 'otra-persona' })).toBe(true)
    expect(analystCanSeeAction(null, 'me', { responsable: 'otra-persona' })).toBe(true)
  })

  it('lets interview_full_read see any action regardless of analyst role', () => {
    expect(analystCanSeeAction('Analista', 'me', { responsable: 'otra-persona' }, 'organization')).toBe(true)
  })
})
