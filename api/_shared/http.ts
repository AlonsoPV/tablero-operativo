import type { IncomingMessage, ServerResponse } from 'node:http'

export type VercelRequestLike = IncomingMessage & {
  body?: unknown
  method?: string
}

export type JsonResponse = {
  status(code: number): JsonResponse
  json(payload: unknown): void
}

type ApiHandlerFn = (req: VercelRequestLike, res: JsonResponse) => Promise<unknown>

type ApiHandler = {
  (req: VercelRequestLike | Request, serverRes?: ServerResponse): Promise<unknown>
  fetch: (request: Request) => Promise<Response>
}

function isWebRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request
}

function webHeadersToNode(request: Request): IncomingMessage['headers'] {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return headers
}

async function webToNodeRequest(request: Request): Promise<VercelRequestLike> {
  let body: unknown
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const text = await request.text()
    if (!text.trim()) {
      body = {}
    } else {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
  }

  return {
    method: request.method,
    headers: webHeadersToNode(request),
    url: request.url,
    body,
  } as VercelRequestLike
}

export function asJsonResponse(res: ServerResponse | null | undefined): JsonResponse {
  return {
    status(code: number) {
      if (res) res.statusCode = code
      return this
    },
    json(payload: unknown) {
      if (!res || typeof res.end !== 'function') {
        console.error('asJsonResponse: missing ServerResponse')
        return
      }
      try {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
        }
        res.end(JSON.stringify(payload))
      } catch (error) {
        console.error('asJsonResponse stringify', error)
        try {
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
          }
          res.end(JSON.stringify({ error: 'Error inesperado al responder.' }))
        } catch (inner) {
          console.error('asJsonResponse end failed', inner)
        }
      }
    },
  }
}

/**
 * Vercel Node clasico: (req, res).
 * Runtime Web 2026: default.fetch(Request) o el primer argumento es Request.
 */
export function defineApiHandler(fn: ApiHandlerFn): ApiHandler {
  const runWeb = async (request: Request): Promise<Response> => {
    let status = 200
    let payload: unknown = {}
    const res: JsonResponse = {
      status(code) {
        status = code
        return this
      },
      json(body) {
        payload = body
      },
    }
    try {
      await fn(await webToNodeRequest(request), res)
    } catch (error) {
      console.error('api handler', error)
      status = 500
      payload = { error: 'Error inesperado.' }
    }
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const handler = (async (req: VercelRequestLike | Request, serverRes?: ServerResponse) => {
    if (isWebRequest(req)) return runWeb(req)
    if (serverRes && typeof serverRes.end === 'function') {
      const res = asJsonResponse(serverRes)
      try {
        return await fn(req, res)
      } catch (error) {
        console.error('api handler', error)
        return res.status(500).json({ error: 'Error inesperado.' })
      }
    }
    const maybeWeb = req as unknown as {
      url?: unknown
      headers?: { get?: unknown }
    }
    if (req && typeof maybeWeb.url === 'string' && typeof maybeWeb.headers?.get === 'function') {
      return runWeb(req as unknown as Request)
    }
    const res = asJsonResponse(serverRes)
    try {
      return await fn(req as VercelRequestLike, res)
    } catch (error) {
      console.error('api handler', error)
      return res.status(500).json({ error: 'Error inesperado.' })
    }
  }) as ApiHandler

  handler.fetch = runWeb
  return handler
}

export async function readRequestBody(req: VercelRequestLike): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body)
      } catch {
        return null
      }
    }
    return req.body
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function readStringEnv(name: string, fallback = '') {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
