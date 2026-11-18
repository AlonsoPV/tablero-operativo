/** Compatibility ingress only. Both callback URLs now use the same durable queue and Edge worker. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServiceRoleClient } from './_shared/assistantAuth.js'
import { readStringEnv } from './_shared/http.js'
import { acceptWhatsAppWebhook } from '../src/lib/whatsappIngress.js'

export const config = { api: { bodyParser: false } }
export async function receiveWhatsApp(request: Request): Promise<Response> {
  return acceptWhatsAppWebhook(
    request,
    {
      appSecret: readStringEnv('WHATSAPP_APP_SECRET'),
      verifyToken:
        readStringEnv('WHATSAPP_VERIFY_TOKEN') ||
        readStringEnv('token_de_verificacion'),
      phoneId: readStringEnv('WHATSAPP_PHONE_NUMBER_ID'),
      wabaId:
        readStringEnv('WHATSAPP_WABA_ID') ||
        readStringEnv('WHATSAPP_BUSINESS_ACCOUNT_ID'),
    },
    async (events) => {
      if (!events.length) return
      const { error } = await createServiceRoleClient().rpc(
        'whatsapp_enqueue_inbound',
        { p_events: events }
      )
      if (error) throw new Error('enqueue_failed')
    }
  )
}
export default Object.assign(
  async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const chunks: Buffer[] = []
      const supplied = (req as IncomingMessage & { body?: unknown }).body
      // A parsed object cannot reproduce the signed bytes. Never JSON.stringify it.
      if (
        supplied !== undefined &&
        !Buffer.isBuffer(supplied) &&
        typeof supplied !== 'string'
      ) {
        res.statusCode = 500
        res.end('raw_body_required')
        return
      }
      if (supplied !== undefined) chunks.push(Buffer.from(supplied as string))
      else
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk))
          if (chunks.reduce((n, b) => n + b.length, 0) > 1048576) {
            res.statusCode = 413
            res.end()
            return
          }
        }
      const headers = new Headers()
      for (const [key, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(key, v)
      }
      const method = req.method || 'GET'
      const response = await receiveWhatsApp(
        new Request(new URL(req.url || '/', 'https://localhost'), {
          method,
          headers,
          ...(method === 'POST'
            ? { body: Buffer.concat(chunks).toString('utf8') }
            : {}),
        })
      )
      res.statusCode = response.status
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(await response.text())
    } catch {
      res.statusCode = 503
      res.end('temporarily_unavailable')
    }
  },
  { fetch: receiveWhatsApp }
)
