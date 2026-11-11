import { afterEach, describe, expect, it } from 'vitest'

describe('google user token encryption', () => {
  afterEach(() => {
    delete process.env.GOOGLE_TOKEN_ENC_KEY
  })

  it('roundtrips a refresh token', async () => {
    process.env.GOOGLE_TOKEN_ENC_KEY = 'ab'.repeat(32)
    const { encryptSecret, decryptSecret } = await import('./googleUserClient.js')
    const packed = encryptSecret('refresh-token-value')
    expect(packed).not.toContain('refresh-token-value')
    expect(decryptSecret(packed)).toBe('refresh-token-value')
  })
})
