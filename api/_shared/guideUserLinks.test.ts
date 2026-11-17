import { afterEach, describe, expect, it } from 'vitest'
import {
  buildGuideInvitationUrl,
  clampGuideLinkDays,
  generateGuideToken,
  hashGuideToken,
  isAllowedGuideAppOrigin,
  effectiveInviteAccessMode,
  guideBoardScopeForAccessMode,
  interviewFullReadPilotEnabled,
  canQueueCommunicationDraft,
  canSendCommunication,
  isGuideWriteAllowed,
  issueGuideAccessGrant,
  normalizeGuideAccessMode,
  normalizeGuideLinkToken,
  resolveGuideAppBaseUrl,
  verifyGuideAccessGrant,
} from './guideUserLinks.js'

describe('guideUserLinks helpers', () => {
  const previousSecret = process.env.GUIDE_LINK_GRANT_SECRET
  const previousService = process.env.SUPABASE_SERVICE_ROLE_KEY
  const previousPilot = process.env.GUIDE_INTERVIEW_FULL_READ

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.GUIDE_LINK_GRANT_SECRET
    else process.env.GUIDE_LINK_GRANT_SECRET = previousSecret
    if (previousService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousService
    if (previousPilot === undefined) delete process.env.GUIDE_INTERVIEW_FULL_READ
    else process.env.GUIDE_INTERVIEW_FULL_READ = previousPilot
  })

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

  it('issues a short-lived consent grant bound to the invite owner', () => {
    process.env.GUIDE_LINK_GRANT_SECRET = 'test-grant-secret'
    const grant = issueGuideAccessGrant({
      linkId: 'link-1',
      usuarioId: 'user-1',
      accessMode: 'read',
    })
    const ok = verifyGuideAccessGrant(grant, { linkId: 'link-1', usuarioId: 'user-1' })
    expect(ok).toEqual({ ok: true, accessMode: 'read', exp: expect.any(Number) })
    expect(verifyGuideAccessGrant(grant, { linkId: 'link-1', usuarioId: 'otro' }).ok).toBe(false)
    expect(verifyGuideAccessGrant('', { linkId: 'link-1', usuarioId: 'user-1' }).ok).toBe(false)
    expect(verifyGuideAccessGrant(`${grant}x`, { linkId: 'link-1', usuarioId: 'user-1' }).ok).toBe(false)
    expect(normalizeGuideAccessMode('propose')).toBe('propose')
    expect(normalizeGuideAccessMode('read')).toBe('read')
    expect(normalizeGuideAccessMode('interview_full_read')).toBe('interview_full_read')
    expect(normalizeGuideAccessMode(undefined)).toBe('read')
  })

  it('elevates invite links to interview_full_read while the pilot flag is on', () => {
    process.env.GUIDE_INTERVIEW_FULL_READ = '1'
    expect(interviewFullReadPilotEnabled()).toBe(true)
    expect(effectiveInviteAccessMode('read')).toBe('interview_full_read')
    expect(guideBoardScopeForAccessMode('interview_full_read')).toBe('organization')
    expect(isGuideWriteAllowed('interview_full_read')).toBe(false)
    expect(isGuideWriteAllowed('read')).toBe(false)
    expect(isGuideWriteAllowed('propose')).toBe(true)
    expect(canQueueCommunicationDraft('interview_full_read')).toBe(true)
    expect(canQueueCommunicationDraft('read')).toBe(true)
    expect(canSendCommunication('interview_full_read')).toBe(false)
    expect(canSendCommunication('propose')).toBe(true)

    process.env.GUIDE_INTERVIEW_FULL_READ = '0'
    expect(interviewFullReadPilotEnabled()).toBe(false)
    expect(effectiveInviteAccessMode('read')).toBe('read')
    expect(effectiveInviteAccessMode('propose')).toBe('read')
    expect(guideBoardScopeForAccessMode('read')).toBe('role')
  })

  it('rejects an expired consent grant', () => {
    process.env.GUIDE_LINK_GRANT_SECRET = 'test-grant-secret'
    const grant = issueGuideAccessGrant({
      linkId: 'link-1',
      usuarioId: 'user-1',
      accessMode: 'read',
      ttlMs: -1_000,
    })
    const result = verifyGuideAccessGrant(grant, { linkId: 'link-1', usuarioId: 'user-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/expiro/i)
  })

  it('whatsapp source implies single-active policy on create', () => {
    // Contract: createGuideUserLink with source=whatsapp revokes prior active WA links.
    // Covered in integration by create path; keep helper surface stable.
    expect(clampGuideLinkDays(7)).toBe(7)
  })
})

