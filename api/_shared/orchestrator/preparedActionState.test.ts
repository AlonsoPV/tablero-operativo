import { describe, expect, it } from 'vitest'
import type { AgentActor } from '../query/resolveActor.js'
import { emptyStructuredDraft } from './structuredActionDraft.js'
import { readPreparedActionState, formatPreparedActionState } from './preparedActionState.js'
const id = '41ed066e-b231-578a-a976-ceda3f262053'
function actor(row: unknown, error: unknown = null) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error }) }
  return { usuarioId: 'owner', channel: 'whatsapp', copilot: { supabase: { from: () => q } } } as unknown as AgentActor
}
const base = { id, usuario_id: 'owner', channel: 'whatsapp', tool: 'agent_create_action', status: 'confirmed', result: { id } }
describe('prepared action lifecycle read', () => {
  it('reads confirmation of the bound operation without executing anything', async () => {
    expect(await readPreparedActionState(actor(base), id)).toEqual({ status: 'confirmed', actionId: id })
  })
  it.each([{ ...base, usuario_id: 'other' }, { ...base, channel: 'web' }, { ...base, id: 'other' }, { ...base, tool: 'whatsapp_prepare_send' }])('rejects an unrelated operation', async row => {
    expect(await readPreparedActionState(actor(row), id)).toEqual({ status: 'unknown' })
  })
  it('never infers execution from an unbound legacy draft or failed read', async () => {
    expect(await readPreparedActionState(actor(base))).toEqual({ status: 'unknown' })
    expect(await readPreparedActionState(actor(base, new Error('unavailable')), id)).toEqual({ status: 'unknown' })
  })
  it('recognizes expiration instead of offering an obsolete approval', async () => {
    expect(await readPreparedActionState(actor({ ...base, status: 'pending', expires_at: '2020-01-01T00:00:00Z' }), id)).toEqual({ status: 'expired' })
  })
  it('does not render confirmed or unknown snapshots as ready to confirm', () => {
    const draft = { ...emptyStructuredDraft(), titulo: 'QA P0: revisar inventario' }
    const confirmed = formatPreparedActionState(draft, { status: 'confirmed', actionId: id })
    expect(confirmed).toContain('/kanban?accion=' + id)
    expect(confirmed).not.toContain('Propuesta lista')
    expect(confirmed).toContain('ya fue confirmada')
    const legacy = formatPreparedActionState(draft, { status: 'unknown' })
    expect(legacy).toContain('No pude verificar')
    expect(legacy).not.toContain('Propuesta lista')
  })
})
