/** Shared ingress contract for Meta. No routing, AI or sends before durable ACK. */
export type WhatsAppEvent = {
  key: string
  phone: string
  sender: string
  kind: 'message' | 'status'
  payload: Record<string, unknown>
}
export type IngressConfig = {
  appSecret: string
  verifyToken: string
  phoneId: string
  wabaId: string
}
export async function verifyWhatsAppSignature(
  raw: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature ?? '')
  if (!secret || !match) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const bytes = Uint8Array.from(match[1].match(/../g)!, (n) => parseInt(n, 16))
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(raw))
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function normalizeWhatsAppEvents(
  payload: unknown,
  config: Pick<IngressConfig, 'phoneId' | 'wabaId'>
): WhatsAppEvent[] {
  if (
    !record(payload) ||
    payload.object !== 'whatsapp_business_account' ||
    !Array.isArray(payload.entry)
  )
    throw new Error('invalid_payload')
  const events: WhatsAppEvent[] = []
  for (const entry of payload.entry) {
    if (!record(entry) || !Array.isArray(entry.changes))
      throw new Error('invalid_entry')
    if (entry.id !== config.wabaId) throw new Error('wrong_waba')
    for (const change of entry.changes) {
      if (!record(change)) throw new Error('invalid_change')
      if (change.field !== 'messages') continue
      const v = change.value
      if (
        !record(v) ||
        !record(v.metadata) ||
        v.metadata.phone_number_id !== config.phoneId
      )
        throw new Error('wrong_phone')
      for (const field of ['messages', 'statuses'] as const) {
        if (v[field] !== undefined && !Array.isArray(v[field]))
          throw new Error('invalid_events')
        for (const item of (v[field] ?? []) as unknown[]) {
          if (
            !record(item) ||
            typeof item.id !== 'string' ||
            !item.id ||
            item.id.length > 512
          )
            throw new Error('invalid_event_id')
          const kind = field === 'messages' ? 'message' : 'status'
          const sender = kind === 'message' ? item.from : item.recipient_id
          if (typeof sender !== 'string' || !/^\d{10,15}$/.test(sender))
            throw new Error('invalid_sender')
          if (kind === 'message' && typeof item.type !== 'string')
            throw new Error('invalid_message_type')
          if (
            kind === 'message' &&
            item.type === 'text' &&
            (!record(item.text) || typeof item.text.body !== 'string')
          )
            throw new Error('invalid_text')
          if (
            kind === 'status' &&
            (!['sent', 'delivered', 'read', 'failed'].includes(
              String(item.status)
            ) ||
              !/^\d+$/.test(String(item.timestamp)))
          )
            throw new Error('invalid_status')
          const key =
            kind === 'message'
              ? `message:${item.id}`
              : `status:${item.id}:${item.status}:${item.timestamp}`
          events.push({
            key,
            kind,
            phone: config.phoneId,
            sender,
            payload: {
              object: 'whatsapp_business_account',
              entry: [
                {
                  id: entry.id,
                  changes: [
                    {
                      field: 'messages',
                      value: {
                        metadata: { phone_number_id: config.phoneId },
                        [field]: [item],
                      },
                    },
                  ],
                },
              ],
            },
          })
        }
      }
    }
  }
  return events
}
export async function acceptWhatsAppWebhook(
  request: Request,
  config: IngressConfig,
  enqueue: (events: WhatsAppEvent[]) => Promise<void>
): Promise<Response> {
  if (request.method === 'GET') {
    const q = new URL(request.url).searchParams
    return q.get('hub.mode') === 'subscribe' &&
      !!config.verifyToken &&
      q.get('hub.verify_token') === config.verifyToken &&
      q.has('hub.challenge')
      ? new Response(q.get('hub.challenge'), { status: 200 })
      : new Response('forbidden', { status: 403 })
  }
  if (request.method !== 'POST')
    return new Response('method_not_allowed', { status: 405 })
  const missing = [
    !config.appSecret && 'WHATSAPP_APP_SECRET',
    !config.phoneId && 'WHATSAPP_PHONE_NUMBER_ID',
    !config.wabaId && 'WHATSAPP_WABA_ID',
  ].filter(Boolean)
  if (missing.length > 0) {
    console.error(JSON.stringify({ event: 'whatsapp_ingress', stage: 'configuration', missing }))
    return new Response('webhook_not_configured', { status: 503 })
  }
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > 1048576)
    return new Response('payload_too_large', { status: 413 })
  if (
    !(await verifyWhatsAppSignature(
      raw,
      request.headers.get('x-hub-signature-256'),
      config.appSecret
    ))
  )
    return new Response('invalid_signature', { status: 401 })
  let events: WhatsAppEvent[]
  try {
    events = normalizeWhatsAppEvents(JSON.parse(raw), config)
  } catch {
    return new Response('invalid_payload', { status: 400 })
  }
  try {
    await enqueue(events)
  } catch {
    console.error(
      JSON.stringify({
        event: 'whatsapp_ingress',
        stage: 'enqueue',
        result: 'failed',
      })
    )
    return new Response('temporarily_unavailable', { status: 503 })
  }
  console.info(
    JSON.stringify({
      event: 'whatsapp_ingress',
      stage: 'persisted',
      count: events.length,
    })
  )
  return new Response('EVENT_RECEIVED', { status: 200 })
}
