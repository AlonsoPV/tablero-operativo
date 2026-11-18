import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyWhatsAppSignature } from '../../src/lib/whatsappIngress'
describe('Meta HMAC production validator', () => {
  const body = '{ "object": "whatsapp_business_account", "entry": [] }',
    secret = 'test-only'
  const signature =
    'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  it('validates exact bytes', async () =>
    expect(await verifyWhatsAppSignature(body, signature, secret)).toBe(true))
  it('rejects reserialized or tampered input', async () =>
    expect(
      await verifyWhatsAppSignature(
        JSON.stringify(JSON.parse(body)),
        signature,
        secret
      )
    ).toBe(false))
  it('rejects missing signature', async () =>
    expect(await verifyWhatsAppSignature(body, null, secret)).toBe(false))
  it('fails closed without secret', async () =>
    expect(await verifyWhatsAppSignature(body, signature, '')).toBe(false))
})
