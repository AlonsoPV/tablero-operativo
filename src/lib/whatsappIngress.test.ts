import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import {
  acceptWhatsAppWebhook,
  normalizeWhatsAppEvents,
  verifyWhatsAppSignature,
} from './whatsappIngress'
import { whatsappCommand } from './whatsappCommands'
const config = {
  appSecret: 'test-secret',
  verifyToken: 'verify-test',
  phoneId: 'phone-test',
  wabaId: 'waba-test',
}
const fixture = JSON.parse(
  readFileSync('tests/fixtures/whatsapp/text.json', 'utf8').replace(
    /^\uFEFF/,
    ''
  )
)
function payload(message: Record<string, unknown>) {
  const p = structuredClone(fixture)
  p.entry[0].changes[0].value.messages = [message]
  return p
}
const msg = fixture.entry[0].changes[0].value.messages[0]
function signed(body: string, signature?: string) {
  return new Request('https://example.test/webhook', {
    method: 'POST',
    body,
    headers: {
      'x-hub-signature-256':
        signature ??
        'sha256=' +
          createHmac('sha256', config.appSecret).update(body).digest('hex'),
    },
  })
}
describe('production WhatsApp ingress', () => {
  it('echoes GET challenge only for the configured token', async () => {
    expect(
      await (
        await acceptWhatsAppWebhook(
          new Request(
            'https://x.test/?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123'
          ),
          config,
          vi.fn()
        )
      ).text()
    ).toBe('123')
    expect(
      (
        await acceptWhatsAppWebhook(
          new Request(
            'https://x.test/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'
          ),
          config,
          vi.fn()
        )
      ).status
    ).toBe(403)
  })
  it('persists signed POST before ACK and accepts whitespace without reserializing', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const r = await acceptWhatsAppWebhook(
      signed(JSON.stringify(fixture, null, 2)),
      config,
      save
    )
    expect(r.status).toBe(200)
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'message', key: 'message:wamid.test' }),
    ])
  })
  it('returns retryable 503 on database failure', async () => {
    expect(
      (
        await acceptWhatsAppWebhook(
          signed(JSON.stringify(fixture)),
          config,
          vi.fn().mockRejectedValue(new Error('db'))
        )
      ).status
    ).toBe(503)
  })
  it('rejects invalid or missing signature without touching database', async () => {
    const save = vi.fn()
    expect(
      (
        await acceptWhatsAppWebhook(
          signed(JSON.stringify(fixture), 'sha256=' + '0'.repeat(64)),
          config,
          save
        )
      ).status
    ).toBe(401)
    expect(save).not.toHaveBeenCalled()
    expect(await verifyWhatsAppSignature('{}', null, config.appSecret)).toBe(
      false
    )
  })
  it('fails closed without secret or scope', async () => {
    expect(
      (
        await acceptWhatsAppWebhook(
          signed('{}'),
          { ...config, appSecret: '' },
          vi.fn()
        )
      ).status
    ).toBe(503)
    expect(
      await verifyWhatsAppSignature('{}', 'sha256=' + '0'.repeat(64), '')
    ).toBe(false)
  })
  it('rejects malformed JSON and another WABA/phone', async () => {
    expect(
      (await acceptWhatsAppWebhook(signed('{'), config, vi.fn())).status
    ).toBe(400)
    const p = structuredClone(fixture)
    p.entry[0].id = 'another-org'
    expect(() => normalizeWhatsAppEvents(p, config)).toThrow('wrong_waba')
    p.entry[0].id = config.wabaId
    p.entry[0].changes[0].value.metadata.phone_number_id = 'other'
    expect(() => normalizeWhatsAppEvents(p, config)).toThrow('wrong_phone')
  })
  it('separates statuses from inbound messages', () => {
    const p = structuredClone(fixture)
    delete p.entry[0].changes[0].value.messages
    p.entry[0].changes[0].value.statuses = [
      {
        id: 'wamid.out',
        recipient_id: '15550002222',
        timestamp: '1794931200',
        status: 'delivered',
      },
    ]
    const events = normalizeWhatsAppEvents(p, config)
    expect(events[0].kind).toBe('status')
    expect(events[0].key).toContain('status:wamid.out:delivered')
  })
  it.each([
    { type: 'text', text: { body: 'Mis acciones' } },
    {
      type: 'button',
      button: { payload: 'wa:mine', text: 'Consultar acciones' },
    },
    {
      type: 'interactive',
      interactive: {
        button_reply: {
          id: 'act:00000000-0000-0000-0000-000000000001:done',
          title: 'Realizada',
        },
      },
    },
    {
      type: 'interactive',
      interactive: {
        list_reply: {
          id: 'wa:select:00000000-0000-0000-0000-000000000001',
          title: 'Acción',
        },
      },
    },
    { type: 'sticker', sticker: { id: 'media' } },
    {
      type: 'text',
      context: { id: 'wamid.reminder' },
      text: { body: 'Realizada' },
    },
  ])(
    'normalizes $type without losing identifiers or reply context',
    (event) => {
      const p = payload({ ...msg, ...event })
      const [e] = normalizeWhatsAppEvents(p, config)
      expect(JSON.stringify(e.payload)).toContain(
        JSON.stringify({ ...msg, ...event })
      )
      expect(e.sender).toBe(msg.from)
    }
  )
  it('rejects invalid sender and malformed text', () => {
    expect(() =>
      normalizeWhatsAppEvents(payload({ ...msg, from: 'bad' }), config)
    ).toThrow()
    expect(() =>
      normalizeWhatsAppEvents(payload({ ...msg, text: null }), config)
    ).toThrow()
  })
  it.each([
    ['Hola', 'help'],
    ['Ayuda', 'help'],
    ['Mis acciones', 'mine'],
    ['Pendientes', 'mine'],
    ['Vencidas', 'overdue'],
    ['Acciones que asigné', 'assigned'],
    ['Consultar acciones', 'mine'],
    ['Actualizar acciones', 'update'],
    ['wa:mine', 'mine'],
    ['Cancelar', 'cancel'],
  ])('handles %s without LLM', (text, expected) =>
    expect(whatsappCommand(text)).toBe(expected)
  )
  it('does not rewrite a query about another person into own actions', () =>
    expect(whatsappCommand('¿Cuáles tiene Jorge?')).toBeNull())
})
