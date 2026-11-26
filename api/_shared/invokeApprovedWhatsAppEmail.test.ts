import { afterEach, describe, expect, it, vi } from 'vitest'
import { invokeApprovedWhatsAppEmail } from './invokeNotificationEmail.js'
import { matchesInternalAuthorization } from '../../supabase/functions/send-notification-email/approvedWhatsAppEmail.ts'

const SECRET = 'a'.repeat(40)

describe('invokeApprovedWhatsAppEmail (dedicated delegation secret)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('sends the dedicated secret, never the service role key', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-should-not-be-sent')
    vi.stubEnv('INTERNAL_EMAIL_DELEGATION_SECRET', SECRET)
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, provider: 'gmail', email_id: 'm1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await invokeApprovedWhatsAppEmail('11111111-2222-4333-8444-555555555555')

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe('https://example.supabase.co/functions/v1/send-notification-email')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`)
    expect(headers.apikey).toBe('anon-key')
    expect(JSON.stringify(headers)).not.toContain('service-role-key-should-not-be-sent')
    expect(JSON.parse(String(init.body))).toEqual({ assistant_pending_op_id: '11111111-2222-4333-8444-555555555555' })
  })

  it('fails closed without calling the network when the secret is missing or too short', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
    vi.stubEnv('INTERNAL_EMAIL_DELEGATION_SECRET', 'short')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(invokeApprovedWhatsAppEmail('11111111-2222-4333-8444-555555555555')).rejects.toThrow(/CONFIGURATION_ERROR/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('matchesInternalAuthorization (edge delegation gate)', () => {
  it('accepts only the exact dedicated secret as Bearer', async () => {
    expect(await matchesInternalAuthorization(`Bearer ${SECRET}`, SECRET)).toBe(true)
  })

  it('rejects a wrong secret, the service role key, a missing header and a missing secret', async () => {
    expect(await matchesInternalAuthorization(`Bearer ${'b'.repeat(40)}`, SECRET)).toBe(false)
    expect(await matchesInternalAuthorization('Bearer service-role-key', SECRET)).toBe(false)
    expect(await matchesInternalAuthorization(null, SECRET)).toBe(false)
    expect(await matchesInternalAuthorization(`Bearer ${SECRET}`, undefined)).toBe(false)
  })
})
