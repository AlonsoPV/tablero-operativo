/** CORS para Edge Functions: allowlist de orígenes de la app. */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://scrumbanemx.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function allowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('CORS_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const appBase = (Deno.env.get('APP_BASE_URL') || Deno.env.get('APP_PUBLIC_URL') || '').replace(
    /\/+$/,
    ''
  )
  const list = [...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]
  if (appBase) list.push(appBase)
  return [...new Set(list)]
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')?.trim() || ''
  const allowed = allowedOrigins()
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept, x-dispatcher-secret, x-cron-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** @deprecated Prefer corsHeadersFor(req) para allowlist. */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': DEFAULT_ALLOWED_ORIGINS[0] || '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  const headers = req ? corsHeadersFor(req) : corsHeaders
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

/** Devuelve respuesta OPTIONS o null si debe continuar el handler. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) })
  }
  return null
}
