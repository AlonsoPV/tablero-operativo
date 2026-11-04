/**
 * Interpreta texto dictado/escrito y devuelve borradores de acción estructurados.
 * Usa Gemini (mismo stack que /api/gemini-chat). Opcionalmente Claude si hay ANTHROPIC_API_KEY.
 */
import {
  defineApiHandler,
  readNumberEnv,
  readRequestBody,
  readStringEnv,
} from './_shared/http.js'
import { requireAssistantAuth } from './_shared/assistantAuth.js'
import { enableSystemCaCertificates } from './_shared/enableSystemCa.js'
import { isTlsCertificateError, TLS_CERTIFICATE_USER_MESSAGE } from './_shared/tlsError.js'

export type AssistantAudioIntent = 'plan_actions' | 'advisory'

export type ActionDraftPriority = 'P1_Alta' | 'P2_Media' | 'P3_Baja'

export type AssistantActionDraft = {
  title: string
  description: string
  objective: string
  evidenceExpected: string
  priority: ActionDraftPriority
  leanWaste: string
  eosComponent: string
  ownerHint: string | null
  dueDateHint: string | null
  activities: string[]
}

export type AssistantAudioResult = {
  transcript: string
  validation: {
    status: 'usable' | 'needs_more_context' | 'not_usable'
    summary: string
    missingPoints: string[]
    clarificationQuestions: string[]
  }
  interpretation: {
    executiveSummary: string
    signals: string[]
    risks: string[]
    opportunities: string[]
  }
  nextSteps: string[]
  actionDrafts: AssistantActionDraft[]
}

const MAX_TEXT_CHARS = 4000
const MAX_CONTEXT_CHARS = 6000
const MAX_CLARIFICATIONS_CHARS = 2000
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 2200
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_TIMEOUT_MS = 35000
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const EMPTY_RESULT = (transcript: string): AssistantAudioResult => ({
  transcript,
  validation: {
    status: 'not_usable',
    summary: 'No se pudo interpretar la nota.',
    missingPoints: [],
    clarificationQuestions: [],
  },
  interpretation: {
    executiveSummary: '',
    signals: [],
    risks: [],
    opportunities: [],
  },
  nextSteps: [],
  actionDrafts: [],
})

function buildSystemPrompt(intent: AssistantAudioIntent) {
  const modeRules =
    intent === 'advisory'
      ? `
MODO advisory:
- actionDrafts DEBE ser [].
- Da criterio ejecutivo, riesgos y preguntas de aclaracion.
- No propongas crear tareas nuevas; solo asesora.
`.trim()
      : `
MODO plan_actions:
- El usuario pide crear trabajo (accion, iniciativa, objetivo, KR o medicion).
- SIEMPRE genera 1 actionDraft para APROBACION si hay al menos un resultado o titulo usable. No esperes datos perfectos.
- Usa solo lo dicho. Completa description/objective/evidenceExpected/activities con lo disponible, corto y honesto.
- No inventes clientes, fechas, KPIs ni responsables. Si no vinieron, dueDateHint = null y listalo en missingPoints.
- dueDateHint: YYYY-MM-DD o YYYY-MM-DD HH:mm. Si el usuario dio fecha, copiala. Si dijo un dia de la semana, usa el calendario de hoy (ese dia o el proximo). Nunca asumas otro dia.
- Si hay aclaraciones, aplicalas al MISMO draft (corrige fecha/titulo/responsable). No armes otra accion.
- Si el usuario dio fecha, NO la pongas en missingPoints.
- validation.status = usable si hay titulo. Si faltan datos, usa needs_more_context PERO IGUAL incluye actionDrafts.
- missingPoints: lo que debe validar. Maximo 4.
- clarificationQuestions: maximo 3, directas. Pide validar lo faltante; no bloquees la propuesta.
- Si pide objetivo/KR/medicion/iniciativa: se claro. Hoy se registra una accion (o iniciativa si hay KR). Propón el equivalente accionable para aprobar y pide lo minimo del otro elemento.
- executiveSummary: 1-2 frases. Formato: "Propuesta lista para aprobar: [titulo]. Fecha: [dueDateHint o sin fecha]. Valida: [faltantes]."
- nextSteps: maximo 3, concretos. Sin senales/riesgos/oportunidades salvo 1 critico.
- Si el Kanban ya tiene una tarea equivalente activa, no la dupliques; dilo en nextSteps y igual muestra el draft si el usuario insiste en crear.
`.trim()

  return `
Eres un asistente operativo del Tablero Operativo (Scrumban / EOS / Scaling Up).
Recibes una nota hablada o escrita ya transcrita (nunca audio crudo).
Responde SOLO JSON valido, sin markdown ni texto fuera del JSON.

Contexto tipico (puede venir concatenado):
- Entendimiento / memoria de negocio
- "Contexto del tablero Kanban actual." con acciones abiertas
- Notas manuales del usuario
- Aclaraciones a preguntas previas

${modeRules}

Schema exacto de respuesta:
{
  "transcript": "eco del texto recibido",
  "validation": {
    "status": "usable | needs_more_context | not_usable",
    "summary": "string",
    "missingPoints": ["string"],
    "clarificationQuestions": ["string"]
  },
  "interpretation": {
    "executiveSummary": "string",
    "signals": ["string"],
    "risks": ["string"],
    "opportunities": ["string"]
  },
  "nextSteps": ["string"],
  "actionDrafts": [
    {
      "title": "string",
      "description": "string",
      "objective": "string",
      "evidenceExpected": "string",
      "priority": "P1_Alta | P2_Media | P3_Baja",
      "leanWaste": "string",
      "eosComponent": "string",
      "ownerHint": null,
      "dueDateHint": null,
      "activities": ["string"]
    }
  ]
}

Reglas:
- Espanol claro y ejecutivo.
- No uses markdown.
- Si el texto es ruido o vacio: not_usable.
- nextSteps: maximo 5, concretos.
`.trim()
}

function clip(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asStringArray(value: unknown, maxItems = 8, maxLen = 240): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLen))
}

function normalizePriority(value: unknown): ActionDraftPriority {
  if (value === 'P1_Alta' || value === 'P2_Media' || value === 'P3_Baja') return value
  if (value === 'P1_Critica') return 'P1_Alta'
  return 'P2_Media'
}

function normalizeDraft(raw: unknown): AssistantActionDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const draft = raw as Record<string, unknown>
  const title = clip(draft.title, 70)
  if (!title) return null
  const activities = asStringArray(draft.activities, 5, 180)
  return {
    title,
    description: clip(draft.description, 800) || title,
    objective: clip(draft.objective, 400),
    evidenceExpected: clip(draft.evidenceExpected, 400),
    priority: normalizePriority(draft.priority),
    leanWaste: clip(draft.leanWaste, 120),
    eosComponent: clip(draft.eosComponent, 120),
    ownerHint: clip(draft.ownerHint, 120) || null,
    dueDateHint: clip(draft.dueDateHint, 80) || null,
    activities,
  }
}

function normalizeResult(parsed: unknown, transcript: string, intent: AssistantAudioIntent): AssistantAudioResult {
  if (!parsed || typeof parsed !== 'object') return EMPTY_RESULT(transcript)
  const raw = parsed as Record<string, unknown>
  const validationRaw =
    raw.validation && typeof raw.validation === 'object'
      ? (raw.validation as Record<string, unknown>)
      : {}
  const interpretationRaw =
    raw.interpretation && typeof raw.interpretation === 'object'
      ? (raw.interpretation as Record<string, unknown>)
      : {}

  let status = clip(validationRaw.status, 40)
  if (status !== 'usable' && status !== 'needs_more_context' && status !== 'not_usable') {
    status = 'needs_more_context'
  }

  let actionDrafts =
    intent === 'advisory'
      ? []
      : (Array.isArray(raw.actionDrafts) ? raw.actionDrafts : [])
          .map(normalizeDraft)
          .filter((draft): draft is AssistantActionDraft => Boolean(draft))
          .slice(0, 3)

  if (status === 'not_usable') {
    actionDrafts = []
  } else if (intent === 'plan_actions' && actionDrafts.length === 0) {
    status = 'needs_more_context'
  }

  return {
    transcript: clip(raw.transcript, MAX_TEXT_CHARS) || transcript,
    validation: {
      status: status as AssistantAudioResult['validation']['status'],
      summary: clip(validationRaw.summary, 400) || 'Sin resumen de validacion.',
      missingPoints: asStringArray(validationRaw.missingPoints, 6),
      clarificationQuestions: asStringArray(validationRaw.clarificationQuestions, 5),
    },
    interpretation: {
      executiveSummary: clip(interpretationRaw.executiveSummary, 800),
      signals: asStringArray(interpretationRaw.signals, 6),
      risks: asStringArray(interpretationRaw.risks, 6),
      opportunities: asStringArray(interpretationRaw.opportunities, 6),
    },
    nextSteps: asStringArray(raw.nextSteps, 5),
    actionDrafts,
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('Respuesta no JSON')
  }
}

async function callGemini(system: string, user: string, signal: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('missing_gemini')

  const model = readStringEnv('GEMINI_MODEL', DEFAULT_GEMINI_MODEL).replace(/^models\//, '')
  const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: readNumberEnv('ASSISTANT_AUDIO_MAX_TOKENS', DEFAULT_MAX_TOKENS),
        temperature: readNumberEnv('GEMINI_TEMPERATURE', DEFAULT_TEMPERATURE),
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('assistant-audio Gemini error', response.status, errorText.slice(0, 400))
    throw new Error(`gemini_${response.status}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('')
    .trim()
  if (!text) throw new Error('gemini_empty')
  return text
}

function providerCode(error: unknown) {
  return error instanceof Error ? error.message : ''
}

function isCapacityError(error: unknown) {
  const code = providerCode(error)
  return (
    code === 'gemini_429' ||
    code === 'gemini_503' ||
    code === 'gemini_500' ||
    code === 'claude_429' ||
    code === 'claude_503' ||
    code === 'claude_529'
  )
}

async function sleep(ms: number, signal: AbortSignal) {
  if (ms <= 0) return
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function callGeminiWithRetry(system: string, user: string, signal: AbortSignal) {
  let lastError: unknown
  for (const delayMs of [0, 800, 1800]) {
    try {
      if (delayMs) await sleep(delayMs, signal)
      return await callGemini(system, user, signal)
    } catch (error) {
      lastError = error
      const code = providerCode(error)
      if (code === 'gemini_429') break
      if (code !== 'gemini_503' && code !== 'gemini_500') throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('gemini_failed')
}

async function generateInterpretation(system: string, user: string, signal: AbortSignal) {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY)
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY)
  const preferClaude = readStringEnv('ASSISTANT_AUDIO_PROVIDER', '').toLowerCase() === 'claude'

  const tryClaude = () => callClaude(system, user, signal)
  const tryGemini = () => callGeminiWithRetry(system, user, signal)

  if (preferClaude && hasClaude) {
    try {
      return await tryClaude()
    } catch (error) {
      if (hasGemini && isCapacityError(error)) {
        console.warn('assistant-audio Claude saturado; usando Gemini')
        return await tryGemini()
      }
      throw error
    }
  }

  if (hasGemini) {
    try {
      return await tryGemini()
    } catch (error) {
      if (hasClaude && (isCapacityError(error) || providerCode(error) === 'gemini_empty')) {
        console.warn('assistant-audio Gemini saturado; usando Claude', providerCode(error))
        return await tryClaude()
      }
      throw error
    }
  }

  return tryClaude()
}

async function callClaude(system: string, user: string, signal: AbortSignal) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('missing_anthropic')

  const model = readStringEnv('CLAUDE_MODEL', DEFAULT_CLAUDE_MODEL)
  const fallback = readStringEnv('CLAUDE_FALLBACK_MODEL', '')
  const models = fallback && fallback !== model ? [model, fallback] : [model]

  let lastError: Error | null = null
  for (const candidate of models) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal,
      body: JSON.stringify({
        model: candidate,
        max_tokens: readNumberEnv('CLAUDE_MAX_TOKENS', DEFAULT_MAX_TOKENS),
        temperature: readNumberEnv('CLAUDE_TEMPERATURE', DEFAULT_TEMPERATURE),
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('assistant-audio Claude error', candidate, response.status, errorText.slice(0, 400))
      lastError = new Error(`claude_${response.status}`)
      continue
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>
    }
    const text = data.content
      ?.filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('')
      .trim()
    if (!text) {
      lastError = new Error('claude_empty')
      continue
    }
    return text
  }

  throw lastError ?? new Error('claude_failed')
}

export default defineApiHandler(async (req, res) => {
  enableSystemCaCertificates()

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const auth = await requireAssistantAuth(req, { requireAiModule: true })
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error })
    }

    const hasGemini = Boolean(process.env.GEMINI_API_KEY)
    const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY)
    if (!hasGemini && !hasClaude) {
      return res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY o ANTHROPIC_API_KEY en variables de entorno del servidor.',
      })
    }

    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }

    const payload = body as Record<string, unknown>
    const text = clip(payload.text, MAX_TEXT_CHARS)
    const context = clip(payload.context, MAX_CONTEXT_CHARS)
    const clarifications = clip(payload.clarifications, MAX_CLARIFICATIONS_CHARS)
    const intent: AssistantAudioIntent =
      payload.intent === 'advisory' ? 'advisory' : 'plan_actions'

    if (!text) {
      return res.status(400).json({ error: 'Debes enviar texto para interpretar.' })
    }

    const system = buildSystemPrompt(intent)
    const now = new Date()
    const ymd = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
    const weekday = now.toLocaleDateString('es-MX', {
      weekday: 'long',
      timeZone: 'America/Mexico_City',
    })
    const longDate = now.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Mexico_City',
    })
    const user = [
      `Calendario operativo: hoy es ${weekday} ${longDate} (${ymd}), zona America/Mexico_City.`,
      'Nota del usuario:',
      text,
      context ? `\nContexto operativo:\n${context}` : '',
      clarifications
        ? `\nAclaraciones del usuario (aplican al mismo trabajo, no crees otro):\n${clarifications}`
        : '',
      '\nDevuelve solo el JSON del schema.',
    ]
      .filter(Boolean)
      .join('\n')

    const controller = new AbortController()
    const timeoutMs = hasClaude
      ? Math.max(
          readNumberEnv('CLAUDE_TIMEOUT_MS', 60_000),
          readNumberEnv('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
        )
      : readNumberEnv('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let modelText: string
    try {
      modelText = await generateInterpretation(system, user, controller.signal)
    } finally {
      clearTimeout(timeout)
    }

    let parsed: unknown
    try {
      parsed = extractJsonObject(modelText)
    } catch {
      return res.status(502).json({
        error: 'El modelo no devolvio un JSON interpretable. Intenta de nuevo.',
      })
    }
    const result = normalizeResult(parsed, text, intent)
    return res.status(200).json({ result })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'La interpretacion tardo demasiado. Intenta con una nota mas concreta.',
      })
    }

    if (isTlsCertificateError(error)) {
      console.error('assistant-audio TLS error:', error)
      return res.status(502).json({ error: TLS_CERTIFICATE_USER_MESSAGE })
    }

    const code = providerCode(error)
    if (isCapacityError(error)) {
      return res.status(503).json({
        error:
          'Gemini esta saturado o sin cuota temporal. Reintento automatico no alcanzo; espera unos segundos e intenta de nuevo.',
      })
    }
    if (code.startsWith('gemini_') || code.startsWith('claude_')) {
      return res.status(502).json({
        error: 'El proveedor de IA rechazo la interpretacion. Revisa el modelo o intenta de nuevo.',
      })
    }

    console.error('assistant-audio error:', error)
    return res.status(500).json({
      error: 'Ocurrio un error inesperado al interpretar la nota.',
    })
  }
})
