import { describe, expect, it } from 'vitest'
import {
  clockPhaseOf,
  clockStateFromSession,
  remainingSecondsUntil,
  sessionIdFromRetellBody,
} from './guideSessionClock.js'

describe('guide session clock', () => {
  it('maps remaining seconds to conversation, closing and final_close', () => {
    expect(clockPhaseOf(400, 'active')).toBe('conversation')
    expect(clockPhaseOf(180, 'active')).toBe('closing')
    expect(clockPhaseOf(61, 'active')).toBe('closing')
    expect(clockPhaseOf(60, 'active')).toBe('final_close')
    expect(clockPhaseOf(0, 'active')).toBe('final_close')
    expect(clockPhaseOf(400, 'completed')).toBe('final_close')
  })

  it('never 404s: missing session is conversation with found false', () => {
    const state = clockStateFromSession(null)
    expect(state.found).toBe(false)
    expect(state.phase).toBe('conversation')
    expect(state.must_close).toBe(false)
    expect(state.remaining_seconds).toBe(900)
  })

  it('counts remaining against expires_at', () => {
    const now = Date.parse('2026-11-15T06:00:00.000Z')
    const remaining = remainingSecondsUntil('2026-11-15T06:10:00.000Z', now)
    expect(remaining).toBe(600)
    const closed = clockStateFromSession(
      { status: 'active', expires_at: '2026-11-15T06:00:30.000Z' },
      now
    )
    expect(closed.phase).toBe('final_close')
    expect(closed.must_close).toBe(true)
    expect(closed.remaining_seconds).toBe(30)
  })

  it('reads session_id from args string, metadata or dynamic variables', () => {
    expect(
      sessionIdFromRetellBody({
        args: JSON.stringify({ session_id: 'from-args' }),
      })
    ).toBe('from-args')
    expect(
      sessionIdFromRetellBody({
        call: { metadata: { guide_session_id: 'from-meta' } },
      })
    ).toBe('from-meta')
    expect(
      sessionIdFromRetellBody({
        call: { retell_llm_dynamic_variables: { session_id: 'from-dyn' } },
      })
    ).toBe('from-dyn')
  })
})
