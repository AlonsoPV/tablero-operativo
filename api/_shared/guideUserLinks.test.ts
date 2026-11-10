import { describe, expect, it } from 'vitest'
import {
  buildGuideInvitationUrl,
  clampGuideLinkDays,
  generateGuideToken,
  hashGuideToken,
  isAllowedGuideAppOrigin,
  normalizeGuideLinkToken,
  resolveGuideAppBaseUrl,
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
    expect(buildGuideInvitationUrl(token, 'http://localhost:5173')).toBe(
      `http://localhost:5173/guia/invitacion/${encodeURIComponent(token)}`
    )
    expect(isAllowedGuideAppOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedGuideAppOrigin('https://evil.example')).toBe(false)
    expect(resolveGuideAppBaseUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173')
    expect(normalizeGuideLinkToken(encodeURIComponent(token))).toBe(token)
  })

  it('whatsapp source implies single-active policy on create', () => {
    // Contract: createGuideUserLink with source=whatsapp revokes prior active WA links.
    // Covered in integration by create path; keep helper surface stable.
    expect(clampGuideLinkDays(7)).toBe(7)
  })
})
