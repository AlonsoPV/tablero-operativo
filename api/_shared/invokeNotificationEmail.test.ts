import { afterEach, describe, expect, it, vi } from 'vitest'
import { invokeNotificationEmail } from './invokeNotificationEmail.js'

describe('invokeNotificationEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('posts to send-notification-email with auth headers', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key')
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ ok: true, provider: 'gmail', email_id: 'm1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await invokeNotificationEmail('user-jwt', {
      usuario_id: 'u-2',
      tipo: 'responsable',
      prioridad: 'Normal',
      reply_to_caller: true,
      payload: { accion_id: 'a1', titulo: 'Te compartieron una accion' },
    })

    expect(result).toEqual({ ok: true, provider: 'gmail', email_id: 'm1' })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://example.supabase.co/functions/v1/send-notification-email')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer user-jwt')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      usuario_id: 'u-2',
      tipo: 'responsable',
      prioridad: 'Normal',
      reply_to_caller: true,
    })
  })

  it('throws when the edge function returns an error body', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, reason: 'forbidden', message: 'Sin permiso' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )

    await expect(
      invokeNotificationEmail('jwt', {
        usuario_id: 'u-2',
        tipo: 'responsable',
      })
    ).rejects.toThrow(/Sin permiso|forbidden/)
  })
})
