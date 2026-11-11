import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VercelRequestLike } from './http.js'

type RoutedHandler = {
  (req: VercelRequestLike | Request, serverRes?: ServerResponse): Promise<unknown>
  fetch: (request: Request) => Promise<Response>
}

function isWebRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request
}

/** Despacha a un handler existente (defineApiHandler) según op. */
export function defineOpRouter(
  resolveOp: (req: { url?: string }) => string,
  routes: Record<string, RoutedHandler>,
  notFoundMessage = 'Operacion desconocida.'
): RoutedHandler {
  const run = async (req: VercelRequestLike | Request, serverRes?: ServerResponse) => {
    const url = isWebRequest(req) ? req.url : req.url
    const op = resolveOp({ url })
    const target = routes[op]
    if (!target) {
      if (isWebRequest(req)) {
        return new Response(JSON.stringify({ error: `${notFoundMessage} (${op || 'vacia'})` }), {
          status: 404,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        })
      }
      if (serverRes && typeof serverRes.end === 'function') {
        serverRes.statusCode = 404
        serverRes.setHeader('Content-Type', 'application/json; charset=utf-8')
        serverRes.end(JSON.stringify({ error: `${notFoundMessage} (${op || 'vacia'})` }))
        return
      }
      return new Response(JSON.stringify({ error: `${notFoundMessage} (${op || 'vacia'})` }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }
    return target(req as VercelRequestLike | Request, serverRes)
  }

  const handler = run as RoutedHandler
  handler.fetch = async (request: Request) => {
    const op = resolveOp({ url: request.url })
    const target = routes[op]
    if (!target) {
      return new Response(JSON.stringify({ error: `${notFoundMessage} (${op || 'vacia'})` }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }
    return target.fetch(request)
  }
  return handler
}

export type { IncomingMessage }
