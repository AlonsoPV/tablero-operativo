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

const SYSTEM_PROMPT =
  'Eres un diseñador instruccional experto en operaciones O2C. ' +
  'A partir del texto de un PDF, genera un quiz de evaluacion en espanol. ' +
  'Devuelve SOLO JSON valido con la forma {"quiz":[{"question":"...","type":"single","options":["...","...","...","..."],"correctIndex":0,"correctIndexes":[0]}]}. ' +
  'Cada pregunta debe tener 4 opciones. Usa type "single" para una sola correcta y type "multiple" cuando haya varias correctas. ' +
  'correctIndexes debe contener todos los indices correctos de 0 a 3; correctIndex debe ser el primer indice correcto.'

function parseQuiz(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const jsonText = fenced ?? trimmed
  return JSON.parse(jsonText)
}

function normalizeQuestion(q: unknown) {
  if (!q || typeof q !== 'object') return null
  const record = q as Record<string, unknown>
  const question = String(record.question ?? '').trim()
  const options = Array.isArray(record.options) ? record.options.map((o) => String(o).trim()).filter(Boolean) : []
  const rawCorrectIndexes = Array.isArray(record.correctIndexes) ? record.correctIndexes : [record.correctIndex]
  const correctIndexes = rawCorrectIndexes
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index <= 3)
    .sort((a, b) => a - b)
  const uniqueCorrectIndexes = [...new Set(correctIndexes)]
  if (!question || options.length !== 4 || uniqueCorrectIndexes.length === 0) return null
  const type = String(record.type ?? '').trim() === 'multiple' || uniqueCorrectIndexes.length > 1 ? 'multiple' : 'single'
  const normalizedCorrectIndexes = type === 'single' ? [uniqueCorrectIndexes[0]] : uniqueCorrectIndexes
  return { question, type, options, correctIndex: normalizedCorrectIndexes[0], correctIndexes: normalizedCorrectIndexes }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo no permitido' }, 405, req)

  const auth = await requireAuthUser(req)
  if (!auth.ok) return auth.response

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Configuracion incompleta' }, 500, req)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  const { data: profile } = await adminClient
    .from('usuarios')
    .select('rol')
    .eq('user_id', auth.data.user.id)
    .maybeSingle()

  if (String(profile?.rol ?? '').trim().toLowerCase() !== 'super_admin') {
    const { data: appRole } = await adminClient
      .from('user_roles')
      .select('app_role')
      .eq('user_id', auth.data.user.id)
      .maybeSingle()
    if (appRole?.app_role !== 'super_admin') {
      return jsonResponse({ error: 'Solo super admin puede generar quizzes de academia.' }, 403, req)
    }
  }

  let body: { title?: string; pdfText?: string; questionCount?: number }
  try {
    body = (await req.json()) as { title?: string; pdfText?: string; questionCount?: number }
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON invalido' }, 400, req)
  }

  const title = String(body.title ?? '').trim().slice(0, 160)
  const pdfText = String(body.pdfText ?? '').trim()
  const questionCount = Math.min(10, Math.max(3, Number(body.questionCount) || 5))
  if (pdfText.length < 500) {
    return jsonResponse({ error: 'No se pudo extraer suficiente texto del PDF para generar preguntas.' }, 400, req)
  }

  const userPrompt =
    `Titulo del modulo: ${title || 'Modulo de Academia O2C'}\n` +
    `Genera ${questionCount} preguntas.\n` +
    `Texto del PDF:\n${pdfText.slice(0, MAX_CHAT_MESSAGE_CHARS - 500)}`

  const gatewayRes = await lovableChatCompletion({
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  }, req)

  if (!gatewayRes.ok) return finalizeFailedGatewayInteraction('academy-generate-quiz', gatewayRes, req)

  const data = (await gatewayRes.json()) as { choices?: { message?: { content?: string } }[] }
  const reply = data.choices?.[0]?.message?.content ?? ''

  try {
    const parsed = parseQuiz(reply) as { quiz?: unknown[] }
    const quiz = (Array.isArray(parsed.quiz) ? parsed.quiz : [])
      .map(normalizeQuestion)
      .filter((q) => Boolean(q))
    if (quiz.length < 3) throw new Error('Quiz insuficiente')
    return jsonResponse({ quiz }, 200, req)
  } catch {
    return jsonResponse({ error: 'La IA no devolvio un quiz valido. Intenta generar de nuevo.' }, 502, req)
  }
})