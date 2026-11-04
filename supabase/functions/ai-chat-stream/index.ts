// Kit inlined en cada Edge AI (Dashboard / --use-api solo sube index.ts).
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://scrumbanemx.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function allowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('CORS_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((v: string) => v.trim())
    .filter(Boolean)
  const appBase = (Deno.env.get('APP_BASE_URL') || Deno.env.get('APP_PUBLIC_URL') || '').replace(
    /\/+$/,
    ''
  )
  const list = [...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]
  if (appBase) list.push(appBase)
  return [...new Set(list)]
}

function corsHeadersFor(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin')?.trim() || ''
  const allowed = allowedOrigins()
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const corsHeaders = corsHeadersFor()

function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(req),
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) })
  }
  return null
}

async function requireAuthUser(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false as const, response: jsonResponse({ error: 'ConfiguraciÃ³n de servidor incompleta' }, 500, req) }
  }
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false as const, response: jsonResponse({ error: 'No autorizado' }, 401, req) }
  }
  const token = authHeader.slice(7)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data: userData, error: userError } = await adminClient.auth.getUser(token)
  if (userError || !userData.user) {
    return { ok: false as const, response: jsonResponse({ error: 'SesiÃ³n invÃ¡lida' }, 401, req) }
  }
  return { ok: true as const, data: { user: userData.user, token } }
}

async function requireAiWhatsappAccess(token: string, req?: Request): Promise<Response | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anon) {
    return jsonResponse({ error: 'ConfiguraciÃ³n de servidor incompleta' }, 500, req)
  }
  const userClient = createClient(supabaseUrl, anon, {
    global: {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await userClient.rpc('can_use_ai_whatsapp')
  if (error) {
    return jsonResponse(
      {
        error:
          'No se pudo validar acceso al asistente. Aplica la migracion can_use_ai_whatsapp o contacta a soporte.',
      },
      403,
      req
    )
  }
  if (data !== true) {
    return jsonResponse(
      { error: 'El Asistente IA solo esta disponible para el area OKRS y Super Admin.' },
      403,
      req
    )
  }
  return null
}

async function discardResponseBodySafe(res: Response): Promise<void> {
  try {
    await res.arrayBuffer()
  } catch {
    /* ignore */
  }
}

function jsonForFailedChatUpstream(upstreamStatus: number, req?: Request): Response {
  switch (upstreamStatus) {
    case 429:
      return jsonResponse({ error: 'Demasiadas solicitudes. Espera un momento e intÃ©ntalo de nuevo.' }, 429, req)
    case 402:
      return jsonResponse({ error: 'CrÃ©ditos de IA insuficientes. Revisa tu workspace.' }, 402, req)
    case 503:
      return jsonResponse({ error: 'El servicio de IA no estÃ¡ disponible temporalmente. Intenta mÃ¡s tarde.' }, 503, req)
    case 500:
      return jsonResponse({ error: 'Error interno en el proveedor de IA. Intenta de nuevo mÃ¡s tarde.' }, 502, req)
    default:
      return jsonResponse({ error: 'No se pudo completar la solicitud al servicio de IA.' }, 502, req)
  }
}

async function finalizeFailedGatewayInteraction(
  handlerName: string,
  gatewayRes: Response,
  req?: Request
): Promise<Response> {
  console.error(`[${handlerName}] chat_upstream_http_status=${gatewayRes.status}`)
  await discardResponseBodySafe(gatewayRes)
  return jsonForFailedChatUpstream(gatewayRes.status, req)
}

const LOVABLE_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const DEFAULT_LOVABLE_MODEL = 'google/gemini-3-flash-preview'
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const MAX_CHAT_MESSAGE_CHARS = 24_000
const MAX_CHAT_MESSAGES = 64

function resolveOpenAiCompatibleChatUrl(rawBase: string): string {
  const t = rawBase.replace(/\/$/, '')
  if (t.includes('/chat/completions')) return t
  if (/\/v1$/i.test(t)) return `${t}/chat/completions`
  return `${t}/v1/chat/completions`
}

function resolveChatBackend() {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')?.trim()
  if (lovableKey) {
    return {
      apiKey: lovableKey,
      baseUrl: LOVABLE_GATEWAY_URL,
      defaultModel:
        Deno.env.get('LOVABLE_AI_MODEL')?.trim() ||
        Deno.env.get('CHAT_DEFAULT_MODEL')?.trim() ||
        DEFAULT_LOVABLE_MODEL,
    }
  }
  const openAiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (openAiKey) {
    const rawBase = Deno.env.get('OPENAI_API_BASE_URL')?.trim()
    const baseUrl =
      rawBase && rawBase.length > 0 ? resolveOpenAiCompatibleChatUrl(rawBase) : OPENAI_CHAT_COMPLETIONS_URL
    return {
      apiKey: openAiKey,
      baseUrl,
      defaultModel:
        Deno.env.get('OPENAI_MODEL')?.trim() ||
        Deno.env.get('CHAT_DEFAULT_MODEL')?.trim() ||
        DEFAULT_OPENAI_MODEL,
    }
  }
  return null
}

function getLovableModel(): string {
  return resolveChatBackend()?.defaultModel ?? DEFAULT_LOVABLE_MODEL
}

async function lovableChatCompletion(payload: Record<string, unknown>, req?: Request): Promise<Response> {
  const backend = resolveChatBackend()
  if (!backend) {
    return jsonResponse({ error: 'El servicio de IA no estÃ¡ configurado en el servidor.' }, 503, req)
  }
  const model =
    typeof payload.model === 'string' && payload.model.length > 0 ? payload.model : backend.defaultModel
  return await fetch(backend.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${backend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, model }),
  })
}

type GatewayChatMessage = { role: string; content: string }

function normalizeMessages(raw: unknown): GatewayChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: GatewayChatMessage[] = []
  for (const m of raw) {
    if (m && typeof m === 'object' && 'role' in m && 'content' in m) {
      const role = String((m as { role: unknown }).role)
      const content = String((m as { content: unknown }).content ?? '')
      if (
        (role === 'user' || role === 'assistant' || role === 'system') &&
        content.length > 0 &&
        content.length <= MAX_CHAT_MESSAGE_CHARS
      ) {
        out.push({ role, content })
      }
    }
  }
  return out
}

function normalizeAndClampMessages(raw: unknown): GatewayChatMessage[] | null {
  const n = normalizeMessages(raw)
  if (n.length === 0 || n.length > MAX_CHAT_MESSAGES) return null
  return n
}

const SYSTEM_STREAM =
  'Asistente experto en procesos Order-to-Cash (O2C). Responde en español, de forma clara y profesional.'

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405, req)

  const auth = await requireAuthUser(req)
  if (!auth.ok) return auth.response
  const scope = await requireAiWhatsappAccess(auth.data.token, req)
  if (scope) return scope

  let body: { messages?: unknown }
  try {
    body = (await req.json()) as { messages?: unknown }
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido' }, 400, req)
  }

  const userMessages = normalizeMessages(body.messages)
  if (userMessages.length === 0) {
    return jsonResponse({ error: 'messages debe ser un arreglo no vacío de {role, content}' }, 400, req)
  }

  const gatewayRes = await lovableChatCompletion({
    messages: [{ role: 'system', content: SYSTEM_STREAM }, ...userMessages],
    stream: true,
    model: getLovableModel(),
  }, req)

  if (!gatewayRes.ok) return finalizeFailedGatewayInteraction('ai-chat-stream', gatewayRes, req)

  return new Response(gatewayRes.body, {
    headers: {
      ...corsHeadersFor(req),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})