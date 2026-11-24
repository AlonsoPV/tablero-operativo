import { describe, expect, it } from 'vitest'
import { createR4AccessTokenIssuer } from './sessionCredentials.js'
import { R4_PILOT_ACCESS_TOKEN_TTL_MS } from './pilotEnv.js'

describe('R4 short-lived session tokens (IMPLEMENTED LOCAL)', () => {
  const allowed = {
    sessionId: 's1',
    linkId: 'L1',
    authenticated: true,
    consented: true,
    occupancyClaimed: true,
    authorizedOwner: true,
    nowMs: 1_000,
  }

  it('exige auth, consentimiento, occupancy y dueno antes de emitir', () => {
    const issuer = createR4AccessTokenIssuer({ nowMs: () => 1_000 })
    expect(issuer.issue({ ...allowed, authenticated: false })).toEqual({
      ok: false,
      code: 'unauthenticated',
    })
    expect(issuer.issue({ ...allowed, consented: false })).toEqual({
      ok: false,
      code: 'consent_required',
    })
    expect(issuer.issue({ ...allowed, occupancyClaimed: false })).toEqual({
      ok: false,
      code: 'session_occupied',
    })
    expect(issuer.issue({ ...allowed, authorizedOwner: false })).toEqual({
      ok: false,
      code: 'foreign_session',
    })
  })

  it('emite TTL corto y rechaza reutilizacion y caducidad', () => {
    const issuer = createR4AccessTokenIssuer({ nowMs: () => 1_000 })
    const first = issuer.issue(allowed)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.token.ttlMs).toBe(R4_PILOT_ACCESS_TOKEN_TTL_MS)
    expect(issuer.consume(first.token.tokenId, 1_001)).toMatchObject({ ok: true })
    expect(issuer.consume(first.token.tokenId, 1_002)).toEqual({ ok: false, code: 'reused' })

    const second = issuer.issue({ ...allowed, nowMs: 2_000 })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(issuer.consume(second.token.tokenId, 2_000 + R4_PILOT_ACCESS_TOKEN_TTL_MS)).toEqual({
      ok: false,
      code: 'expired',
    })
    expect(issuer.consume('missing')).toEqual({ ok: false, code: 'unknown_token' })
  })
})
