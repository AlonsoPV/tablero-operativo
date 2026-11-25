import { createHmac } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, it, expect, vi, beforeEach } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('./assistantAuth.js', () => ({
  createServiceRoleClient: () => ({ rpc }),
}))
vi.mock('./http.js', () => ({
  readStringEnv: (key: string) =>
    ({
      WHATSAPP_APP_SECRET: 'secret',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      WHATSAPP_PHONE_NUMBER_ID: 'phone',
      WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba',
    })[key] || '',
}))
import handler from '../whatsapp-webhook'
const body = JSON.stringify(
  {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'phone' },
              messages: [
                {
                  id: 'in',
                  from: '15550002222',
                  type: 'text',
                  text: { body: 'Hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  },
  null,
  2
)
beforeEach(() => rpc.mockReset().mockResolvedValue({ error: null }))
describe('Vercel deployed webhook adapter', () => {
  it('retains signature from incoming raw stream', async () => {
    const req = Readable.from([Buffer.from(body)]) as any
    req.method = 'POST'
    req.url = '/api/whatsapp-webhook'
    req.headers = {
      'x-hub-signature-256':
        'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex'),
    }
    const res: any = { setHeader: vi.fn(), end: vi.fn() }
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'whatsapp_enqueue_inbound',
      expect.anything()
    )
  })
  it('rejects parsed body objects instead of forging original bytes', async () => {
    const req: any = { method: 'POST', headers: {}, body: JSON.parse(body) }
    const res: any = { setHeader: vi.fn(), end: vi.fn() }
    await handler(req, res)
    expect(res.statusCode).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('returns 503 on storage error so Meta can retry', async () => {
    rpc.mockResolvedValue({ error: { code: 'XX000' } })
    const r = await handler.fetch(
      new Request('https://app.test/api/whatsapp-webhook', {
        method: 'POST',
        body,
        headers: {
          'x-hub-signature-256':
            'sha256=' +
            createHmac('sha256', 'secret').update(body).digest('hex'),
        },
      })
    )
    expect(r.status).toBe(503)
  })
})
