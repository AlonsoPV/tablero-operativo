/**
 * Unit tests for Meta webhook HMAC helpers (logic mirrored for Node vitest).
 * The Edge function uses the same algorithm with Web Crypto.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { describe, expect, it } from 'vitest'

function verifyMetaSignatureNode(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!appSecret) return false
  const provided = (signatureHeader ?? '').trim()
  const match = /^sha256=([a-fA-F0-9]{64})$/.exec(provided)
  if (!match) return false
  const digest = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(digest, 'hex')
  const b = Buffer.from(match[1].toLowerCase(), 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

describe('whatsapp webhook Meta HMAC', () => {
  const secret = 'test_app_secret_123'
  const body = '{"object":"whatsapp_business_account","entry":[]}'

  it('accepts a valid sha256 signature', () => {
    const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    expect(verifyMetaSignatureNode(body, `sha256=${hex}`, secret)).toBe(true)
  })

  it('rejects missing or malformed headers', () => {
    expect(verifyMetaSignatureNode(body, null, secret)).toBe(false)
    expect(verifyMetaSignatureNode(body, 'sha1=deadbeef', secret)).toBe(false)
    expect(verifyMetaSignatureNode(body, 'sha256=abc', secret)).toBe(false)
  })

  it('rejects wrong secret or tampered body', () => {
    const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    expect(verifyMetaSignatureNode(body, `sha256=${hex}`, 'other_secret')).toBe(false)
    expect(verifyMetaSignatureNode(body + ' ', `sha256=${hex}`, secret)).toBe(false)
  })

  it('fails closed without app secret', () => {
    const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    expect(verifyMetaSignatureNode(body, `sha256=${hex}`, '')).toBe(false)
  })
})
