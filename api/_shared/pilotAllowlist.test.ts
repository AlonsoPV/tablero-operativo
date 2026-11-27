import { describe, expect, it } from 'vitest'
import { isInCanonicalPilotAllowlist, parseUuidAllowlist } from './pilotAllowlist.js'

const ALONSO = 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('canonical pilot allowlist', () => {
  it('parses only valid UUIDs', () => {
    expect([...parseUuidAllowlist(`${ALONSO}, *, all, 123`)]).toEqual([ALONSO])
  })

  it('intersects env and DB; empty DB revokes everyone', () => {
    expect(isInCanonicalPilotAllowlist(ALONSO, new Set([ALONSO]), new Set([ALONSO]))).toBe(true)
    expect(isInCanonicalPilotAllowlist(OTHER, new Set([ALONSO]), new Set([ALONSO]))).toBe(false)
    expect(isInCanonicalPilotAllowlist(ALONSO, new Set([ALONSO]), new Set())).toBe(false)
    expect(isInCanonicalPilotAllowlist(ALONSO, new Set([ALONSO]), new Set([OTHER]))).toBe(false)
  })

  it('keeps env-only behavior when DB was not loaded', () => {
    expect(isInCanonicalPilotAllowlist(ALONSO, new Set([ALONSO]), null)).toBe(true)
    expect(isInCanonicalPilotAllowlist(OTHER, new Set([ALONSO]), null)).toBe(false)
    expect(isInCanonicalPilotAllowlist(ALONSO, new Set(), null)).toBe(false)
  })

  it('applies DB as the only lock when env list is absent', () => {
    expect(isInCanonicalPilotAllowlist(ALONSO, null, new Set([ALONSO]))).toBe(true)
    expect(isInCanonicalPilotAllowlist(OTHER, null, new Set([ALONSO]))).toBe(false)
    expect(isInCanonicalPilotAllowlist(ALONSO, null, new Set())).toBe(false)
  })
})
