import { describe, expect, it } from 'vitest'
import {
  buildGuideInvitationUrl,
  clampGuideLinkDays,
  generateGuideToken,
  hashGuideToken,
} from './guideUserLinks.js'

describe('guideUserLinks helpers', () => {
  it('hashes tokens stably', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'
    expect(hashGuideToken(token)).toBe(hashGuideToken(token))
    expect(hashGuideToken(token)).not.toBe(hashGuideToken(`${token}x`))
  })

  it('clamps expiry days', () => {
    expect(clampGuideLinkDays(undefined)).toBe(30)
    expect(clampGuideLinkDays(0)).toBe(1)
    expect(clampGuideLinkDays(120)).toBe(90)
    expect(clampGuideLinkDays(14)).toBe(14)
  })

  it('builds invitation urls', () => {
    const token = generateGuideToken()
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(buildGuideInvitationUrl(token)).toContain(`/guia/invitacion/${encodeURIComponent(token)}`)
  })
})
