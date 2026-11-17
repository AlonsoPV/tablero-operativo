import { describe, expect, it } from 'vitest'
import { evaluatePendingTransition } from './matching'
import { isCopilotWriteTool } from './catalog'
import { COPILOT_WRITE_TOOLS } from './types'

describe('pending op confirm idempotency', () => {
  it('treats a confirmed op as already_done (stable duplicate confirm)', () => {
    const again = evaluatePendingTransition({
      status: 'confirmed',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    expect(again).toEqual({ ok: false, reason: 'already_done' })
  })

  it('allows confirm only while pending/executing and not expired', () => {
    expect(
      evaluatePendingTransition({
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
      })
    ).toEqual({ ok: true, next: 'executing' })
    expect(
      evaluatePendingTransition({
        status: 'pending',
        expiresAt: '2000-01-01T00:00:00.000Z',
        nowMs: Date.parse('2026-11-16T00:00:00.000Z'),
      })
    ).toEqual({ ok: false, reason: 'expired' })
    expect(
      evaluatePendingTransition({
        status: 'cancelled',
        expiresAt: '2099-01-01T00:00:00.000Z',
      })
    ).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('registers confirm_pending_op and cancel_pending_op as write tools', () => {
    expect(isCopilotWriteTool('confirm_pending_op')).toBe(true)
    expect(isCopilotWriteTool('cancel_pending_op')).toBe(true)
    expect(COPILOT_WRITE_TOOLS).toEqual(
      expect.arrayContaining(['confirm_pending_op', 'cancel_pending_op', 'create_action'])
    )
  })
})
